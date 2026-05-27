import type { MessageType, PeerId, SimState } from '@/sim/types';

const WIDTH = 640;
const HEIGHT = 540;
const NODE_RADIUS = 26;

interface MessageBlip {
  readonly from: PeerId;
  readonly to: PeerId;
  readonly type: MessageType;
}

interface Props {
  state: SimState;
  /** 当前 tick 的消息事件 (用于在 edge 上渲染流动圆点)。 */
  recentMessages?: readonly MessageBlip[];
  selectedPeerId?: PeerId | null;
  onSelectPeer?: (peerId: PeerId | null) => void;
}

const MSG_COLOR: Record<MessageType, string> = {
  handshake: 'rgb(34 211 238)', // cyan-400
  bitfield: 'rgb(56 189 248)', // sky-400
  interested: 'rgb(251 191 36)', // amber-400
  not_interested: 'rgb(113 113 122)', // zinc-500
  choke: 'rgb(248 113 113)', // red-400
  unchoke: 'rgb(74 222 128)', // green-400
  have: 'rgb(161 161 170)', // zinc-400
  request: 'rgb(250 204 21)', // yellow-400
  piece: 'rgb(52 211 153)', // emerald-400
};

const MSG_PRIORITY: MessageType[] = [
  'piece',
  'request',
  'have',
  'unchoke',
  'choke',
  'interested',
  'not_interested',
  'bitfield',
  'handshake',
];

function topMessageType(msgs: MessageBlip[]): MessageType {
  for (const t of MSG_PRIORITY) {
    if (msgs.some((m) => m.type === t)) return t;
  }
  return msgs[0]!.type;
}

export function NetworkGraph({
  state,
  recentMessages = [],
  selectedPeerId = null,
  onSelectPeer,
}: Props) {
  const peers = Object.values(state.peers);
  const n = peers.length;
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const r = Math.min(WIDTH, HEIGHT) / 2 - 70;

  const positions = peers.map((peer, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      peer,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
  const posById = Object.fromEntries(positions.map((p) => [p.peer.id, p]));

  const edges: { from: PeerId; to: PeerId; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const key of Object.keys(state.connections)) {
    const c = state.connections[key];
    if (c.from < c.to) {
      const a = posById[c.from];
      const b = posById[c.to];
      edges.push({ from: c.from, to: c.to, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  // 按 (from→to) 方向分组消息, 每个方向取一个 blip。
  const msgsByDir = new Map<string, MessageBlip[]>();
  for (const m of recentMessages) {
    const key = `${m.from}|${m.to}`;
    const arr = msgsByDir.get(key);
    if (arr) arr.push(m);
    else msgsByDir.set(key, [m]);
  }

  // 为每条 directed (from, to) 计算 blip 位置: 沿 line 的 0.65 处(靠近 to)。
  const blips: { x: number; y: number; color: string; type: MessageType }[] = [];
  for (const [key, msgs] of msgsByDir) {
    const [fromId, toId] = key.split('|');
    const a = posById[fromId];
    const b = posById[toId];
    if (!a || !b) continue;
    const t = 0.65;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const type = topMessageType(msgs);
    blips.push({ x, y, color: MSG_COLOR[type], type });
  }

  // 当前 tick 哪些边"活跃"(有消息), 高亮边。
  const activeEdges = new Set<string>();
  for (const m of recentMessages) {
    const a = m.from < m.to ? m.from : m.to;
    const b = m.from < m.to ? m.to : m.from;
    activeEdges.add(`${a}-${b}`);
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full max-h-[70vh]">
      {edges.map((e) => {
        const isActive = activeEdges.has(`${e.from}-${e.to}`);
        return (
          <line
            key={`${e.from}-${e.to}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={isActive ? 'rgb(82 82 91)' : 'rgb(39 39 42)'}
            strokeWidth={isActive ? 1.5 : 1}
          />
        );
      })}
      {/* Message blips */}
      {blips.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r={6} fill={b.color} opacity={0.3} />
          <circle cx={b.x} cy={b.y} r={3.5} fill={b.color} />
        </g>
      ))}
      {/* Nodes */}
      {positions.map(({ peer, x, y }) => {
        const done = peer.bitfield.filter(Boolean).length;
        const total = peer.bitfield.length;
        const isSeeder = total > 0 && done === total;
        const isSelected = peer.id === selectedPeerId;
        return (
          <g
            key={peer.id}
            transform={`translate(${x}, ${y})`}
            onClick={() => onSelectPeer?.(isSelected ? null : peer.id)}
            style={{ cursor: onSelectPeer ? 'pointer' : 'default' }}
          >
            <circle
              r={NODE_RADIUS + (isSelected ? 4 : 0)}
              fill={isSeeder ? 'rgb(34 197 94)' : 'rgb(39 39 42)'}
              stroke={
                isSelected
                  ? 'rgb(96 165 250)' // blue-400
                  : isSeeder
                    ? 'rgb(74 222 128)'
                    : 'rgb(113 113 122)'
              }
              strokeWidth={isSelected ? 3 : 2}
            />
            <text
              textAnchor="middle"
              dy=".35em"
              fill="white"
              fontSize={13}
              fontWeight={600}
              fontFamily="ui-monospace, monospace"
            >
              {peer.id}
            </text>
            {total > 0 && (
              <g transform={`translate(${-(total * 8) / 2}, ${NODE_RADIUS + 8})`}>
                {peer.bitfield.map((b, i) => (
                  <rect
                    key={i}
                    x={i * 8}
                    y={0}
                    width={6}
                    height={6}
                    fill={b ? 'rgb(74 222 128)' : 'rgb(63 63 70)'}
                  />
                ))}
              </g>
            )}
            <text
              y={NODE_RADIUS + 28 + (total > 0 ? 0 : -8)}
              textAnchor="middle"
              fill="rgb(161 161 170)"
              fontSize={10}
              fontFamily="ui-monospace, monospace"
            >
              {done}/{total}
              {isSeeder ? ' · seeder' : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
