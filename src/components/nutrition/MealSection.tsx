import { Trash2, Plus, Sunrise, Sun, Moon, Cookie, Pencil, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NutritionLog } from '../../lib/types';
import { useNutritionStore } from '../../stores/nutritionStore';
import { toastWithUndo } from '../ui/Toast';

const iconMap: Record<string, React.ElementType> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

// Every action is named for screen readers and gets a 44 px target; icons stay
// readable (neutral-400 at least) on the dark card.
const iconAction = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl transition-colors';

interface Props {
  category: string;
  label: string;
  logs: NutritionLog[];
  onAdd: () => void;
  onEdit: (log: NutritionLog) => void;
  onReuse?: () => void;
}

export default function MealSection({ category, label, logs, onAdd, onEdit, onReuse }: Props) {
  const { t } = useTranslation();
  const { deleteLog, addLog } = useNutritionStore();
  const Icon = iconMap[category] || Cookie;
  const totalCals = logs.reduce((s, l) => s + l.calories, 0);

  const handleDelete = async (log: NutritionLog) => {
    const snapshot = { ...log };
    await deleteLog(snapshot.id);
    // The store already said why a delete failed: no « removed » toast unless the row is gone.
    if (useNutritionStore.getState().logs.some(l => l.id === snapshot.id)) return;
    toastWithUndo(t('nutrition.itemRemoved', { name: snapshot.name }), () =>
      addLog({
        user_id: snapshot.user_id,
        name: snapshot.name,
        calories: snapshot.calories,
        protein: snapshot.protein,
        carbs: snapshot.carbs,
        fat: snapshot.fat,
        category: snapshot.category,
        quantity: snapshot.quantity,
        unit: snapshot.unit,
        logged_at: snapshot.logged_at,
      })
    );
  };

  return (
    <div className="bg-neutral-900/40 border border-neutral-800/30 rounded-2xl overflow-hidden" data-testid={`meal-section-${category}`}>
      <div className="flex items-center gap-2 pl-4 pr-2 py-1.5">
        <Icon size={16} className="text-neutral-400 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{label}</p>
          <p className="text-xs text-neutral-400">{t('nutrition.kcalValue', { value: Math.round(totalCals) })}</p>
        </div>
        {onReuse && (
          <button
            type="button"
            onClick={onReuse}
            aria-label={t('nutrition.reuseMealFor', { meal: label })}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            data-testid="meal-reuse"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span aria-hidden="true">{t('nutrition.reuseShort')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onAdd}
          aria-label={t('nutrition.addFoodTo', { meal: label })}
          className={`${iconAction} text-blue-400 hover:bg-blue-600/20`}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>

      {logs.length > 0 && (
        <div className="border-t border-neutral-800/30">
          {logs.map(log => (
            <div key={log.id} className="flex items-center gap-2 pl-4 pr-2 py-1 border-b border-neutral-800/20 last:border-0 animate-fade-in">
              {/* Name and details on the left, energy on the right: the name keeps room on a 390 px phone. */}
              <div className="flex-1 min-w-0 py-1">
                <p className="text-sm text-neutral-300 truncate">{log.name}</p>
                <p className="text-[11px] text-neutral-500">
                  {log.quantity}{log.unit}
                  {' · '}
                  {t('nutrition.macrosShort', { p: Math.round(log.protein), c: Math.round(log.carbs), f: Math.round(log.fat) })}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium text-white">{t('nutrition.kcalValue', { value: Math.round(log.calories) })}</p>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => onEdit(log)}
                  aria-label={t('nutrition.editItem', { name: log.name })}
                  className={`${iconAction} text-neutral-400 hover:text-blue-400`}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(log)}
                  aria-label={t('nutrition.deleteItem', { name: log.name })}
                  className={`${iconAction} text-neutral-400 hover:text-rose-400`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
