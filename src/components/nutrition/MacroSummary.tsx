import { useTranslation } from 'react-i18next';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useProfileStore } from '../../stores/profileStore';

export default function MacroSummary() {
  const { t } = useTranslation();
  const { logs } = useNutritionStore();
  const { profile } = useProfileStore();

  const totals = logs.reduce(
    (acc, l) => ({ p: acc.p + l.protein, c: acc.c + l.carbs, f: acc.f + l.fat }),
    { p: 0, c: 0, f: 0 }
  );

  const macros = [
    { label: t('common.protein'), value: Math.round(totals.p), target: profile?.protein_target ?? 150, color: 'text-sky-400', bg: 'bg-sky-400' },
    { label: t('common.carbs'), value: Math.round(totals.c), target: profile?.carbs_target ?? 250, color: 'text-amber-400', bg: 'bg-amber-400' },
    { label: t('common.fat'), value: Math.round(totals.f), target: profile?.fat_target ?? 65, color: 'text-rose-400', bg: 'bg-rose-400' },
  ];

  return (
    <div className="flex-1 space-y-2.5">
      {macros.map(m => {
        const pct = Math.min(100, (m.value / m.target) * 100);
        return (
          <div key={m.label}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className={m.color}>{m.label}</span>
              <span className="text-neutral-400">{m.value}/{m.target}g</span>
            </div>
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div className={`h-full ${m.bg} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
