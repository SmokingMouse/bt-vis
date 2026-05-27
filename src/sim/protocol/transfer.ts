/**
 * Piece transfer 阶段: auto-unchoke → request → piece response → have broadcast。
 *
 * 设计:
 * - 每个 directed conn 每 tick 最多推进一阶段(stage 4/5/6 中的一个),
 *   节奏稳,UI 动画好看,不会单 tick 爆消息。
 * - stage 6 内部 piggyback: piece 抵达 → 接收方 bitfield 即时更新 →
 *   batch apply 后扫描 "新增 piece" → 抛 have 消息 + peer_became_seeder。
 * - Week 1 用 "auto-unchoke" 占位(对方 interested 即 unchoke),
 *   Week 2 替换为 tit-for-tat + optimistic unchoke。
 *
 * 选片避免重复:
 * - 我的某个 piece 只要在任一 conn 的 pendingRequests 里, 就不要再选(避免重复请求浪费)。
 */

import { isComplete, selectRarestPiece } from './piece-selection';
import {
  type Bitfield,
  type Connection,
  type ConnectionState,
  type Peer,
  type PeerId,
  type PieceId,
  type SimEvent,
  type SimState,
  connKey,
} from '../types';

interface ConnPatch {
  readonly state?: Partial<ConnectionState>;
  readonly pendingRequests?: readonly PieceId[];
}

interface Action {
  readonly key: string;
  readonly event: SimEvent;
  readonly patches: Record<string, ConnPatch>;
  /** stage 6: piece 抵达时, 接收方 bitfield 该 piece 设为 true。 */
  readonly pieceReceivedBy?: PeerId;
  readonly pieceReceived?: PieceId;
}

/** 收集 peerId 在所有 outgoing conn 中已请求中的 piece, 用于排除重复选片。 */
function collectInFlightPieces(
  connections: Record<string, Connection>,
  peerId: PeerId,
): Set<PieceId> {
  const set = new Set<PieceId>();
  for (const key of Object.keys(connections)) {
    const c = connections[key];
    if (c.from !== peerId) continue;
    for (const p of c.pendingRequests) set.add(p);
  }
  return set;
}

/** 收集 peerId 已知的所有 peer bitfields(从 outgoing conn 的 peerBitfield)。 */
function collectKnownPeerBitfields(
  connections: Record<string, Connection>,
  peerId: PeerId,
): Bitfield[] {
  const out: Bitfield[] = [];
  for (const key of Object.keys(connections)) {
    const c = connections[key];
    if (c.from !== peerId) continue;
    if (c.state.peerBitfield !== null) out.push(c.state.peerBitfield);
  }
  return out;
}

function decideAction(state: SimState, key: string, nextTick: number): Action | null {
  const conn = state.connections[key];
  const cs = conn.state;
  const reverseKey = connKey(conn.to, conn.from);
  const reverse = state.connections[reverseKey];
  const fromPeer = state.peers[conn.from];

  // Stage 4 (auto-unchoke) 已迁移到 protocol/choking.ts(tit-for-tat + optimistic)。

  // Stage 5 (send request): 我 interested + 对方已 unchoke 我 + 我没 pending + 我还没下完。
  if (
    cs.amInterested &&
    !reverse.state.amChoking &&
    conn.pendingRequests.length === 0 &&
    !isComplete(fromPeer.bitfield)
  ) {
    const inFlight = collectInFlightPieces(state.connections, conn.from);
    // 把已请求中的 piece "标为已有" 在临时副本里, 避免 selectRarestPiece 选它们。
    const augmentedBitfield = fromPeer.bitfield.map((b, i) => b || inFlight.has(i));
    // 只看这一 conn 的 peerBitfield(从这个 peer 才能拿)。
    const peerBitfields = cs.peerBitfield ? [cs.peerBitfield] : [];
    const piece = selectRarestPiece(augmentedBitfield, peerBitfields);
    if (piece !== null) {
      return {
        key,
        event: {
          tick: nextTick,
          kind: 'message',
          message: { type: 'request', from: conn.from, to: conn.to, piece },
        },
        patches: {
          [key]: { pendingRequests: [...conn.pendingRequests, piece] },
        },
      };
    }
  }

  // Stage 6 (respond piece): 对方向我请求 + 我已 unchoke + 我有该 piece → 发 piece, 立即更新接收方 bitfield。
  if (
    reverse.pendingRequests.length > 0 &&
    !cs.amChoking &&
    fromPeer.bitfield[reverse.pendingRequests[0]]
  ) {
    const piece = reverse.pendingRequests[0];
    return {
      key,
      event: {
        tick: nextTick,
        kind: 'message',
        message: { type: 'piece', from: conn.from, to: conn.to, piece },
      },
      patches: {
        // 对方(conn.to)从我(conn.from)收到一个 piece, 所以反向 conn 的 piecesReceived++
        [reverseKey]: {
          pendingRequests: reverse.pendingRequests.slice(1),
          state: { piecesReceived: reverse.state.piecesReceived + 1 },
        },
      },
      pieceReceivedBy: conn.to,
      pieceReceived: piece,
    };
  }

  return null;
}

