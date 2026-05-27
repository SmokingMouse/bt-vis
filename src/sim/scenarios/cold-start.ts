/**
 * Cold start 场景: 1 个 seeder + N 个空 leecher, 全连接拓扑。
 * Week 1 主线场景 — 走完整 handshake → bitfield → interest → unchoke → request → piece → have → seeder 流程。
 */

import type { PieceId, Scenario } from '../types';

export interface ColdStartOpts {
  /** leecher 数量 (seeder 是固定 1 个,id='S')。 */
  readonly leecherCount: number;
  /** piece 总数。 */
  readonly totalPieces: number;
}

export function coldStartScenario(opts: ColdStartOpts): Scenario {
  const allPieces: PieceId[] = Array.from({ length: opts.totalPieces }, (_, i) => i);
  const peers = [
    {
      id: 'S',
      initialPieces: allPieces,
      uploadCapacity: 2,
      downloadCapacity: 2,
    },
    ...Array.from({ length: opts.leecherCount }, (_, i) => ({
      id: `L${i + 1}`,
      initialPieces: [] as readonly PieceId[],
      uploadCapacity: 1,
      downloadCapacity: 2,
    })),
  ];

  // 全连接: 任意两 peer 互连。
  const connections: (readonly [string, string])[] = [];
  for (let i = 0; i < peers.length; i++) {
    for (let j = i + 1; j < peers.length; j++) {
      connections.push([peers[i].id, peers[j].id] as const);
    }
  }

  return {
    id: `cold-start-${opts.leecherCount}L-${opts.totalPieces}P`,
    torrent: { totalPieces: opts.totalPieces },
    peers,
    initialConnections: connections,
  };
}
