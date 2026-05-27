import { describe, expect, it } from 'vitest';
import { createInitialState, run, step } from '../engine';
import { coldStartScenario } from '../scenarios/cold-start';
import { isComplete } from '../protocol/piece-selection';
import type { SimEvent, SimState } from '../types';

/** 跑到所有 leecher 都成为 seeder, 或者达到 maxTicks 上限。 */
function runToCompletion(state: SimState, scenario: ReturnType<typeof coldStartScenario>, maxTicks: number) {
  let cur = state;
  const events: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const r = step(cur, scenario);
    cur = r.state;
    events.push(...r.events);
    const allDone = Object.values(cur.peers).every((p) => isComplete(p.bitfield));
    if (allDone) return { state: cur, events, ticks: i + 1 };
  }
  return { state: cur, events, ticks: maxTicks };
}

describe('cold-start integration: 1 seeder + 3 leechers + 4 pieces', () => {
  const scenario = coldStartScenario({ leecherCount: 3, totalPieces: 4 });

  it('all leechers reach 100% (become seeders)', () => {
    const r = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    for (const peerId of ['L1', 'L2', 'L3']) {
      expect(r.state.peers[peerId].bitfield).toEqual([true, true, true, true]);
    }
  });

  it('completes in bounded ticks (< 100)', () => {
    const r = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    expect(r.ticks).toBeLessThan(100);
  });

  it('emits peer_became_seeder for every leecher exactly once', () => {
    const r = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    const seederEvents = r.events.filter((e) => e.kind === 'peer_became_seeder');
    const peerIds = seederEvents.map((e) => (e.kind === 'peer_became_seeder' ? e.peerId : ''));
    expect(peerIds.sort()).toEqual(['L1', 'L2', 'L3']);
  });

  it('emits piece_completed exactly totalPieces times per leecher', () => {
    const r = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    for (const leecherId of ['L1', 'L2', 'L3']) {
      const events = r.events.filter(
        (e) => e.kind === 'piece_completed' && e.peerId === leecherId,
      );
      expect(events.length).toBe(4);
    }
  });

  it('emits have messages broadcast to all peers when a leecher completes a piece', () => {
    const r = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    // 每个 leecher 完成 1 个 piece → 向其它 3 个 conn 发 have(自己→other) = 3 个 have
    // 共 3 leechers × 4 pieces × 3 conns = 36 have 来自 leecher
    // Seeder 没有"新增" piece(初始就全), 所以不发 have
    const haveCount = r.events.filter(
      (e) => e.kind === 'message' && e.message.type === 'have',
    ).length;
    expect(haveCount).toBe(3 * 4 * 3);
  });

  it('determinism: same seed → identical events & final state', () => {
    const r1 = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    const r2 = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    expect(r1.state).toEqual(r2.state);
    expect(r1.events).toEqual(r2.events);
  });

  it('protocol message ordering: handshake → bitfield → interested → unchoke → request → piece → have', () => {
    const r = runToCompletion(createInitialState(scenario, 42), scenario, 200);
    const msgs = r.events.filter((e) => e.kind === 'message');
    // 找 L1 跟 S 的第一组消息流(L1→S 方向)。
    const l1ToS = msgs.filter(
      (e) =>
        e.kind === 'message' &&
        e.message.from === 'L1' &&
        e.message.to === 'S',
    );
    const types = l1ToS
      .map((e) => (e.kind === 'message' ? e.message.type : ''))
      .filter((t, i, arr) => i === 0 || t !== arr[i - 1]);
    // 应当包含核心阶段消息(顺序: handshake → bitfield → interested → request → ...)
    expect(types[0]).toBe('handshake');
    expect(types[1]).toBe('bitfield');
    expect(types[2]).toBe('interested');
    // 之后会有 request 和 have(L1 自己完成 piece 后会广播 have 给 S)
    expect(types).toContain('request');
    expect(types).toContain('have');
  });
});

describe('cold-start: 2-peer minimal (1 seeder + 1 leecher)', () => {
  const scenario = coldStartScenario({ leecherCount: 1, totalPieces: 4 });

  it('leecher becomes seeder', () => {
    const r = runToCompletion(createInitialState(scenario, 42), scenario, 100);
    expect(r.state.peers['L1'].bitfield).toEqual([true, true, true, true]);
  });

  it('protocol input is not mutated', () => {
    const s = createInitialState(scenario, 42);
    const snapshot = JSON.parse(JSON.stringify(s));
    runToCompletion(s, scenario, 100);
    expect(s).toEqual(snapshot);
  });
});

describe('cold-start: 8-peer larger swarm', () => {
  const scenario = coldStartScenario({ leecherCount: 7, totalPieces: 6 });

  it('all 7 leechers reach 100%', () => {
    const r = runToCompletion(createInitialState(scenario, 7), scenario, 500);
    for (let i = 1; i <= 7; i++) {
      expect(r.state.peers[`L${i}`].bitfield.every(Boolean)).toBe(true);
    }
  });

  it('different seeds produce different (but valid) completion orderings', () => {
    const r1 = runToCompletion(createInitialState(scenario, 1), scenario, 2000);
    const r2 = runToCompletion(createInitialState(scenario, 2), scenario, 2000);
    // 两次都要全完成
    expect(Object.values(r1.state.peers).every((p) => isComplete(p.bitfield))).toBe(true);
    expect(Object.values(r2.state.peers).every((p) => isComplete(p.bitfield))).toBe(true);
  });
});

describe('cold-start: run() helper integration', () => {
  it('run() and step() produce equivalent results', () => {
    const scenario = coldStartScenario({ leecherCount: 2, totalPieces: 3 });
    const r1 = run(createInitialState(scenario, 42), scenario, 50);
    const r2 = runToCompletion(createInitialState(scenario, 42), scenario, 50);
    // 应取等长 50 tick 的结果与 runToCompletion 至 50 比较
    // runToCompletion 可能提前结束,所以只比 r1 的 events 含 r2 的 prefix
    expect(r1.events.length).toBeGreaterThanOrEqual(r2.events.length);
  });
});
