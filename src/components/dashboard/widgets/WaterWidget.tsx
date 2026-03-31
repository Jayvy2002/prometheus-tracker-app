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

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5">
        <Droplets className="text-sky-400" size={24} />
        <span className="text-lg font-bold text-white leading-none">{consumed}</span>
        <span className="text-[10px] text-neutral-500">/ {target} ml</span>
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className="flex items-center gap-3">
        <Droplets className="text-sky-400 shrink-0" size={20} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-white">{consumed}</span>
            <span className="text-xs text-neutral-500">/ {target} ml</span>
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-sky-400 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="text-sky-400" size={20} />
        <span className="text-2xl font-bold text-white">{consumed}</span>
        <span className="text-sm text-neutral-400">/ {target} ml</span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-sky-400 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500 mt-2">{glasses} glasses today</p>
    </div>
  );
}
