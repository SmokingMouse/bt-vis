'use client';

import { useEffect, useMemo, useState } from 'react';
import { createInitialState, run } from '@/sim/engine';
import { SCENES } from '@/sim/scenarios/scenes';
import { NetworkGraph } from '@/ui/components/NetworkGraph';
import { Timeline } from '@/ui/components/Timeline';
import { EventLog } from '@/ui/components/EventLog';
import { PeerDetail } from '@/ui/components/PeerDetail';

const SEED = 42;

export default function Home() {
  const [sceneId, setSceneId] = useState<string>(SCENES[0].id);
  const scene = useMemo(
    () => SCENES.find((s) => s.id === sceneId) ?? SCENES[0],
    [sceneId],
  );
  const [currentTick, setCurrentTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(scene.defaultSpeed);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

  // 切换 scene 时重置 tick + speed + 暂停播放 + 取消选中。
  useEffect(() => {
    setCurrentTick(0);
    setIsPlaying(false);
    setSpeed(scene.defaultSpeed);
    setSelectedPeerId(null);
  }, [scene]);

  const initialState = useMemo(() => createInitialState(scene.scenario, SEED), [scene]);
  const { state, events } = useMemo(
    () => run(initialState, scene.scenario, currentTick),
    [initialState, scene.scenario, currentTick],
  );

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setCurrentTick((t) => {
        if (t >= scene.maxTicks) {
          setIsPlaying(false);
          return scene.maxTicks;
        }
        return t + 1;
      });
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [isPlaying, speed, scene.maxTicks]);

  const seederCount = Object.values(state.peers).filter((p) =>
    p.bitfield.every(Boolean) && p.bitfield.length > 0,
  ).length;
  const totalPeers = scene.scenario.peers.length;

  // 取当前 tick 的 message events (用于 NetworkGraph 上的飞行圆点)。
  const recentMessages = useMemo(
    () =>
      events
        .filter((e) => e.tick === currentTick && e.kind === 'message')
        .map((e) => {
          if (e.kind !== 'message') return null;
          return { from: e.message.from, to: e.message.to, type: e.message.type };
        })
        .filter((m): m is { from: string; to: string; type: import('@/sim/types').MessageType } => m !== null),
    [events, currentTick],
  );

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50">
      <header className="px-6 py-4 border-b border-zinc-800">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">bt-vis</h1>
            <span className="text-sm text-zinc-400">BitTorrent protocol playground</span>
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            {seederCount}/{totalPeers} seeders · {scene.scenario.torrent.totalPieces} pieces · seed={SEED}
          </div>
        </div>

        {/* Scene selector */}
        <nav className="flex flex-wrap gap-1 mt-3">
          {SCENES.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setSceneId(s.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                s.id === sceneId
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Description + Highlight */}
        <div className="mt-3 max-w-4xl">
          <p className="text-sm text-zinc-300">{scene.description}</p>
          <p className="text-xs text-amber-400 mt-1">💡 {scene.highlight}</p>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-4 flex items-center justify-center">
          <NetworkGraph
            state={state}
            recentMessages={recentMessages}
            selectedPeerId={selectedPeerId}
            onSelectPeer={setSelectedPeerId}
          />
        </div>
        <aside className="w-96 border-l border-zinc-800 p-4 overflow-y-auto bg-zinc-950 space-y-4">
          <PeerDetail state={state} selectedPeerId={selectedPeerId} />
          <EventLog events={events} />
        </aside>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-4">
        <Timeline
          currentTick={currentTick}
          maxTicks={scene.maxTicks}
          isPlaying={isPlaying}
          speed={speed}
          onTickChange={setCurrentTick}
          onPlayToggle={() => setIsPlaying((p) => !p)}
          onSpeedChange={setSpeed}
          onReset={() => {
            setIsPlaying(false);
            setCurrentTick(0);
          }}
        />
      </footer>
    </div>
  );
}
