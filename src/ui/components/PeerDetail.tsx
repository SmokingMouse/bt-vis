import type { Connection, PeerId, SimState } from '@/sim/types';
import { connKey } from '@/sim/types';

interface Props {
  state: SimState;
  selectedPeerId: PeerId | null;
}

function ConnRow({ conn, fromPeerName }: { conn: Connection; fromPeerName: string }) {
  const peerInfo = conn.state.peerBitfield
    ? `${conn.state.peerBitfield.filter(Boolean).length}/${conn.state.peerBitfield.length}`
    : '—';

  return (
    <div className="flex justify-between text-xs py-1 border-b border-zinc-800/50 last:border-b-0">
      <span className="text-zinc-400 font-mono">
        {fromPeerName} → {conn.to}
      </span>
      <div className="flex gap-1.5 items-center text-[10px]">
        {!conn.state.handshakeSent && <span className="text-zinc-600">no-hs</span>}
        {conn.state.amInterested && <span className="text-amber-400">int</span>}
        {!conn.state.amInterested && conn.state.interestExpressed && (
          <span className="text-zinc-500">!int</span>
        )}
        {!conn.state.amChoking && conn.state.handshakeSent && (
          <span className="text-green-400">unch</span>
        )}
        {conn.state.amChoking && conn.state.handshakeSent && (
          <span className="text-red-400">chk</span>
        )}
        <span className="text-zinc-500">peer={peerInfo}</span>
        {conn.state.piecesReceived > 0 && (
          <span className="text-emerald-300">↓{conn.state.piecesReceived}</span>
        )}
      </div>
    </div>
  );
}

export function PeerDetail({ state, selectedPeerId }: Props) {
  if (!selectedPeerId || !state.peers[selectedPeerId]) {
    return (
      <div className="border border-zinc-800 rounded p-3 text-xs text-zinc-500">
        点击网络图中的节点查看详情
      </div>
    );
  }

  const peer = state.peers[selectedPeerId];
  const done = peer.bitfield.filter(Boolean).length;
  const total = peer.bitfield.length;
  const isSeeder = total > 0 && done === total;

  // 收集所有 outgoing connections (peer→other)
  const outgoing: Connection[] = [];
  for (const key of Object.keys(state.connections).sort()) {
    const c = state.connections[key];
    if (c.from === selectedPeerId) outgoing.push(c);
  }

  return (
    <div className="border border-zinc-800 rounded p-3 text-xs">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-100">
          {peer.id} {isSeeder && <span className="text-emerald-400 text-xs">· seeder</span>}
        </h3>
        <span className="text-zinc-500 font-mono">
          {done}/{total} pieces
        </span>
      </div>

      {/* Bitfield 大图 */}
      {total > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">bitfield</div>
          <div className="flex gap-0.5">
            {peer.bitfield.map((b, i) => (
              <div
                key={i}
                title={`piece ${i}: ${b ? 'have' : 'missing'}`}
                className={`h-4 flex-1 rounded-sm ${
                  b ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Capacity */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
        <div>
          <span className="text-zinc-500">up: </span>
          <span className="text-zinc-300 font-mono">{peer.uploadCapacity}</span>
        </div>
        <div>
          <span className="text-zinc-500">down: </span>
          <span className="text-zinc-300 font-mono">{peer.downloadCapacity}</span>
        </div>
      </div>

      {/* Connections */}
      <div>
        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">
          connections ({outgoing.length})
        </div>
        {outgoing.map((c) => (
          <ConnRow key={connKey(c.from, c.to)} conn={c} fromPeerName={c.from} />
        ))}
      </div>
    </div>
  );
}
