import type { StoryStep } from '@/sim/story/steps';

interface Props {
  step: StoryStep;
  stepIndex: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
}

export function StoryPanel({ step, stepIndex, totalSteps, onPrev, onNext, onJump }: Props) {
  const canPrev = stepIndex > 0;
  const canNext = stepIndex < totalSteps - 1;

  return (
    <div className="flex flex-col h-full">
      {/* Progress dots */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {Array.from({ length: totalSteps }, (_, i) => (
          <button
            type="button"
            key={i}
            onClick={() => onJump(i)}
            className={`h-1.5 flex-1 min-w-[18px] rounded-full transition-colors ${
              i < stepIndex
                ? 'bg-blue-700 hover:bg-blue-600'
                : i === stepIndex
                  ? 'bg-blue-400'
                  : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
            title={`Step ${i + 1}`}
          />
        ))}
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-zinc-500 font-mono">
          {String(stepIndex + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
        </span>
        <span className="text-xs text-zinc-500">{step.title}</span>
      </div>

      <h2 className="text-xl font-semibold text-zinc-100 mb-3 leading-tight">{step.title}</h2>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {step.narrative.map((para, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed">
            {para}
          </p>
        ))}

        {step.why && (
          <div className="mt-4 p-3 bg-amber-950/30 border border-amber-900/40 rounded">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1.5 font-semibold">
              为什么这样设计
            </div>
            <p className="text-xs text-amber-100/80 leading-relaxed">{step.why}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-800">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm text-zinc-200"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm text-white font-medium"
        >
          {canNext ? 'Next →' : '完成 ✓'}
        </button>
      </div>
    </div>
  );
}
