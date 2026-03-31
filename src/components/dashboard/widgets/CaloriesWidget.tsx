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
  const color = pct > 100 ? '#f43f5e' : '#2563eb';

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <ProgressRing progress={pct} size={52} strokeWidth={4} color={color}>
          <div className="text-[11px] font-bold text-white">{Math.round(consumed)}</div>
        </ProgressRing>
        <span className="text-[10px] text-neutral-500 mt-0.5">/ {target}</span>
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className="flex items-center gap-3">
        <ProgressRing progress={pct} size={48} strokeWidth={4} color={color}>
          <div className="text-xs font-bold text-white">{Math.round(consumed)}</div>
        </ProgressRing>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-white">{Math.round(consumed)}</span>
            <span className="text-xs text-neutral-500">/ {target} cal</span>
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <ProgressRing progress={pct} size={90} strokeWidth={7} color={color}>
        <div className="text-center">
          <div className="text-lg font-bold text-white">{Math.round(consumed)}</div>
          <div className="text-[10px] text-neutral-400">cal</div>
        </div>
      </ProgressRing>
      <div className="flex-1 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Target</span>
          <span className="text-white font-medium">{target} cal</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Consumed</span>
          <span className="text-blue-400 font-medium">{Math.round(consumed)} cal</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Remaining</span>
          <span className={`font-medium ${remaining > 0 ? 'text-sky-400' : 'text-rose-400'}`}>{Math.round(remaining)} cal</span>
        </div>
      </div>
    </div>
  );
}
