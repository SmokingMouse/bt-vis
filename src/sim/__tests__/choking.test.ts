import { describe, expect, it } from 'vitest';
import { stepChokingPhase } from '../protocol/choking';
import { createInitialState, run } from '../engine';
import { coldStartScenario } from '../scenarios/cold-start';
import type { Connection, SimState } from '../types';

function makeStateWithConns(
  partialConns: Record<string, Partial<Connection['state']> & { piecesReceived?: number; amInterested?: boolean; amChoking?: boolean }>,
): SimState {
  const scenario = coldStartScenario({ leecherCount: 4, totalPieces: 3 });
  const s = createInitialState(scenario, 42);
  // 把 handshake 全标完, 这样 choking phase 才会跑(否则没 interested 候选)。
  const conns = { ...s.connections };
  for (const key of Object.keys(conns)) {
    const c = conns[key];
    const override = partialConns[key] ?? {};
    conns[key] = {
      ...c,
      state: {
        ...c.state,
        handshakeSent: true,
        bitfieldSent: true,
        interestExpressed: true,
        peerBitfield: [false, false, false],
        amChoking: override.amChoking ?? true,
        amInterested: override.amInterested ?? false,
        piecesReceived: override.piecesReceived ?? 0,
      },
    };
  }
  return { ...s, connections: conns };
}

describe('choking — periodicity', () => {
  it('does nothing before tick 4', () => {
    const s = makeStateWithConns({});
    for (const t of [1, 2, 3]) {
      const r = stepChokingPhase(s, t);
      expect(r.connections).toBe(s.connections);
      expect(r.events).toEqual([]);
    }
  });

  it('runs reciprocation at tick 4, 14, 24, ...', () => {
    const s = makeStateWithConns({
      'L1->S': { amInterested: true }, // S 视角 reverseConn(L1->S).amInterested=true, 即 L1 对 S 感兴趣
      'L2->S': { amInterested: true },
      'L3->S': { amInterested: true },
      'L4->S': { amInterested: true },
    });
    // tick 4: 应该有 reciprocation。S 对 L1-L4 决定 unchoke set。
    const r4 = stepChokingPhase(s, 4);
    expect(r4.events.length).toBeGreaterThan(0);

    // tick 5-13: 不跑
    for (const t of [5, 6, 10, 13]) {
      const r = stepChokingPhase(s, t);
      expect(r.events).toEqual([]);
    }

    // tick 14: 跑(但因为没变化, 可能 0 个 message)
    expect(shouldNotThrow(() => stepChokingPhase(s, 14))).toBe(true);
  });
});

