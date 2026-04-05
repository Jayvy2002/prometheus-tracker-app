import { useTranslation } from 'react-i18next';
import { useNutritionStore } from '../../../stores/nutritionStore';
import { useProfileStore } from '../../../stores/profileStore';

type WidgetSize = 'small' | 'medium' | 'large';

export default function MacrosWidget({ size = 'large' }: { size?: WidgetSize }) {
  const { t } = useTranslation();
  const { logs } = useNutritionStore();
  const { profile } = useProfileStore();

  const totals = logs.reduce(
    (acc, l) => ({ protein: acc.protein + l.protein, carbs: acc.carbs + l.carbs, fat: acc.fat + l.fat }),
    { protein: 0, carbs: 0, fat: 0 }
  );

  const targets = {
    protein: profile?.protein_target ?? 150,
    carbs: profile?.carbs_target ?? 250,
    fat: profile?.fat_target ?? 65,
  };

  const macros = [
    { name: t('widgets.macros.protein'), short: t('widgets.macros.proteinShort'), current: Math.round(totals.protein), target: targets.protein, color: 'bg-sky-400', textColor: 'text-sky-400' },
    { name: t('widgets.macros.carbs'), short: t('widgets.macros.carbsShort'), current: Math.round(totals.carbs), target: targets.carbs, color: 'bg-amber-400', textColor: 'text-amber-400' },
    { name: t('widgets.macros.fat'), short: t('widgets.macros.fatShort'), current: Math.round(totals.fat), target: targets.fat, color: 'bg-rose-400', textColor: 'text-rose-400' },
  ];

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        {macros.map(m => (
          <div key={m.name} className="flex items-center gap-2 w-full">
            <span className={`text-[10px] font-semibold ${m.textColor} w-3`}>{m.short}</span>
            <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${m.color} rounded-full transition-all duration-700`}
                style={{ width: `${Math.min(100, (m.current / m.target) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-white font-medium w-6 text-right">{m.current}</span>
          </div>
        ))}
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className="flex gap-3">
        {macros.map(m => {
          const pct = Math.min(100, (m.current / m.target) * 100);
          return (
            <div key={m.name} className="flex-1 min-w-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">{m.short}</span>
                <span className="text-white font-medium">{m.current}g</span>
              </div>
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div className={`h-full ${m.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {macros.map(m => {
        const pct = Math.min(100, (m.current / m.target) * 100);
        return (
          <div key={m.name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-neutral-400">{m.name}</span>
              <span className="text-white font-medium">{m.current}g / {m.target}g</span>
            </div>
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div className={`h-full ${m.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
