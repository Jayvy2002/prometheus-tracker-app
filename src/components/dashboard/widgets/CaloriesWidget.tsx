import { useNutritionStore } from '../../../stores/nutritionStore';
import { useProfileStore } from '../../../stores/profileStore';
import ProgressRing from '../../ui/ProgressRing';

type WidgetSize = 'small' | 'medium' | 'large';

export default function CaloriesWidget({ size = 'large' }: { size?: WidgetSize }) {
  const { logs } = useNutritionStore();
  const { profile } = useProfileStore();
  const target = profile?.daily_calorie_target ?? 2000;
  const consumed = logs.reduce((sum, l) => sum + l.calories, 0);
  const remaining = Math.max(0, target - consumed);
  const pct = Math.min(100, (consumed / target) * 100);
  const isOver = pct > 100;
  const isComplete = pct >= 95 && pct <= 105;
  const color = isOver ? '#f43f5e' : isComplete ? '#10b981' : '#2563eb';

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <ProgressRing progress={pct} size={52} strokeWidth={4} color={color}>
          <div className="text-[11px] font-bold text-white">{Math.round(consumed)}</div>
        </ProgressRing>
        <span className="text-[10px] text-neutral-500 mt-0.5">/ {target}</span>
        {isComplete && <span className="text-[9px] text-emerald-400 font-semibold animate-fade-in">✓ Goal!</span>}
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className="flex items-center gap-3">
        <ProgressRing progress={pct} size={48} strokeWidth={4} color={color}>
          <div className={`text-xs font-bold ${isComplete ? 'text-emerald-400' : 'text-white'}`}>
            {Math.round(consumed)}
          </div>
        </ProgressRing>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className={`text-lg font-bold ${isComplete ? 'text-emerald-400' : 'text-white'}`}>
              {Math.round(consumed)}
            </span>
            <span className="text-xs text-neutral-500">/ {target} cal</span>
            {isComplete && <span className="text-[10px] text-emerald-400 animate-celebration ml-1">✓</span>}
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 animate-progress-fill"
              style={{
                width: `${pct}%`,
                background: isOver
                  ? 'linear-gradient(90deg, #f43f5e, #fb7185)'
                  : isComplete
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #2563eb, #3b82f6)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5">
      <div className={isComplete ? 'animate-glow-pulse-green rounded-full' : ''}>
        <ProgressRing progress={pct} size={90} strokeWidth={7} color={color}>
          <div className="text-center">
            <div className={`text-base font-bold ${isComplete ? 'text-emerald-400' : 'text-white'}`}>
              {Math.round(consumed)}
            </div>
            <div className="text-[9px] text-neutral-400">cal</div>
          </div>
        </ProgressRing>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Target</span>
          <span className="text-white font-medium">{target} cal</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Consumed</span>
          <span className={`font-medium ${isComplete ? 'text-emerald-400' : 'text-blue-400'}`}>
            {Math.round(consumed)} cal
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Remaining</span>
          <span className={`font-medium ${remaining > 0 ? 'text-sky-400' : isOver ? 'text-rose-400' : 'text-emerald-400'}`}>
            {remaining > 0 ? `${Math.round(remaining)} cal` : isOver ? `+${Math.round(consumed - target)} over` : '✓ Goal met!'}
          </span>
        </div>
        {/* Goal met celebration */}
        {isComplete && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-center animate-fade-in-scale">
            <span className="text-xs font-semibold text-emerald-400">🎯 On target today!</span>
          </div>
        )}
      </div>
    </div>
  );
}