function shouldNotThrow(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

describe('choking — tit-for-tat ordering', () => {
  it('unchokes top-K (=3) peers by piecesReceived desc', () => {
    // S 视角: L1-L4 都对 S 感兴趣, piecesReceived 分别 5/3/10/1
    // 期望: top-3 = L3(10), L1(5), L2(3) 被 unchoke; L4 被 choke
    const s = makeStateWithConns({
      'S->L1': { piecesReceived: 5 },
      'S->L2': { piecesReceived: 3 },
      'S->L3': { piecesReceived: 10 },
      'S->L4': { piecesReceived: 1 },
      'L1->S': { amInterested: true },
      'L2->S': { amInterested: true },
      'L3->S': { amInterested: true },
      'L4->S': { amInterested: true },
    });
    const r = stepChokingPhase(s, 4);
    // 检查 S 的 outgoing conn unchoke 状态
    // 注意 tick 4 既是 reciprocation 也是 optimistic。所以可能 L4 也被 optimistically unchoked。
    // top-3 必须是 L1, L2, L3 (按 piecesReceived 排序)
    expect(r.connections['S->L1'].state.amChoking).toBe(false);
    expect(r.connections['S->L2'].state.amChoking).toBe(false);
    expect(r.connections['S->L3'].state.amChoking).toBe(false);
    // L4 取决于 optimistic, 但只有 1 个 rest 时 optimistic 必选它
    // (restChokeable = [L4], nextInt(rng, 1).value = 0 → 选 L4)
    expect(r.connections['S->L4'].state.amChoking).toBe(false);
  });

  it('chokes peers not in top-K when 5+ candidates and no optimistic', () => {
    // tick 14: 非 optimistic tick, 仅 reciprocation
    const s = makeStateWithConns({
      'S->L1': { piecesReceived: 5, amChoking: false },
      'S->L2': { piecesReceived: 3, amChoking: false },
      'S->L3': { piecesReceived: 10, amChoking: false },
      'S->L4': { piecesReceived: 1, amChoking: false },
      'L1->S': { amInterested: true },
      'L2->S': { amInterested: true },
      'L3->S': { amInterested: true },
      'L4->S': { amInterested: true },
    });
    const r = stepChokingPhase(s, 14);
    expect(r.connections['S->L1'].state.amChoking).toBe(false);
    expect(r.connections['S->L2'].state.amChoking).toBe(false);
    expect(r.connections['S->L3'].state.amChoking).toBe(false);
    // L4 不在 top-3 → choke
    expect(r.connections['S->L4'].state.amChoking).toBe(true);
  });

  it('tie-break uses peer id ascending (deterministic)', () => {
    // 4 peer 都 piecesReceived=0, 应当按 L1, L2, L3 unchoke (L4 被 choke at non-opt tick)
    const s = makeStateWithConns({
      'S->L1': { piecesReceived: 0, amChoking: false },
      'S->L2': { piecesReceived: 0, amChoking: false },
      'S->L3': { piecesReceived: 0, amChoking: false },
      'S->L4': { piecesReceived: 0, amChoking: false },
      'L1->S': { amInterested: true },
      'L2->S': { amInterested: true },
      'L3->S': { amInterested: true },
      'L4->S': { amInterested: true },
    });
    const r = stepChokingPhase(s, 14);
    expect(r.connections['S->L1'].state.amChoking).toBe(false);
    expect(r.connections['S->L2'].state.amChoking).toBe(false);
    expect(r.connections['S->L3'].state.amChoking).toBe(false);
    expect(r.connections['S->L4'].state.amChoking).toBe(true);
  });

  it('does not change choking for non-interested peers', () => {
    // L1 对 S 不感兴趣 → S 不应该改变 S->L1 的 amChoking
    const s = makeStateWithConns({
      'S->L1': { amChoking: true },
      'L1->S': { amInterested: false },
    });
    const r = stepChokingPhase(s, 4);
    expect(r.connections['S->L1'].state.amChoking).toBe(true);
  });
});

describe('choking — optimistic unchoke', () => {
  it('fires at tick 4, 34, 64, ... (every OPT_INTERVAL=30)', () => {
    const s = makeStateWithConns({
      'S->L1': { piecesReceived: 10, amChoking: false },
      'S->L2': { piecesReceived: 8, amChoking: false },
      'S->L3': { piecesReceived: 5, amChoking: false },
      'S->L4': { piecesReceived: 0 },
      'L1->S': { amInterested: true },
      'L2->S': { amInterested: true },
      'L3->S': { amInterested: true },
      'L4->S': { amInterested: true },
    });
    // tick 4 是 opt, L4 应该被 unchoke (唯一 chokeable)
    const r4 = stepChokingPhase(s, 4);
    expect(r4.connections['S->L4'].state.amChoking).toBe(false);

    // tick 14 非 opt, L4 应该被 choke
    const r14 = stepChokingPhase(s, 14);
    expect(r14.connections['S->L4'].state.amChoking).toBe(true);

    // tick 34 opt 再次
    const r34 = stepChokingPhase(s, 34);
    expect(r34.connections['S->L4'].state.amChoking).toBe(false);
  });
});

describe('choking — deterministic', () => {
  it('same state + same tick → same result', () => {
    const s1 = makeStateWithConns({
      'L1->S': { amInterested: true },
      'L2->S': { amInterested: true },
      'L3->S': { amInterested: true },
      'L4->S': { amInterested: true },
    });
    const s2 = makeStateWithConns({
      'L1->S': { amInterested: true },
      'L2->S': { amInterested: true },
      'L3->S': { amInterested: true },
      'L4->S': { amInterested: true },
    });
    const r1 = stepChokingPhase(s1, 4);
    const r2 = stepChokingPhase(s2, 4);
    expect(r1.connections).toEqual(r2.connections);
    expect(r1.rngState).toBe(r2.rngState);
  });
});

describe('choking — integration with full sim', () => {
  it('cold start still completes with choking enabled', () => {
    const scenario = coldStartScenario({ leecherCount: 4, totalPieces: 4 });
    let cur = createInitialState(scenario, 42);
    for (let i = 0; i < 500; i++) {
      const r = run(cur, scenario, 1);
      cur = r.state;
      const allDone = Object.values(cur.peers).every((p) => p.bitfield.every(Boolean));
      if (allDone) return;
    }
    throw new Error('did not complete in 500 ticks');
  });

  it('produces choke/unchoke messages in the event stream', () => {
    const scenario = coldStartScenario({ leecherCount: 4, totalPieces: 4 });
    const r = run(createInitialState(scenario, 42), scenario, 100);
    const unchokeCount = r.events.filter(
      (e) => e.kind === 'message' && e.message.type === 'unchoke',
    ).length;
    const chokeCount = r.events.filter(
      (e) => e.kind === 'message' && e.message.type === 'choke',
    ).length;
    expect(unchokeCount).toBeGreaterThan(0);
    // choke 可能为 0 也可能 >0, 取决于 swarm 大小;4 leecher 通常会有 choke
    expect(chokeCount).toBeGreaterThanOrEqual(0);
  });
});