export interface TransferResult {
  readonly connections: Record<string, Connection>;
  readonly peers: Record<PeerId, Peer>;
  readonly events: readonly SimEvent[];
}

export function stepTransferPhase(state: SimState, nextTick: number): TransferResult {
  const keys = Object.keys(state.connections).sort();
  const actions: Action[] = [];
  for (const key of keys) {
    const a = decideAction(state, key, nextTick);
    if (a) actions.push(a);
  }

  // Apply phase.
  const mergedConns: Record<string, Connection> = { ...state.connections };
  const mergedPeers: Record<PeerId, Peer> = { ...state.peers };

  const events: SimEvent[] = [];
  for (const a of actions) {
    events.push(a.event);
    for (const [k, patch] of Object.entries(a.patches)) {
      const cur = mergedConns[k];
      mergedConns[k] = {
        ...cur,
        state: patch.state ? { ...cur.state, ...patch.state } : cur.state,
        pendingRequests:
          patch.pendingRequests !== undefined ? [...patch.pendingRequests] : cur.pendingRequests,
      };
    }
    if (a.pieceReceivedBy && a.pieceReceived !== undefined) {
      const recv = mergedPeers[a.pieceReceivedBy];
      if (!recv.bitfield[a.pieceReceived]) {
        const newBf = [...recv.bitfield];
        newBf[a.pieceReceived] = true;
        mergedPeers[a.pieceReceivedBy] = { ...recv, bitfield: newBf };
      }
    }
  }

  // Have broadcast + seeder transition scan.
  for (const peerId of Object.keys(mergedPeers).sort()) {
    const before = state.peers[peerId].bitfield;
    const after = mergedPeers[peerId].bitfield;
    if (before === after) continue;
    // 收集本 tick 该 peer 新增的 piece。
    const newPieces: PieceId[] = [];
    for (let i = 0; i < after.length; i++) {
      if (after[i] && !before[i]) newPieces.push(i);
    }
    if (newPieces.length === 0) continue;

    // 抛 piece_completed 事件(每新 piece 一条)。
    for (const piece of newPieces) {
      events.push({ tick: nextTick, kind: 'piece_completed', peerId, piece });
    }

    // 向该 peer 的所有 outgoing conn 广播 have(对每个新 piece)。
    for (const key of Object.keys(mergedConns).sort()) {
      const c = mergedConns[key];
      if (c.from !== peerId) continue;
      for (const piece of newPieces) {
        events.push({
          tick: nextTick,
          kind: 'message',
          message: { type: 'have', from: peerId, to: c.to, piece },
        });
      }
    }

    // 检测 seeder 转变 + 自动撤回 interest(seeder 不再需要任何 piece)。
    const wasSeeder = isComplete(before);
    const isSeederNow = isComplete(after);
    if (!wasSeeder && isSeederNow) {
      events.push({ tick: nextTick, kind: 'peer_became_seeder', peerId });
      // 撤回所有 outgoing conn 的 amInterested(seeder 对谁都不再感兴趣)
      for (const key of Object.keys(mergedConns)) {
        const c = mergedConns[key];
        if (c.from !== peerId) continue;
        if (c.state.amInterested) {
          mergedConns[key] = {
            ...c,
            state: { ...c.state, amInterested: false },
          };
          events.push({
            tick: nextTick,
            kind: 'message',
            message: { type: 'not_interested', from: peerId, to: c.to },
          });
        }
      }
    }
  }

  return { connections: mergedConns, peers: mergedPeers, events };
}
