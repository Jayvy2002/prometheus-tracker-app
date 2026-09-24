import { Droplets, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import Card from '../ui/Card';
import { Link } from 'react-router-dom';
import { formatNumber } from '../../lib/utils';
import { nutritionTargetsFromProfile, targetRatio } from '../../features/nutrition/domain/nutritionTargets';

const QUICK_ADD = [150, 250, 500];

export default function WaterTracker() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { waterLogs, addWater, deleteWater, selectedDate } = useNutritionStore();
  // No target chosen = no target shown (never an invented 2 500 ml).
  const target = nutritionTargetsFromProfile(profile).waterMl;
  const consumed = waterLogs.reduce((s, l) => s + l.amount_ml, 0);
  const pct = targetRatio(consumed, target);

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
        <span className="text-xs text-neutral-500 ml-auto">
          {target != null
            ? `${formatNumber(consumed, { maxDigits: 0 })} / ${formatNumber(target, { maxDigits: 0 })} ml`
            : `${formatNumber(consumed, { maxDigits: 0 })} ml`}
        </span>
      </div>
      {target != null ? (
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-sky-400 rounded-full transition-all duration-500 animate-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <Link to="/profile?section=goals" className="block mb-3 text-xs text-sky-400">{t('nutrition.water.setTarget')}</Link>
      )}
      <div className="flex items-center gap-2">
        {QUICK_ADD.map(ml => (
          <button
            key={ml}
            type="button"
            onClick={() => handleAdd(ml)}
            className="flex-1 min-h-11 rounded-lg bg-sky-500/10 text-sky-400 text-xs font-medium hover:bg-sky-500/20 transition-transform active:scale-90"
          >
            +{ml} ml
          </button>
        ))}
        <button
          type="button"
          onClick={handleRemoveLast}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 hover:text-rose-400 transition-colors disabled:opacity-50"
          disabled={waterLogs.length === 0}
          aria-label={t('nutrition.water.removeLast')}
          title={t('nutrition.water.removeLast')}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}
