/**
 * Story Mode 专用场景: "你"(Me) 是一个刚加入 swarm 的 leecher,
 * 要下载 movie.mp4 (6 piece)。
 *
 * 其他 peer 设计成 bitfield 非均匀, 让 rarest-first 的故事有意义:
 *   - S  : seeder, 全部 6 piece
 *   - L1 : has [0, 1]
 *   - L2 : has [2, 3]
 *   - L3 : has [4]
 *   - L4 : empty (跟你同期的新 leecher, 用于讲"反向贡献")
 *
 * Piece 持有人数:
 *   piece 0,1: S+L1 (2 holders) — 不稀有
 *   piece 2,3: S+L2 (2)
 *   piece 4:   S+L3 (2)
 *   piece 5:   S 独家 (1) — 最稀有 → 你应该先要这个
 */

import type { Scenario } from '../types';

export const STORY_SCENARIO: Scenario = {
  id: 'story',
  torrent: { totalPieces: 6 },
  peers: [
    { id: 'Me', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'S', initialPieces: [0, 1, 2, 3, 4, 5], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L1', initialPieces: [0, 1], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L2', initialPieces: [2, 3], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L3', initialPieces: [4], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L4', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  // 注意 L4 的连接故意稀疏(只连 Me + L1), 让它成为"网络边缘的慢节点":
  // L4 不能直接从 S 拿 piece, 必须等 L1 拿到再二传。这样 Me 完成下载时
  // L4 还在挣扎, step 13 "你反向贡献 piece 给 L4" 的戏剧性才成立。
  initialConnections: [
    ['Me', 'S'], ['Me', 'L1'], ['Me', 'L2'], ['Me', 'L3'], ['Me', 'L4'],
    ['S', 'L1'], ['S', 'L2'], ['S', 'L3'],
    ['L1', 'L2'], ['L1', 'L3'], ['L1', 'L4'],
    ['L2', 'L3'],
  ],
};
