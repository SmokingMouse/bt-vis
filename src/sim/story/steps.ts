/**
 * 12 步剧本: 从"你想下载电影"到"你完成下载并反向贡献"。
 *
 * 每步是一段叙事 + 可选的 "Why"(设计原理) + 推进到的 tick + 视觉高亮提示。
 * 用户点 "Next →" 推进; UI 会自动跑 sim engine 到对应 tick。
 */

export interface StoryStep {
  readonly id: number;
  /** 短标题, 显示在 progress 条上 */
  readonly title: string;
  /** 主叙事 (数组每项一段) */
  readonly narrative: readonly string[];
  /** 设计原理 / "为什么这样做" (可选) */
  readonly why?: string;
  /** 推进到的累计 tick (从 0 开始). UI 自动跑 sim 到这里。 */
  readonly advanceTo: number;
  /** UI 视觉提示: 高亮哪些节点/消息类型 */
  readonly highlight?: {
    readonly peerIds?: readonly string[];
    /** 这一步用户应当观察哪种消息类型 */
    readonly messageTypes?: readonly string[];
  };
  /** 这一步在网络图里是否还应该隐藏除 Me 外的节点(讲 Tracker 之前) */
  readonly hideSwarm?: boolean;
}

export const STORY_STEPS: readonly StoryStep[] = [
  // ── Episode 1: Setup ──────────────────────────────────────────────────
  {
    id: 1,
    title: '你想下载 movie.mp4',
    narrative: [
      '想象你刚拿到一个 .torrent 文件——里面没有电影本身,只有"这部电影的指纹"和"去哪儿找它的人"。',
      '电影被切成 6 个 piece (块)。你的客户端会一块一块下,而不是整文件传。',
    ],
    why: '为什么分块?并行下载 (同时从多人拉不同块)、容错强 (某块挂了重传那一块即可)、断点续传天然支持。',
    advanceTo: 0,
    hideSwarm: true,
    highlight: { peerIds: ['Me'] },
  },
  {
    id: 2,
    title: '联系 Tracker',
    narrative: [
      '你不知道这部电影现在谁在分享。Tracker 是中央目录服务,记录"谁在分享什么"。',
      '你的客户端向 .torrent 里写的 tracker URL 发请求:"我要这部电影,给我 peer list"。',
    ],
    why: '注意 Tracker 只是"介绍人",真正的数据传输不经过它——后续所有 piece 都直接在 peer 之间走。',
    advanceTo: 0,
    hideSwarm: true,
    highlight: { peerIds: ['Me'] },
  },
  {
    id: 3,
    title: 'Tracker 返回 5 个 peer',
    narrative: [
      'Tracker 返回了 5 个其他客户端: S (完整持有者 / seeder), L1/L2/L3 (部分持有), L4 (新加入,跟你一样空)。',
      '你的客户端开始和它们建立 TCP 连接。',
    ],
    advanceTo: 0,
    highlight: { peerIds: ['Me', 'S', 'L1', 'L2', 'L3', 'L4'] },
  },

  // ── Episode 2: 建立协议关系 ────────────────────────────────────────────
  {
    id: 4,
    title: 'Handshake: 互相打招呼',
    narrative: [
      'TCP 连上后,第一件事是 handshake——双方互发一个标识消息,确认协议版本 + 文件 info_hash 一致。',
      '所有方向的 handshake 同时进行 (tick 1)。',
    ],
    advanceTo: 1,
    highlight: { peerIds: ['Me'], messageTypes: ['handshake'] },
  },
  {
    id: 5,
    title: 'Bitfield: 你有啥? 我有啥?',
    narrative: [
      '握手后,双方互发 bitfield——一串布尔位,告诉对方"我这边持有哪些 piece"。',
      '你的 bitfield 是 [0,0,0,0,0,0] 全空。S 的 bitfield 是 [1,1,1,1,1,1] 全有。',
    ],
    advanceTo: 2,
    highlight: { peerIds: ['Me'], messageTypes: ['bitfield'] },
  },
  {
    id: 6,
    title: 'Interested / Not_interested',
    narrative: [
      '看了对方的 bitfield,你需要表态:"对方有的 piece 我想要吗?"',
      'S 全有 → 你 interested。L1 有 [0,1] → 你 interested。L4 全空 → 你 not_interested (它没东西给你)。',
      '注意 S 对你 not_interested——它什么都不缺。',
    ],
    advanceTo: 3,
    highlight: { peerIds: ['Me'], messageTypes: ['interested', 'not_interested'] },
  },

  // ── Episode 3: Choking 设计动机 ────────────────────────────────────────
  {
    id: 7,
    title: '但 S 默认在 choke 你',
    narrative: [
      '即使你 interested, 你还不能马上请求 piece——S 此刻在 choke 你 (拒绝响应你的 request)。',
      '为什么 BT 这么设计? S 的上传带宽稀缺,如果同时给 swarm 里 1000 个人传, 每人速度都慢到没用。',
      '所以 S 主动控流: 只 unchoke 少数几个 peer (默认 top-3 + 1 个 optimistic)。',
    ],
    why: '这就是 tit-for-tat: 给我下载多的人, 我才回馈带宽给他。但你是新人 piecesReceived=0, 怎么破局?答案是 optimistic unchoke——周期性随机给一个 choked peer 机会,让新人能起步。',
    advanceTo: 3,
    highlight: { peerIds: ['Me', 'S'] },
  },
  {
    id: 8,
    title: 'S 把你 unchoke 了 (optimistic)',
    narrative: [
      'tick 4 是 S 第一次 reciprocation 评估。所有人 piecesReceived=0, S 按 peer id 字典序选 top-3 (L1/L2/L3) + optimistic 选你 (Me)。',
      '现在 S → Me 状态是 unchoked, 你可以开始请求 piece 了!',
    ],
    advanceTo: 4,
    highlight: { peerIds: ['Me', 'S'], messageTypes: ['unchoke'] },
  },

  // ── Episode 4: 下载 ───────────────────────────────────────────────────
  {
    id: 9,
    title: '挑哪个 piece? — Rarest-first',
    narrative: [
      '你能从 S/L1/L2/L3 拿到不同 piece (L4 没东西)。但你应该先要哪个?',
      'BT 的答案: rarest-first。看 swarm 里"被持有人数最少"的 piece。',
      '现在 piece 0,1 有 S+L1 = 2 holders; piece 2,3 有 S+L2 = 2; piece 4 有 S+L3 = 2; piece 5 只有 S = 1。',
      '→ piece 5 最稀有, 你的客户端优先要它。',
    ],
    why: '为什么 rarest 优先? 因为最稀有的 piece 最容易"绝种": 如果唯一的持有者下线, 整个 swarm 就再也凑不齐这部电影了。你的下载顺便保护了 swarm 的完整性。',
    advanceTo: 4,
    highlight: { peerIds: ['Me', 'S'] },
  },
  {
    id: 10,
    title: 'Request → Piece → 进度 +1',
    narrative: [
      '你同时向 S/L1/L2/L3 发 request——每个 conn 一个 piece, 走 rarest-first 排序。',
      '下一 tick 数据抵达, 你的 bitfield 第一次有 1。',
      '同时你向所有 5 个 peer 广播 have——让他们知道"现在我也有这块了,以后可以来找我要"。',
    ],
    advanceTo: 5,
    highlight: { peerIds: ['Me'], messageTypes: ['request', 'piece', 'have'] },
  },
  {
    id: 11,
    title: '重复 — 直到 6/6',
    narrative: [
      '后续每个 piece 走同样流程: 选 rarest → request → piece → 更新 bitfield → 广播 have。',
      '点 Next 看你拿到剩下的 piece (动画推进, 留意 Me 节点 bitfield 一格一格变绿)。',
    ],
    advanceTo: 9,
    highlight: { peerIds: ['Me'] },
  },

  // ── Episode 5: 反向贡献 ───────────────────────────────────────────────
  {
    id: 12,
    title: '完成下载 — 你成为 seeder',
    narrative: [
      'bitfield 全 1, Me 节点变绿 — 你 became seeder!',
      '客户端自动撤回对所有 peer 的 interest——你不再需要任何东西。',
      '但 swarm 里 L4 (跟你同期入场的新人, 还是 0/6) 对你 interested。你要不要给它传?',
      '答案: 是。BT 协议的精神 — 每个下载者也是上传者。',
    ],
    advanceTo: 10,
    highlight: { peerIds: ['Me'], messageTypes: ['peer_became_seeder', 'not_interested'] },
  },
  {
    id: 13,
    title: '别人向你 request → 你贡献 piece',
    narrative: [
      'L4 对你 interested, 经过 reciprocation 你 unchoke 它, 它向你请求 piece。',
      '你发 piece 给 L4——这是 swarm 第一次因为"你"而存在: 多一个 seeder = swarm 容量增加 = 整体下载更快。',
      '这就是 BitTorrent 的飞轮: 越多人下,可用带宽越多,后续人下得越快。',
    ],
    why: '这跟传统 client-server 是反过来的——传统模式人越多服务器越累, BT 模式人越多越好。这是 P2P 的根本魔力。',
    advanceTo: 15,
    highlight: { peerIds: ['Me', 'L4'], messageTypes: ['piece', 'unchoke'] },
  },
  {
    id: 14,
    title: '总结: BT 三大智慧',
    narrative: [
      '1. **分块** — 让并行下载、容错、断点续传成为可能',
      '2. **Rarest-first** — 每个新下载顺便维护 swarm 的完整性',
      '3. **Tit-for-tat + optimistic** — 用激励机制让 swarm 自治, 不需要中央调度',
      '想继续探索? 切换到 "Free Play" 模式自由拖时间轴, 或换不同场景重新看。',
    ],
    advanceTo: 15,
    highlight: { peerIds: ['Me'] },
  },
];
