import { useTranslation } from 'react-i18next';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useProfileStore } from '../../stores/profileStore';
import { useClientTracking } from '../../lib/useClientTracking';
import { showNutritionField } from '../../lib/clientTracking';
import { nutritionTargetsFromProfile, targetRatio } from '../../lib/nutritionTargets';

export default function MacroSummary() {
  const { t } = useTranslation();
  const { logs } = useNutritionStore();
  const { profile } = useProfileStore();
  const tracking = useClientTracking();
  const targets = nutritionTargetsFromProfile(profile);

  const totals = logs.reduce(
    (acc, l) => ({ p: acc.p + l.protein, c: acc.c + l.carbs, f: acc.f + l.fat }),
    { p: 0, c: 0, f: 0 }
  );

  const macros = [
    { label: t('common.protein'), value: Math.round(totals.p), target: targets.protein, color: 'text-sky-400', bg: 'bg-sky-400', key: 'protein' as const },
    { label: t('common.carbs'), value: Math.round(totals.c), target: targets.carbs, color: 'text-amber-400', bg: 'bg-amber-400', key: 'carbs' as const },
    { label: t('common.fat'), value: Math.round(totals.f), target: targets.fat, color: 'text-violet-300', bg: 'bg-violet-400', key: 'fat' as const },
  ].filter(m => showNutritionField(tracking, m.key));

  return (
    <div className="flex-1 space-y-2.5">
      {macros.map(m => {
        const pct = targetRatio(m.value, m.target);
        return (
          <div key={m.label}>
            <div className="flex justify-between text-sm mb-0.5">
              <span className={m.color}>{m.label}</span>
              <span className="text-neutral-400">
                {m.target == null
                  ? `${m.value}g · ${t('common.noTarget')}`
                  : `${m.value}/${m.target}g`}
              </span>
            </div>
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${m.target == null ? 'bg-neutral-600' : m.bg} rounded-full transition-all duration-500`}
                style={{ width: `${m.target == null ? 0 : pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
