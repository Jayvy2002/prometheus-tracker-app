import { Droplets, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import Card from '../ui/Card';

const QUICK_ADD = [150, 250, 500];

export default function WaterTracker() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { waterLogs, addWater, deleteWater, selectedDate } = useNutritionStore();
  const target = profile?.daily_water_target_ml ?? 2500;
  const consumed = waterLogs.reduce((s, l) => s + l.amount_ml, 0);
  const pct = Math.min(100, (consumed / target) * 100);

  const handleAdd = async (ml: number) => {
    if (!user) return;
    await addWater({ user_id: user.id, amount_ml: ml, logged_at: selectedDate });
  };

  const handleRemoveLast = async () => {
    const last = waterLogs[waterLogs.length - 1];
    if (last) await deleteWater(last.id);
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="text-sky-400" size={18} />
        <span className="text-sm font-medium text-white">{t('nutrition.water.title')}</span>
        <span className="text-xs text-neutral-500 ml-auto">{consumed} / {target} ml</span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-sky-400 rounded-full transition-all duration-500 animate-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2">
        {QUICK_ADD.map(ml => (
          <button
            key={ml}
            onClick={() => handleAdd(ml)}
            className="flex-1 py-2 rounded-lg bg-sky-500/10 text-sky-400 text-xs font-medium hover:bg-sky-500/20 transition-transform active:scale-90"
          >
            +{ml}ml
          </button>
        ))}
        <button
          onClick={handleRemoveLast}
          className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-rose-400 transition-colors"
          disabled={waterLogs.length === 0}
        >
          <Minus size={14} />
        </button>
      </div>
    </Card>
  );
}
