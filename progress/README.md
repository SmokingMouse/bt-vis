# bt-vis Progress

## Current Focus
**MVP 完整完成** ✅。Week 1-3 主要 Goals 全部达成。剩 Vercel 部署需要用户操作。

## Goals

### Short-term (Week 1-3)
- [x] **Week 1**: sim engine + 单场景跑通 — done
  - [x] Engine 核心：tick 步进、事件总线、deterministic seed
  - [x] Handshake + Bitfield + Interest 状态机
  - [x] Piece Selection (rarest-first) + Transfer (request/piece/have/seeder 转变)
  - [x] 最简 UI：NetworkGraph + Timeline + EventLog (浏览器实测 cold start 完整跑通)
- [x] **Week 2**: 5 段场景 + 全流程模式 + UI 打磨 — done
  - [x] Choking 算法 (tit-for-tat + optimistic unchoke, 周期 10/30 tick)
  - [x] 5 段场景 + 1 全流程 (Discovery / Handshake / Selection / Choking / Seeding / Full Flow)
  - [x] 视觉打磨: 消息流动圆点 + edge 高亮 + 节点选中蓝圈
  - [x] PeerDetail 面板 (bitfield 大图 + 每条 connection 状态 + 接收 piece 计数)
  - [x] seeder→not_interested 自动撤回
- [x] **Week 3**: README + 部署 — done
  - [x] README.md 含架构图 + 设计决策 + 已知简化
  - [x] next.config.ts 配 `output: 'export'` + `basePath` 用环境变量
  - [x] `.github/workflows/deploy.yml` CI: pnpm test → build → GitHub Pages deploy
  - [x] **线上部署完成**: <https://smokingmouse.github.io/bt-vis/>
- [ ] **Week 2**: 5 段场景 + 全流程模式 + UI 打磨
  - [ ] Choking 算法（tit-for-tat + optimistic unchoke）
  - [ ] 5 段场景拆分：Discovery / Handshake / Selection / Choking / Seeding
  - [ ] 全流程模式
  - [ ] 视觉打磨（用 frontend-design skill 出方案）
  - [ ] PeerDetail / EventLog 面板
- [ ] **Week 3**: README + 部署 + 可选发布
  - [ ] 技术决策记录 README + 架构图
  - [ ] Vercel 部署 + 30s demo GIF
  - [ ] 可选：发 X / 写博客

### Mid/Long-term
- [ ] 增量场景扩展（新节点动态加入、新资源进入 swarm）— deferred
- [ ] 异常/鲁棒性场景（恶意 peer、网络分裂）— deferred
- [ ] 衍生博客文章 — deferred to Week 3+

## Tech Stack
- Next.js (App Router) + TypeScript + Tailwind
- Canvas 或 SVG 渲染（待 Week 2 视觉打磨时定）
- Vitest 单测 sim engine
- 部署: Vercel

## Scope Decisions
- **IN**: 存量请求 + 冷启动（一个节点从加入到 seeder 全过程）
- **OUT (MVP)**: 增量、异常、真实 wire 协议字节级兼容、后端/WS、移动端
- 协议为"示意级"，不追求 BEP 字节级合规

## Session Log

