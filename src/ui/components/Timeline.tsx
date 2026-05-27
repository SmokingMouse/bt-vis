interface Props {
  currentTick: number;
  maxTicks: number;
  isPlaying: boolean;
  speed: number;
  onTickChange: (t: number) => void;
  onPlayToggle: () => void;
  onSpeedChange: (s: number) => void;
  onReset: () => void;
}

export function Timeline({
  currentTick,
  maxTicks,
  isPlaying,
  speed,
  onTickChange,
  onPlayToggle,
  onSpeedChange,
  onReset,
}: Props) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onPlayToggle}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-medium w-12"
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-white text-sm font-medium"
      >
        ↺
      </button>
      <input
        type="range"
        min={0}
        max={maxTicks}
        value={currentTick}
        onChange={(e) => onTickChange(Number(e.target.value))}
        className="flex-1 accent-blue-500"
      />
      <span className="text-sm text-zinc-400 w-24 font-mono">
        tick {currentTick.toString().padStart(3, '0')}/{maxTicks}
      </span>
      <select
        value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value))}
        className="bg-zinc-800 text-zinc-50 px-2 py-1 rounded text-sm"
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={4}>4x</option>
        <option value={8}>8x</option>
      </select>
    </div>
  );
}
