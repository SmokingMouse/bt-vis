# bt-vis

> Interactive visualization of the BitTorrent protocol — from cold start to seeder.

A deterministic browser-side simulation of BT's core mechanisms: handshake, bitfield exchange, rarest-first piece selection, tit-for-tat choking, and seeder transitions. Built as a portfolio piece to make a complex distributed protocol legible at a glance.

## Demo

🌐 **Live**: _(link here once deployed)_

## What it shows

Six scenes, each focused on one mechanism:

1. **Discovery** — peers join the swarm and open physical connections
2. **Handshake** — handshake → bitfield → interested/not_interested exchange
3. **Selection** — rarest-first piece selection (3 peers with non-uniform bitfields)
4. **Choking** — tit-for-tat reciprocation + optimistic unchoke (5 leechers, 1 seeder)
5. **Seeding** — leecher completes its download and starts contributing back
6. **Full Flow** — the entire cold start from 0 to all-seeders, end to end

Drag the timeline to inspect any frame. Click a node to see that peer's bitfield, connection states, and per-connection download tally.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       Next.js app                       │
│  ┌────────────────────────┐  ┌────────────────────────┐ │
│  │   src/ui/components/   │  │     src/app/page.tsx   │ │
│  │   NetworkGraph         │  │  scene selector +      │ │
│  │   Timeline             │  │  tick state +          │ │
│  │   EventLog             │  │  player loop           │ │
│  │   PeerDetail           │  └──────────┬─────────────┘ │
│  └────────────────────────┘             │               │
│                                         ▼               │
│  ┌──────────────────────────────────────────────────┐   │
│  │             src/sim/  (pure TS, no React)        │   │
│  │                                                  │   │
│  │   types.ts      domain types (Peer / Message)    │   │
│  │   engine.ts     tick step + deterministic PRNG   │   │
│  │                                                  │   │
│  │   protocol/                                      │   │
│  │     handshake.ts   stages 1-3                    │   │
│  │     choking.ts     tit-for-tat + optimistic      │   │
│  │     transfer.ts    request / piece / have        │   │
│  │     piece-selection.ts  rarest-first             │   │
│  │                                                  │   │
│  │   scenarios/                                     │   │
│  │     scenes.ts      6 scene definitions           │   │
│  │     cold-start.ts  factory for full-flow         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key design decisions

| Decision | Why |
|---|---|
| **All client-side, deterministic** | `step(state, scenario) → newState + events` is a pure function. Given the same seed, every frame is reproducible — letting users scrub the timeline to any tick instantly. |
| **Sim layer separate from UI** | `src/sim/` has zero React dependency. Engine is unit-tested in isolation (63 tests). UI just renders state snapshots. |
| **Phase-driven, one stage per tick per conn** | Each directed connection advances at most one protocol stage per tick. Keeps animation pacing legible and the event stream readable. |
| **`peerBitfield` stored per-conn** | A peer's knowledge of what others hold flows through `bitfield` and `have` messages, not by reading the global state — preserves the protocol's information topology. |
| **Snapshot-based batch update** | Each phase reads tick-N state and writes a new tick-(N+1) state. No iteration-order dependence; deterministic and testable. |

## Protocol mechanics implemented

- Handshake / Bitfield / Interested exchange (`protocol/handshake.ts`)
- Tit-for-tat choking with optimistic unchoke (`protocol/choking.ts`)
  - Re-evaluate every 10 ticks; top-3 download contributors get unchoked
  - Every 30 ticks, one additional random choked peer gets optimistic unchoke
- Rarest-first piece selection (`protocol/piece-selection.ts`)
  - Excludes pieces already in-flight to avoid duplicate requests
- Piece request / response (`protocol/transfer.ts`)
- `have` broadcast on piece completion
- Seeder transition with automatic `not_interested` retraction

## Known simplifications

This is a teaching visualization, not a wire-compatible BitTorrent client:

- No Tracker / DHT protocol — peers are directly connected at scenario start
- No real TCP / handshake byte format — "handshake" is a single tagged message
- No piece hashing / verification
- No pipelining or block-level granularity — request a piece, get a piece
- Bitfield stored as `boolean[]`, not bit-packed
- No endgame mode, fast-extension, μTP, or peer banning
- No realistic bandwidth model — `uploadCapacity` shapes nothing concrete in this MVP

## Tech stack

- **Next.js 16** + App Router (turbopack)
- **React 19** + TypeScript (strict mode)
- **Tailwind CSS 4**
- **Vitest 4** (63 unit + integration tests covering all phases)

## Run locally

```bash
pnpm install
pnpm dev          # localhost:3000
pnpm test         # vitest watch mode
pnpm test:run     # one-shot
pnpm build        # static prerender, ready to deploy
```

## Deploy

The site is a single static page (`next build` outputs `○ (Static) prerendered as static content`). Deploy anywhere that serves Next.js static output:

**Vercel** (easiest):
1. Push to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Default settings work — no env vars or build customization needed

**GitHub Pages** / other static hosts: enable `output: 'export'` in `next.config.ts` and serve the `out/` directory.

## Project status

See [`progress/`](./progress/) for the full development log:

- [`progress/README.md`](./progress/README.md) — dashboard + session log
- [`progress/decisions/`](./progress/decisions/) — architecture decisions
