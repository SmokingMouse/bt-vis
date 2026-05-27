/**
 * 5 段聚焦小场景 + 1 个全流程模式。
 * 每段聚焦一个协议机制, 用最小 peer 数 + 精心设计的 bitfield 分布把现象凸显。
 */

import type { Scenario } from '../types';

export interface SceneDef {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly highlight: string;
  readonly scenario: Scenario;
  readonly maxTicks: number;
  readonly defaultSpeed: number;
}

// ── 1. Discovery ────────────────────────────────────────────────────────

const DISCOVERY: Scenario = {
  id: 'discovery',
  torrent: { totalPieces: 1 },
  peers: [
    { id: 'S', initialPieces: [0], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L1', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L2', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L3', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [
    ['S', 'L1'], ['S', 'L2'], ['S', 'L3'],
    ['L1', 'L2'], ['L1', 'L3'], ['L2', 'L3'],
  ],
};

// ── 2. Handshake ────────────────────────────────────────────────────────

const HANDSHAKE: Scenario = {
  id: 'handshake',
  torrent: { totalPieces: 4 },
  peers: [
    { id: 'S', initialPieces: [0, 1, 2, 3], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L1', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [['S', 'L1']],
};

// ── 3. Selection (rarest-first) ─────────────────────────────────────────
// 设计: 6 piece, S 全有, L1 只有 [0,1,2], L2 空。
// L2 视角: piece 0,1,2 有 2 个 holder (S + L1), piece 3,4,5 只有 S。
// 故 L2 优先请求 3/4/5 (rarest)。

const SELECTION: Scenario = {
  id: 'selection',
  torrent: { totalPieces: 6 },
  peers: [
    { id: 'S', initialPieces: [0, 1, 2, 3, 4, 5], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L1', initialPieces: [0, 1, 2], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L2', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [['S', 'L1'], ['S', 'L2'], ['L1', 'L2']],
};

// ── 4. Choking (tit-for-tat + optimistic) ───────────────────────────────
// 5 leecher 1 seeder, S 只能 unchoke top-3, 看 reciprocation 重新洗牌 + optimistic。

const CHOKING: Scenario = {
  id: 'choking',
  torrent: { totalPieces: 6 },
  peers: [
    { id: 'S', initialPieces: [0, 1, 2, 3, 4, 5], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L1', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L2', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L3', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L4', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L5', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [
    ['S', 'L1'], ['S', 'L2'], ['S', 'L3'], ['S', 'L4'], ['S', 'L5'],
    ['L1', 'L2'], ['L1', 'L3'], ['L1', 'L4'], ['L1', 'L5'],
    ['L2', 'L3'], ['L2', 'L4'], ['L2', 'L5'],
    ['L3', 'L4'], ['L3', 'L5'],
    ['L4', 'L5'],
  ],
};

// ── 5. Seeding (leecher 即将完成→ seeder transition) ────────────────────
// 4 piece, 3 leecher 各持 3/4 pieces, 缺最后 1 个

const SEEDING: Scenario = {
  id: 'seeding',
  torrent: { totalPieces: 4 },
  peers: [
    { id: 'S', initialPieces: [0, 1, 2, 3], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L1', initialPieces: [0, 1, 2], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L2', initialPieces: [0, 1, 3], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L3', initialPieces: [1, 2, 3], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [
    ['S', 'L1'], ['S', 'L2'], ['S', 'L3'],
    ['L1', 'L2'], ['L1', 'L3'], ['L2', 'L3'],
  ],
};

// ── 6. Full Flow (完整 cold start) ──────────────────────────────────────

const FULL_FLOW: Scenario = {
  id: 'full-flow',
  torrent: { totalPieces: 6 },
  peers: [
    { id: 'S', initialPieces: [0, 1, 2, 3, 4, 5], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'L1', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L2', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L3', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L4', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'L5', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [
    ['S', 'L1'], ['S', 'L2'], ['S', 'L3'], ['S', 'L4'], ['S', 'L5'],
    ['L1', 'L2'], ['L1', 'L3'], ['L1', 'L4'], ['L1', 'L5'],
    ['L2', 'L3'], ['L2', 'L4'], ['L2', 'L5'],
    ['L3', 'L4'], ['L3', 'L5'],
    ['L4', 'L5'],
  ],
};

export const SCENES: readonly SceneDef[] = [
  {
    id: 'discovery',
    label: '1 · Discovery',
    description:
      'Phase 1 — Peers 加入 swarm, 物理连接建立。BT 现实中通过 Tracker 取得 peer list, 此 sim 简化为直连。',
    highlight: '看 tick 1: 所有 peer_joined + connection_opened 事件',
    scenario: DISCOVERY,
    maxTicks: 6,
    defaultSpeed: 1,
  },
  {
    id: 'handshake',
    label: '2 · Handshake',
    description:
      'Phase 2 — 双方互发 handshake 标识协议, bitfield 告知各自持有哪些 piece, interested/not_interested 表达下载意愿。',
    highlight: 'tick 1 handshake → tick 2 bitfield → tick 3 interested (L1) / not_interested (S)',
    scenario: HANDSHAKE,
    maxTicks: 30,
    defaultSpeed: 1,
  },
  {
    id: 'selection',
    label: '3 · Selection',
    description:
      'Phase 3 — rarest-first 算法: 优先请求 swarm 中最稀有的 piece, 防止某 piece "orphaning"。L2 视角: piece 0,1,2 有 2 个 holder, piece 3,4,5 只有 S — L2 优先请求 3/4/5。',
    highlight: '观察 L2→S 的 request 顺序: 应该先请求 3/4/5 (rarest)',
    scenario: SELECTION,
    maxTicks: 60,
    defaultSpeed: 2,
  },
  {
    id: 'choking',
    label: '4 · Choking',
    description:
      'Phase 4 — tit-for-tat: 每 10 tick 重评估, 上传给"给我下载最多"的 top-3; 每 30 tick 多 unchoke 1 个 random (optimistic) 探索新关系。',
    highlight: 'tick 4/14/24... 看 S 的 unchoke set 在 5 个 leecher 间轮换',
    scenario: CHOKING,
    maxTicks: 200,
    defaultSpeed: 4,
  },
  {
    id: 'seeding',
    label: '5 · Seeding',
    description:
      'Phase 5 — leecher 完成下载后变 seeder, 反向开始供片; have 消息向所有 peer 广播自己新增的 piece。',
    highlight: 'tick 10-20: 看 L1/L2/L3 各自 → SEEDER 后开始反向贡献',
    scenario: SEEDING,
    maxTicks: 50,
    defaultSpeed: 2,
  },
  {
    id: 'full-flow',
    label: '6 · Full Flow',
    description:
      '完整流程 — 5 个空 leecher 加入 swarm, 从 0 到全员 seeder 的整个 cold start。',
    highlight: '一气呵成: discovery → handshake → selection → choking → seeding',
    scenario: FULL_FLOW,
    maxTicks: 300,
    defaultSpeed: 4,
  },
];
