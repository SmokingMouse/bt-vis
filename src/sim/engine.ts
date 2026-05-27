/**
 * BT 协议示意级 sim 引擎。
 *
 * 核心契约:
 * - step(state, scenario) → { state', events[] } 是纯函数
 *   不读 Date.now()、不调 Math.random()，所有随机性走 SimState.rngState。
 * - 同 (seed, scenario) → 任意 tick 状态完全一致（structurally equal）。
 * - 事件按 tick 单调递增，本 tick 产生的事件全在返回的 events 数组里。
 *
 * 当前阶段（Week 1 D1-2）只搭骨架：
 *   - tick 推进、PRNG 推进、初始化 peers/connections
 *   - 抛 peer_joined / connection_opened 事件
 *   - 协议状态机（handshake/bitfield/选片/choking）尚未实现，留作 D3+
 */

import {
  type Bitfield,
  type Connection,
  type ConnectionState,
  type Peer,
  type PeerId,
  type Scenario,
  type SimEvent,
  type SimState,
  connKey,
} from './types';
import { stepHandshakePhase } from './protocol/handshake';
import { stepChokingPhase } from './protocol/choking';
import { stepTransferPhase } from './protocol/transfer';

// ── Deterministic PRNG (mulberry32, 纯函数风格)──────────────────────────

/**
 * 推进 PRNG 状态一步,返回 (新状态, [0,1) 随机数)。
 * 算法: mulberry32。状态是 int32,可塞进 SimState 里序列化。
 */
export function nextRandom(rngState: number): { next: number; value: number } {
  const next = (rngState + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { next, value };
}

/** 从 [0, n) 中取一个整数,推进 PRNG。 */
export function nextInt(rngState: number, n: number): { next: number; value: number } {
  const { next, value } = nextRandom(rngState);
  return { next, value: Math.floor(value * n) };
}

// ── 状态初始化 ──────────────────────────────────────────────────────────

function makeBitfield(totalPieces: number, owned: readonly number[]): Bitfield {
  const bf = new Array(totalPieces).fill(false);
  for (const p of owned) {
    if (p >= 0 && p < totalPieces) bf[p] = true;
  }
  return bf;
}

function makeConnState(): ConnectionState {
  // BT 协议规范: 连接建立后双方默认 choked + not interested,
  // 且 handshake/bitfield/interest 都还未发出。
  return {
    amChoking: true,
    amInterested: false,
    handshakeSent: false,
    bitfieldSent: false,
    peerBitfield: null,
    interestExpressed: false,
    piecesReceived: 0,
  };
}

/**
 * 从 Scenario 构造初始 SimState。tick = 0,连接和 peer 都不抛事件
 * (事件在 step(0→1) 时按规则抛出,以保持"事件 tick ≥ 1"的语义)。
 */
export function createInitialState(scenario: Scenario, seed: number): SimState {
  const peers: Record<PeerId, Peer> = {};
  for (const cfg of scenario.peers) {
    peers[cfg.id] = {
      id: cfg.id,
      bitfield: makeBitfield(scenario.torrent.totalPieces, cfg.initialPieces),
      uploadCapacity: cfg.uploadCapacity,
      downloadCapacity: cfg.downloadCapacity,
    };
  }

  const connections: Record<string, Connection> = {};
  for (const [a, b] of scenario.initialConnections ?? []) {
    connections[connKey(a, b)] = { from: a, to: b, state: makeConnState(), pendingRequests: [] };
    connections[connKey(b, a)] = { from: b, to: a, state: makeConnState(), pendingRequests: [] };
  }

  return {
    tick: 0,
    seed,
    rngState: seed | 0,
    torrent: scenario.torrent,
    peers,
    connections,
  };
}

// ── 单步推进 ────────────────────────────────────────────────────────────

export interface StepResult {
  readonly state: SimState;
  readonly events: readonly SimEvent[];
}

/**
 * 推进一个 tick。
 *
 * 阶段:
 *  - tick = 1: 抛 peer_joined / connection_opened 初始事件(网络就绪);
 *              同时启动 handshake 阶段(各 conn 发出第一条 handshake)。
 *  - tick ≥ 2: 推进 handshake/bitfield/interest 阶段(每 conn 每 tick 推进至多一阶段)。
 *
 * 这个函数是纯函数: 不变 input,返回新 state + 本 tick 事件。
 */
export function step(state: SimState, _scenario: Scenario): StepResult {
  const nextTick = state.tick + 1;
  // 推进一次 PRNG,确保后续协议逻辑接入时随机性是确定的。
  const { next: nextRng } = nextRandom(state.rngState);

  const events: SimEvent[] = [];

  // tick 1 的初始事件: peer_joined / connection_opened。
  if (nextTick === 1) {
    for (const peerId of Object.keys(state.peers)) {
      events.push({ tick: nextTick, kind: 'peer_joined', peerId });
    }
    for (const key of Object.keys(state.connections)) {
      const c = state.connections[key];
      // 只抛 a→b 方向避免重复;b→a 视作同一条物理连接的反向 view。
      if (c.from < c.to) {
        events.push({ tick: nextTick, kind: 'connection_opened', from: c.from, to: c.to });
      }
    }
  }

  // 协议阶段推进(handshake / bitfield / interest)。
  const hs = stepHandshakePhase(state, nextTick);
  events.push(...hs.events);

  const afterHs: SimState = {
    ...state,
    tick: nextTick,
    rngState: nextRng,
    connections: hs.connections,
  };

  // Choking 阶段(tit-for-tat + optimistic unchoke; 周期性触发)。
  const ch = stepChokingPhase(afterHs, nextTick);
  events.push(...ch.events);
  const afterCh: SimState = {
    ...afterHs,
    connections: ch.connections,
    rngState: ch.rngState,
  };

  // Transfer 阶段(request / piece / have)。
  const tr = stepTransferPhase(afterCh, nextTick);
  events.push(...tr.events);

  const nextState: SimState = {
    ...afterCh,
    connections: tr.connections,
    peers: tr.peers,
  };

  return { state: nextState, events };
}

/**
 * 一次跑 n 个 tick,返回最终状态 + 累积事件。
 * 便于测试和"快进"按钮。
 */
export function run(state: SimState, scenario: Scenario, ticks: number): StepResult {
  let cur = state;
  const allEvents: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = step(cur, scenario);
    cur = r.state;
    allEvents.push(...r.events);
  }
  return { state: cur, events: allEvents };
}
