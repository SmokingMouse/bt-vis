/**
 * BitTorrent 示意级协议的 domain 类型。
 *
 * 设计约束:
 * - 所有类型必须 structured-clone 友好（不用 Map/Set/Date/class instance），
 *   这样 SimState 可以序列化、可以用 JSON.stringify 做相等性测试、
 *   未来时间轴拖动可以保存/恢复 checkpoint。
 * - 不追求 BEP 字节级合规，是"协议示意"，保留语义即可。
 */

// ── 基础标识 ────────────────────────────────────────────────────────────

export type PeerId = string;
export type PieceId = number;

/** 一个 peer 持有哪些 piece，按 index 对齐 torrent 的 piece 总数。 */
export type Bitfield = boolean[];

// ── 静态实体 ────────────────────────────────────────────────────────────

/**
 * Torrent 元数据。示意级，不含 info_hash / piece hash / 真实文件结构。
 */
export interface Torrent {
  readonly totalPieces: number;
}

/**
 * Peer 的运行时快照。注意 bitfield 是当前持有状态，
 * 会随 piece 接收而变化。
 */
export interface Peer {
  readonly id: PeerId;
  bitfield: Bitfield;
  /** 上行带宽（pieces / tick）。示意级，不用真实字节速率。 */
  readonly uploadCapacity: number;
  /** 下行带宽（pieces / tick）。 */
  readonly downloadCapacity: number;
}

/**
 * 一个有向 peer→peer 连接的协议状态四元组。
 * 注意：BT 的真实状态是 *双向不对称* 的——A→B 视角和 B→A 视角是两份独立状态。
 * 我们用两条有向 Connection 来表达对称的双向连接。
 */
export interface ConnectionState {
  /** 我（from）是否在 choke 对方（to）。choke = 不响应对方的 request。 */
  amChoking: boolean;
  /** 我（from）是否对对方持有的 piece 感兴趣。 */
  amInterested: boolean;
  /** 我是否已向对方发出 handshake 消息。 */
  handshakeSent: boolean;
  /** 我是否已向对方发出 bitfield 消息。 */
  bitfieldSent: boolean;
  /**
   * 我从对方那里收到的 bitfield 副本。null = 尚未收到。
   * 协议忠实度: 我对"对方持有什么"的认知来自 bitfield+have 消息,
   * 不能直接读 peer[to].bitfield(虽然 sim 里同进程,但语义上算作弊)。
   */
  peerBitfield: Bitfield | null;
  /** 是否已经表达过兴趣（发过 interested 或 not_interested）。 */
  interestExpressed: boolean;
  /**
   * 我从对方那里收到的 piece 累计数。
   * tit-for-tat 排序依据: "对方给我下载越多, 我越倾向于 unchoke 对方"。
   */
  piecesReceived: number;
}

export interface Connection {
  readonly from: PeerId;
  readonly to: PeerId;
  state: ConnectionState;
  /**
   * 我从对方那里已经发出但还没收到 piece data 的 request 队列。
   * 用 PieceId 数组（FIFO）；真实 BT 是 (piece, block_offset, length)，
   * 我们示意级只跟踪 piece。
   */
  pendingRequests: PieceId[];
}

// ── 协议消息（tagged union）─────────────────────────────────────────────

export type Message =
  | { readonly type: 'handshake'; readonly from: PeerId; readonly to: PeerId }
  | { readonly type: 'bitfield'; readonly from: PeerId; readonly to: PeerId; readonly bitfield: Bitfield }
  | { readonly type: 'interested'; readonly from: PeerId; readonly to: PeerId }
  | { readonly type: 'not_interested'; readonly from: PeerId; readonly to: PeerId }
  | { readonly type: 'choke'; readonly from: PeerId; readonly to: PeerId }
  | { readonly type: 'unchoke'; readonly from: PeerId; readonly to: PeerId }
  | { readonly type: 'have'; readonly from: PeerId; readonly to: PeerId; readonly piece: PieceId }
  | { readonly type: 'request'; readonly from: PeerId; readonly to: PeerId; readonly piece: PieceId }
  | { readonly type: 'piece'; readonly from: PeerId; readonly to: PeerId; readonly piece: PieceId };

export type MessageType = Message['type'];

// ── 引擎事件（UI 订阅的对外事件流）─────────────────────────────────────

/**
 * 引擎对外抛出的事件。UI 订阅这个 stream 渲染动画。
 * 包括协议消息（包装一层 tick），也包括引擎级事件（peer 完成下载、连接建立等）。
 */
export type SimEvent =
  | { readonly tick: number; readonly kind: 'message'; readonly message: Message }
  | { readonly tick: number; readonly kind: 'peer_joined'; readonly peerId: PeerId }
  | { readonly tick: number; readonly kind: 'connection_opened'; readonly from: PeerId; readonly to: PeerId }
  | { readonly tick: number; readonly kind: 'handshake_complete'; readonly a: PeerId; readonly b: PeerId }
  | { readonly tick: number; readonly kind: 'piece_completed'; readonly peerId: PeerId; readonly piece: PieceId }
  | { readonly tick: number; readonly kind: 'peer_became_seeder'; readonly peerId: PeerId };

export type SimEventKind = SimEvent['kind'];

// ── 引擎状态快照 ────────────────────────────────────────────────────────

export interface SimState {
  readonly tick: number;
  readonly seed: number;
  /** PRNG 的当前内部状态，存进 SimState 以保证可序列化 + 可恢复。 */
  readonly rngState: number;
  readonly torrent: Torrent;
  readonly peers: Record<PeerId, Peer>;
  /** 用 (from, to) 复合键拉平存储，便于 O(1) 查找。 */
  readonly connections: Record<string, Connection>;
}

/** Connection 的复合主键编码。 */
export function connKey(from: PeerId, to: PeerId): string {
  return `${from}->${to}`;
}

// ── 场景配置 ────────────────────────────────────────────────────────────

export interface ScenarioPeerConfig {
  readonly id: PeerId;
  /** 初始持有的 piece index 列表；seeder 应该是 [0, 1, ..., totalPieces-1]。 */
  readonly initialPieces: readonly PieceId[];
  readonly uploadCapacity: number;
  readonly downloadCapacity: number;
}

export interface Scenario {
  readonly id: string;
  readonly torrent: Torrent;
  readonly peers: readonly ScenarioPeerConfig[];
  /**
   * 初始已建立的连接对（双向）。
   * 留空意味着 Discovery 阶段会通过 mock Tracker 建立连接。
   */
  readonly initialConnections?: readonly (readonly [PeerId, PeerId])[];
}
