/**
 * Handshake → Bitfield → Interest 阶段的状态机。
 *
 * 设计要点:
 * - 每 tick 每个 directed connection 最多推进 *一个* 阶段
 *   (handshake → bitfield → interested/not_interested)。
 *   节奏稳定,UI 动画好做,协议消息一条一条出现。
 * - "snapshot-based batch update": 先用 tick 开始时的 state 决定所有 conn 的下一步,
 *   再批量应用更新。这样迭代顺序不影响结果(deterministic)。
 * - handshake_complete 事件: 双向 handshake 都完成的那一 tick 抛一次。
 *
 * 协议忠实度:
 * - 一个 peer 对"对方持有什么"的认知来自收到的 bitfield 消息,
 *   存在 conn.peerBitfield。不直接读 peers[to].bitfield(虽然 sim 同进程,
 *   但语义上算"作弊",会让可视化丧失协议层次)。
 */

import {
  type Bitfield,
  type Connection,
  type ConnectionState,
  type Message,
  type PeerId,
  type SimEvent,
  type SimState,
  connKey,
} from '../types';

/**
 * 检查 from 是否对 peerBitfield 持有的 piece 有兴趣
 * (即存在某个 piece, peerBitfield 有而 fromBitfield 没有)。
 */
function hasMissing(fromBitfield: Bitfield, peerBitfield: Bitfield): boolean {
  for (let i = 0; i < fromBitfield.length; i++) {
    if (peerBitfield[i] && !fromBitfield[i]) return true;
  }
  return false;
}

interface ConnAction {
  readonly key: string;
  readonly message: Message;
  readonly connUpdates: Partial<ConnectionState>;
  /** 在 reverse conn 上的更新(用于"对方收到我的 bitfield"的认知传播)。 */
  readonly reverseKey?: string;
  readonly reverseUpdates?: Partial<ConnectionState>;
}

/**
 * 决定单个 directed connection 在本 tick 应该执行什么动作。
 * 不修改 state,只返回 action 描述。
 */
function decideAction(state: SimState, key: string): ConnAction | null {
  const conn = state.connections[key];
  const cs = conn.state;
  const reverse = state.connections[connKey(conn.to, conn.from)];
  const fromPeer = state.peers[conn.from];

  // Stage 1: send handshake
  if (!cs.handshakeSent) {
    return {
      key,
      message: { type: 'handshake', from: conn.from, to: conn.to },
      connUpdates: { handshakeSent: true },
    };
  }

  // Stage 2: send bitfield (after BOTH sides have sent handshake)
  if (!cs.bitfieldSent && reverse.state.handshakeSent) {
    return {
      key,
      message: {
        type: 'bitfield',
        from: conn.from,
        to: conn.to,
        bitfield: fromPeer.bitfield,
      },
      connUpdates: { bitfieldSent: true },
      reverseKey: connKey(conn.to, conn.from),
      // 对方收到我的 bitfield → 写入对方的 peerBitfield 认知。
      // 注意: 拷贝一份避免共享引用(若 fromPeer.bitfield 之后被修改,认知会被污染)。
      reverseUpdates: { peerBitfield: [...fromPeer.bitfield] },
    };
  }

  // Stage 3: express interest (after receiving peer's bitfield)
  if (!cs.interestExpressed && cs.peerBitfield !== null) {
    const interested = hasMissing(fromPeer.bitfield, cs.peerBitfield);
    return {
      key,
      message: interested
        ? { type: 'interested', from: conn.from, to: conn.to }
        : { type: 'not_interested', from: conn.from, to: conn.to },
      connUpdates: { interestExpressed: true, amInterested: interested },
    };
  }

  return null;
}

export interface PhaseResult {
  readonly connections: Record<string, Connection>;
  readonly events: readonly SimEvent[];
}

/**
 * 推进所有 connection 一个 tick 的 handshake/bitfield/interest 阶段。
 * 返回新 connections + 本 tick 抛出的事件。
 *
 * 注意: 返回新的 connections 字典,engine.step 负责把它合并进 SimState。
 */
export function stepHandshakePhase(state: SimState, nextTick: number): PhaseResult {
  // 字典序遍历保证 deterministic。
  const keys = Object.keys(state.connections).sort();
  const actions: ConnAction[] = [];
  for (const key of keys) {
    const a = decideAction(state, key);
    if (a) actions.push(a);
  }

  // 合并 updates 到 new connections。
  const merged: Record<string, Connection> = { ...state.connections };
  for (const a of actions) {
    merged[a.key] = {
      ...merged[a.key],
      state: { ...merged[a.key].state, ...a.connUpdates },
    };
    if (a.reverseKey && a.reverseUpdates) {
      merged[a.reverseKey] = {
        ...merged[a.reverseKey],
        state: { ...merged[a.reverseKey].state, ...a.reverseUpdates },
      };
    }
  }

  const events: SimEvent[] = [];
  for (const a of actions) {
    events.push({ tick: nextTick, kind: 'message', message: a.message });
  }

  // 扫描 handshake_complete: 本 tick 双向 handshakeSent 从"非全 true"变成"全 true"。
  const seenPairs = new Set<string>();
  for (const key of Object.keys(merged)) {
    const c = merged[key];
    if (c.from >= c.to) continue;
    const pairKey = `${c.from}|${c.to}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const rev = merged[connKey(c.to, c.from)];
    const wasComplete =
      state.connections[key].state.handshakeSent &&
      state.connections[connKey(c.to, c.from)].state.handshakeSent;
    const isComplete = c.state.handshakeSent && rev.state.handshakeSent;
    if (!wasComplete && isComplete) {
      events.push({ tick: nextTick, kind: 'handshake_complete', a: c.from, b: c.to });
    }
  }

  return { connections: merged, events };
}