### Session 1 (2026-05-27)
- Done:
  - 完成项目脑爆 brainstorm（4 个核心决策点：受众/范围/形态/时间盒）
  - 确定整体架构方案（见 decisions/2026-05-27-architecture.md）
  - 建立 progress/ 结构
  - **Week 1 D1-2 完成**:
    - Next.js 16 + TS + Tailwind 4 + Vitest 4 脚手架
    - `src/sim/types.ts` — Peer/Piece/Message/SimEvent/SimState/Scenario domain 类型（structured-clone 友好）
    - `src/sim/engine.ts` — deterministic mulberry32 PRNG + 纯函数 step + run helper + 初始化 + 事件流
    - `src/sim/__tests__/engine.test.ts` — 17 个测试覆盖 PRNG 范围/确定性、step 纯度（不变 input）、事件 tick 单调、SimState JSON round-trip
  - 验证: `pnpm test:run` 17/17 通过；`pnpm exec tsc --noEmit` 0 error
  - **Week 1 D3-4 完成**:
    - 扩展 `ConnectionState` 含 4 个阶段位（handshakeSent / bitfieldSent / peerBitfield / interestExpressed）
    - 新 `src/sim/protocol/handshake.ts` — snapshot-based batch update：每个 directed conn 每 tick 推进至多 1 阶段（handshake → bitfield → interested/not_interested）；deterministic 字典序遍历；handshake_complete 事件 fire-once 语义
    - 协议忠实度：peerBitfield 通过消息传递、深拷贝，不直读 peers[to].bitfield
    - engine.step 集成 handshake phase
    - `handshake.test.ts` — 16 个测试覆盖：2-peer 三阶段时序、3-peer 6 方向、双 seeder 边缘（双向 not_interested）、interest 判断正确性（hasMissing 语义）、handshake_complete fire-once、决定性、peerBitfield 深拷贝
    - 修一个 bug: ConnectionState 字段在 `conn.state.*` 不在 `conn.*`，初版漏了 → 8 测试失败，已修
  - 验证: 33/33 测试通过；tsc 0 error
  - **Week 1 D5-6 完成**:
    - `src/sim/protocol/piece-selection.ts` — `selectRarestPiece(myBitfield, peerBitfields)` + `isComplete` 纯函数;tie-break 用 PieceId 升序保 deterministic
    - `src/sim/protocol/transfer.ts` — 阶段 4-6:auto-unchoke + send-request + respond-piece;每 conn 每 tick 最多 1 阶段;snapshot-based batch apply;选片时排除 in-flight piece 避免重复;接收方 bitfield 实时更新;have 广播 + peer_became_seeder 事件
    - `src/sim/scenarios/cold-start.ts` — 1 seeder + N leecher 全连接拓扑工厂
    - 综合测试 `cold-start.test.ts` — 3 leecher / 7 leecher / 2-peer 场景全部跑到 100%;协议消息顺序、have 数量公式、决定性都验证
    - 验证:53/53 测试通过;tsc 0 error
  - **Week 1 D7 完成**:
    - UI 组件:`NetworkGraph` (SVG 圆形布局 + bitfield 进度条 + seeder 绿色)、`Timeline` (拖动 + 播放/暂停 + 速度)、`EventLog` (颜色编码消息流)
    - `src/app/page.tsx` 主页 5 leecher + 6 piece 场景
    - `pnpm build` 通过、prerendered as static content(可直接部署 Vercel)
    - **浏览器实测**:agent-browser CDP 9222 拖 slider 到 tick 30 → "6/6 are seeders now"、所有节点变绿、EventLog 376 条事件含完整 handshake → bitfield → piece → have → SEEDER 流程
  - **Week 2 完成** (D8-D14):
    - `src/sim/protocol/choking.ts` — tit-for-tat (10 tick 周期) + optimistic unchoke (30 tick 周期); deterministic PRNG 选 optimistic peer
    - `ConnectionState.piecesReceived` 字段 + transfer stage 6 计数; 替换原 auto-unchoke 占位
    - `src/sim/scenarios/scenes.ts` — 6 个手写场景 (Discovery 1piece/Handshake 2peer/Selection 非均匀 bitfield/Choking 5leecher/Seeding 近完成/Full Flow), 每段含 description + highlight
    - UI: 顶部场景切换 tab + 旁白 + 节点点击交互 + PeerDetail 面板 + edge 上消息流动圆点(颜色按类型)
    - `seeder → not_interested` 自动撤回让 PeerDetail 显示语义准确
    - `choking.test.ts` — 10 测试覆盖 tit-for-tat 排序 / optimistic / 周期触发 / deterministic / cold-start 集成
    - 测试: 63/63 通过; tsc 0 error
    - 浏览器实测: Selection scene tick 20 验证 L2 优先 request rarest piece (#3/4/5); Full Flow tick 25 验证 5/6 seeders + L1 详情面板正确显示 seeder 状态
  - **Week 3 完成**:
    - `README.md` — 项目目标 + 6 场景介绍 + 架构 ASCII 图 + 5 条设计决策 + 协议机制列表 + 已知简化 + 部署指南
    - Build 验证: `pnpm build` 静态 prerender 成功, 可直接 Vercel/GH Pages 部署
  - **部署完成**:
    - GitHub repo: <https://github.com/SmokingMouse/bt-vis> (public)
    - 静态 export 配置 + GitHub Actions workflow (build → test → deploy to Pages, 40s 全程)
    - 线上 URL: <https://smokingmouse.github.io/bt-vis/>
    - 浏览器实测线上 Full Flow tick 20: 4/6 seeders + 321 events 完整流转
- Decisions: 全前端 TS sim engine + 5 段场景 + 全流程模式；2-3 周时间盒；垂直切片推进；用 GitHub Pages 而非 Vercel(免账户)
- Next: 整个 MVP 项目完成。可选迭代: 增量场景(新节点动态加入)、异常鲁棒性(恶意 peer)、技术博客
