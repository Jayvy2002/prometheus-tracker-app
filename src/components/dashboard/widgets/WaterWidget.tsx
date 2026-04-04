import { useNutritionStore } from '../../../stores/nutritionStore';
import { useProfileStore } from '../../../stores/profileStore';
import { Droplets } from 'lucide-react';

type WidgetSize = 'small' | 'medium' | 'large';

export default function WaterWidget({ size = 'large' }: { size?: WidgetSize }) {
  const { waterLogs } = useNutritionStore();
  const { profile } = useProfileStore();
  const target = profile?.daily_water_target_ml ?? 2500;
  const consumed = waterLogs.reduce((sum, l) => sum + l.amount_ml, 0);
  const pct = Math.min(100, (consumed / target) * 100);
  const glasses = Math.floor(consumed / 250);
  const targetGlasses = Math.ceil(target / 250);
  const isGoalMet = pct >= 100;

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5">
        <Droplets
          className={`${isGoalMet ? 'text-emerald-400 animate-float' : 'text-sky-400'}`}
          size={24}
        />
        <span className="text-lg font-bold text-white leading-none">{consumed}</span>
        <span className="text-[10px] text-neutral-500">/ {target} ml</span>
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className="flex items-center gap-3">
        <Droplets
          className={`shrink-0 ${isGoalMet ? 'text-emerald-400' : 'text-sky-400'}`}
          size={20}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className={`text-lg font-bold ${isGoalMet ? 'text-emerald-400' : 'text-white'}`}>
              {consumed}
            </span>
            <span className="text-xs text-neutral-500">/ {target} ml</span>
            {isGoalMet && <span className="text-[10px] text-emerald-400 animate-celebration ml-1">✓</span>}
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 animate-progress-fill"
              style={{
                width: `${pct}%`,
                background: isGoalMet
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #38bdf8, #7dd3fc)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Droplets
          className={`${isGoalMet ? 'text-emerald-400 animate-float' : 'text-sky-400'}`}
          size={20}
        />
        <span className={`text-2xl font-bold ${isGoalMet ? 'text-emerald-400' : 'text-white'}`}>
          {consumed}
        </span>
        <span className="text-sm text-neutral-400">/ {target} ml</span>
        {isGoalMet && (
          <span className="ml-auto text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-0.5 animate-fade-in-scale">
            Goal! 💧
          </span>
        )}
      </div>

      {/* Animated progress bar */}
      <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full animate-progress-fill transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: isGoalMet
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #0284c7, #38bdf8)',
          }}
        />
      </div>

      {/* Glass indicators */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {Array.from({ length: Math.min(targetGlasses, 10) }).map((_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-md flex items-center justify-center transition-all duration-300
              ${i < glasses
                ? (isGoalMet ? 'bg-emerald-500/30 text-emerald-400' : 'bg-sky-500/30 text-sky-400')
                : 'bg-neutral-800 text-neutral-600'
              }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <Droplets size={10} />
          </div>
        ))}
        {targetGlasses > 10 && (
          <span className="text-[10px] text-neutral-600">+{targetGlasses - 10}</span>
        )}
        <span className="text-xs text-neutral-500 ml-1">{glasses}/{targetGlasses} glasses</span>
      </div>
    </div>
  );
}
