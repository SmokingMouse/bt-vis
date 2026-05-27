'use client';

import { useEffect, useMemo, useState } from 'react';
import { createInitialState, run } from '@/sim/engine';
import { SCENES } from '@/sim/scenarios/scenes';
import { STORY_SCENARIO } from '@/sim/story/scenario';
import { STORY_STEPS } from '@/sim/story/steps';
import { NetworkGraph } from '@/ui/components/NetworkGraph';
import { Timeline } from '@/ui/components/Timeline';
import { EventLog } from '@/ui/components/EventLog';
import { PeerDetail } from '@/ui/components/PeerDetail';
import { StoryPanel } from '@/ui/components/StoryPanel';
import type { MessageType } from '@/sim/types';

const SEED = 42;

type Mode = 'story' | 'free';

export default function Home() {
  const [mode, setMode] = useState<Mode>('story');

  // 持久化模式到 URL hash
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromHash = window.location.hash.replace('#', '');
    if (fromHash === 'free' || fromHash === 'story') {
      setMode(fromHash);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.location.hash = mode;
  }, [mode]);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50">
      <header className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">bt-vis</h1>
          <span className="text-sm text-zinc-400">BitTorrent protocol playground</span>
        </div>
        <div className="flex gap-1 bg-zinc-900 p-1 rounded">
          <button
            type="button"
            onClick={() => setMode('story')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              mode === 'story' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Story
          </button>
          <button
            type="button"
            onClick={() => setMode('free')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              mode === 'free' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Free Play
          </button>
        </div>
      </header>

      {mode === 'story' ? <StoryView /> : <FreePlayView />}
    </div>
  );
}

// ── Story View ──────────────────────────────────────────────────────────

function StoryView() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STORY_STEPS[stepIndex];

  // 渐进式 tick 动画: displayTick 平滑追到 step.advanceTo。
  const [displayTick, setDisplayTick] = useState(0);
  useEffect(() => {
    const target = step.advanceTo;
    if (displayTick === target) return;
    if (displayTick > target) {
      // 倒退到上一步: 直接跳(不动画)
      setDisplayTick(target);
      return;
    }
    const id = window.setInterval(() => {
      setDisplayTick((t) => {
        if (t >= target) {
          window.clearInterval(id);
          return target;
        }
        return t + 1;
      });
    }, 400);
    return () => window.clearInterval(id);
  }, [step.advanceTo, displayTick]);

  // 切 step 时如果新 target 比当前低,立即跳过去(避免动画反向卡顿)。
  useEffect(() => {
    if (step.advanceTo < displayTick) setDisplayTick(step.advanceTo);
  }, [step.advanceTo, displayTick]);

  const initialState = useMemo(() => createInitialState(STORY_SCENARIO, SEED), []);
  const { state, events } = useMemo(
    () => run(initialState, STORY_SCENARIO, displayTick),
    [initialState, displayTick],
  );

  // Story 模式只看跟 Me 相关的消息 (减少 swarm 噪音)。
  const recentMessages = useMemo(
    () =>
      events
        .filter((e) => e.tick === displayTick && e.kind === 'message')
        .map((e) => (e.kind === 'message' ? { from: e.message.from, to: e.message.to, type: e.message.type } : null))
        .filter((m): m is { from: string; to: string; type: MessageType } => m !== null)
        .filter((m) => m.from === 'Me' || m.to === 'Me'),
    [events, displayTick],
  );

  // 同样 Event log 只看 Me 相关。
  const meEvents = useMemo(
    () =>
      events.filter((e) => {
        if (e.kind === 'message') return e.message.from === 'Me' || e.message.to === 'Me';
        if (e.kind === 'piece_completed' || e.kind === 'peer_became_seeder') return e.peerId === 'Me';
        if (e.kind === 'handshake_complete') return e.a === 'Me' || e.b === 'Me';
        if (e.kind === 'connection_opened') return e.from === 'Me' || e.to === 'Me';
        if (e.kind === 'peer_joined') return e.peerId === 'Me';
        return true;
      }),
    [events],
  );

  const isAdvancing = displayTick < step.advanceTo;

  return (
    <main className="flex flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-4 flex items-center justify-center relative">
          <NetworkGraph
            state={state}
            recentMessages={recentMessages}
            highlightPeerIds={step.highlight?.peerIds}
            hideOthers={step.hideSwarm}
          />
          {isAdvancing && (
            <div className="absolute top-2 right-2 text-xs text-blue-400 font-mono bg-zinc-950/80 px-2 py-1 rounded">
              ▸ playing tick {displayTick} / {step.advanceTo}
            </div>
          )}
        </div>
        <div className="border-t border-zinc-800 px-4 py-2 h-44 overflow-y-auto">
          <EventLog events={meEvents} limit={50} />
        </div>
      </div>
      <aside className="w-96 border-l border-zinc-800 p-4 bg-zinc-950 flex flex-col">
        <StoryPanel
          step={step}
          stepIndex={stepIndex}
          totalSteps={STORY_STEPS.length}
          onPrev={() => setStepIndex((i) => Math.max(0, i - 1))}
          onNext={() => setStepIndex((i) => Math.min(STORY_STEPS.length - 1, i + 1))}
          onJump={(i) => setStepIndex(i)}
        />
      </aside>
    </main>
  );
}

// ── Free Play View (原 6-scene 模式) ────────────────────────────────────

function FreePlayView() {
  const [sceneId, setSceneId] = useState<string>(SCENES[SCENES.length - 1].id);
  const scene = useMemo(
    () => SCENES.find((s) => s.id === sceneId) ?? SCENES[0],
    [sceneId],
  );
  const [currentTick, setCurrentTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(scene.defaultSpeed);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

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

  const seederCount = Object.values(state.peers).filter(
    (p) => p.bitfield.every(Boolean) && p.bitfield.length > 0,
  ).length;
  const totalPeers = scene.scenario.peers.length;

  const recentMessages = useMemo(
    () =>
      events
        .filter((e) => e.tick === currentTick && e.kind === 'message')
        .map((e) => (e.kind === 'message' ? { from: e.message.from, to: e.message.to, type: e.message.type } : null))
        .filter((m): m is { from: string; to: string; type: MessageType } => m !== null),
    [events, currentTick],
  );

  return (
    <>
      <div className="px-6 py-3 border-b border-zinc-800">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <nav className="flex flex-wrap gap-1">
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
          <div className="text-xs text-zinc-500 font-mono">
            {seederCount}/{totalPeers} seeders · {scene.scenario.torrent.totalPieces} pieces · seed={SEED}
          </div>
        </div>
        <div className="mt-2 max-w-4xl">
          <p className="text-sm text-zinc-300">{scene.description}</p>
          <p className="text-xs text-amber-400 mt-1">💡 {scene.highlight}</p>
        </div>
      </div>

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
    </>
  );
}
