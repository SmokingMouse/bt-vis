/**
 * Choking 算法: tit-for-tat reciprocation + optimistic unchoke。
 *
 * 周期:
 *  - RECIP_INTERVAL (= 10 tick): 重新评估每个 peer 的 unchoke set
 *  - OPT_INTERVAL (= 30 tick): 额外多 unchoke 1 个 optimistic peer
 *
 * Reciprocation 规则 (per peer P):
 *  - 候选集: 所有 P→other 中, other 对 P 感兴趣的 conn (reverseConn.amInterested)
 *  - 排序: conn(P→other).piecesReceived 降序(我从 other 收到的 piece 多者优先)
 *  - 决策: top-K (K=3) → unchoke, 其余 → choke
 *
 * Optimistic Unchoke:
 *  - 当 isOptTick, 从 top-K 之外的候选中随机抽 1 个加入 unchoke set
 *  - 用 PRNG (mulberry32) 保证 deterministic
 *
 * 首次触发时机:
 *  - tick 4 (handshake 在 1, bitfield 2, interest 3 之后)
 *  - 后续每 RECIP_INTERVAL 一次
 */

import {
  type Connection,
  type SimEvent,
  type SimState,
  connKey,
} from '../types';
import { nextInt } from '../engine';

const RECIP_INTERVAL = 10;
const OPT_INTERVAL = 30;
const TOP_K = 3;
const FIRST_TICK = 4;

export interface ChokingResult {
  readonly connections: Record<string, Connection>;
  readonly rngState: number;
  readonly events: readonly SimEvent[];
}

function shouldRunReciprocation(nextTick: number): boolean {
  if (nextTick < FIRST_TICK) return false;
  return (nextTick - FIRST_TICK) % RECIP_INTERVAL === 0;
}

function shouldRunOptimistic(nextTick: number): boolean {
  if (!shouldRunReciprocation(nextTick)) return false;
  return (nextTick - FIRST_TICK) % OPT_INTERVAL === 0;
}

export function stepChokingPhase(state: SimState, nextTick: number): ChokingResult {
  if (!shouldRunReciprocation(nextTick)) {
    return { connections: state.connections, rngState: state.rngState, events: [] };
  }

  const isOpt = shouldRunOptimistic(nextTick);
  const newConns: Record<string, Connection> = { ...state.connections };
  const events: SimEvent[] = [];
  let rngState = state.rngState;

  // 按 peerId 字典序遍历, 保 deterministic。
  for (const peerId of Object.keys(state.peers).sort()) {
    // 找到我所有 outgoing conn keys (我=peerId 是 from)
    const myOutgoingKeys: string[] = [];
    for (const k of Object.keys(state.connections).sort()) {
      if (state.connections[k].from === peerId) myOutgoingKeys.push(k);
    }

    // 候选: 对方对我感兴趣
    const candidates = myOutgoingKeys.filter((k) => {
      const c = state.connections[k];
      const rev = state.connections[connKey(c.to, c.from)];
      return rev.state.amInterested;
    });

    // 按 piecesReceived 降序; tie-break 用 conn.to 字典序升序保 deterministic。
    candidates.sort((a, b) => {
      const ca = state.connections[a];
      const cb = state.connections[b];
      const diff = cb.state.piecesReceived - ca.state.piecesReceived;
      if (diff !== 0) return diff;
      return ca.to.localeCompare(cb.to);
    });

    const topK = candidates.slice(0, TOP_K);
    const restChokeable = candidates.slice(TOP_K);

    let optimisticPick: string | null = null;
    if (isOpt && restChokeable.length > 0) {
      const r = nextInt(rngState, restChokeable.length);
      rngState = r.next;
      optimisticPick = restChokeable[r.value];
    }

    const shouldUnchoke = new Set<string>([...topK]);
    if (optimisticPick) shouldUnchoke.add(optimisticPick);

    // 对所有 outgoing conn 决定 choke/unchoke。
    // 非候选的 (对方不 interested) → 保持当前状态(避免无谓抖动)。
    for (const k of myOutgoingKeys) {
      const c = state.connections[k];
      const rev = state.connections[connKey(c.to, c.from)];
      const isCandidate = rev.state.amInterested;
      if (!isCandidate) continue; // 对方不 interested, 维持现状

      const wasChoking = c.state.amChoking;
      const willUnchoke = shouldUnchoke.has(k);

      if (wasChoking && willUnchoke) {
        newConns[k] = { ...c, state: { ...c.state, amChoking: false } };
        events.push({
          tick: nextTick,
          kind: 'message',
          message: { type: 'unchoke', from: c.from, to: c.to },
        });
      } else if (!wasChoking && !willUnchoke) {
        newConns[k] = { ...c, state: { ...c.state, amChoking: true } };
        events.push({
          tick: nextTick,
          kind: 'message',
          message: { type: 'choke', from: c.from, to: c.to },
        });
      }
    }
  }

  return { connections: newConns, rngState, events };
}
