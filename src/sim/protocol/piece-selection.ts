/**
 * Rarest-first piece selection algorithm.
 *
 * 原理: 在我 *不持有* 但对方 *持有* 的 piece 集合里,
 * 选 swarm 内持有者数量最少的(最稀有) - tie-break 用 PieceId 小者(deterministic)。
 *
 * "对方"是 conn(me→peer).peerBitfield 反映的认知,不是 peers[peer].bitfield 直读。
 * 见 protocol/handshake.ts 注释。
 */

import type { Bitfield, PieceId } from '../types';

/**
 * 从我没持有但被 candidatePeers 中至少一人持有的 piece 里,
 * 选最稀有那个(持有人数最少)。tie-break: PieceId 升序。
 *
 * @param myBitfield 我自己的 bitfield
 * @param peerBitfields 我所知的对方 bitfield(从 conn.peerBitfield 收集,
 *                      null 的不传)
 * @returns 选中的 PieceId,或 null 表示没可选(我已经下完 或 没人持有我缺的)
 */
export function selectRarestPiece(
  myBitfield: Bitfield,
  peerBitfields: readonly Bitfield[],
): PieceId | null {
  const totalPieces = myBitfield.length;
  // 数每个 piece 在 peers 中的持有人数。
  const counts = new Array<number>(totalPieces).fill(0);
  for (const bf of peerBitfields) {
    for (let i = 0; i < totalPieces; i++) {
      if (bf[i]) counts[i]++;
    }
  }

  let bestPiece: PieceId | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (let i = 0; i < totalPieces; i++) {
    if (myBitfield[i]) continue; // 我已有,跳过
    if (counts[i] === 0) continue; // 没人持有,跳过
    if (counts[i] < bestCount) {
      bestPiece = i;
      bestCount = counts[i];
    }
  }
  return bestPiece;
}

export function isComplete(bitfield: Bitfield): boolean {
  for (let i = 0; i < bitfield.length; i++) {
    if (!bitfield[i]) return false;
  }
  return true;
}
