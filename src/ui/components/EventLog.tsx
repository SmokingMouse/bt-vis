import type { SimEvent } from '@/sim/types';

interface Props {
  events: readonly SimEvent[];
  limit?: number;
}

function formatEvent(e: SimEvent): { text: string; color: string } {
  switch (e.kind) {
    case 'peer_joined':
      return { text: `${e.peerId} joined`, color: 'text-zinc-300' };
    case 'connection_opened':
      return { text: `${e.from} ⇄ ${e.to} opened`, color: 'text-zinc-400' };
    case 'handshake_complete':
      return { text: `${e.a} ⇄ ${e.b} handshake ✓`, color: 'text-cyan-400' };
    case 'piece_completed':
      return { text: `${e.peerId} got piece #${e.piece}`, color: 'text-emerald-400' };
    case 'peer_became_seeder':
      return { text: `${e.peerId} → SEEDER`, color: 'text-emerald-300 font-semibold' };
    case 'message': {
      const m = e.message;
      const arrow = `${m.from} → ${m.to}`;
      switch (m.type) {
        case 'handshake':
          return { text: `${arrow} handshake`, color: 'text-cyan-500' };
        case 'bitfield':
          return { text: `${arrow} bitfield`, color: 'text-cyan-500' };
        case 'interested':
          return { text: `${arrow} interested`, color: 'text-amber-400' };
        case 'not_interested':
          return { text: `${arrow} not_interested`, color: 'text-zinc-500' };
        case 'choke':
          return { text: `${arrow} choke`, color: 'text-red-400' };
        case 'unchoke':
          return { text: `${arrow} unchoke`, color: 'text-emerald-400' };
        case 'have':
          return { text: `${arrow} have #${m.piece}`, color: 'text-zinc-500' };
        case 'request':
          return { text: `${arrow} request #${m.piece}`, color: 'text-yellow-400' };
        case 'piece':
          return { text: `${arrow} piece #${m.piece}`, color: 'text-emerald-400' };
      }
    }
  }
}

export function EventLog({ events, limit = 40 }: Props) {
  const tail = events.slice(-limit).slice().reverse();
  return (
    <div className="text-xs font-mono">
      <h2 className="text-sm font-semibold mb-3 text-zinc-300 sticky top-0 bg-zinc-950 py-1">
        Events ({events.length})
      </h2>
      <ul className="space-y-1">
        {tail.map((e, i) => {
          const { text, color } = formatEvent(e);
          return (
            <li key={`${e.tick}-${i}`} className="flex gap-2">
              <span className="text-zinc-600 w-8 shrink-0">t{e.tick}</span>
              <span className={color}>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
