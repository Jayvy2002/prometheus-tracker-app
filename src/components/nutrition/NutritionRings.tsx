import { useTranslation } from 'react-i18next';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useProfileStore } from '../../stores/profileStore';
import { useClientTracking } from '../../lib/useClientTracking';
import { anyMacroField, showNutritionField } from '../../lib/clientTracking';
import { nutritionTargetsFromProfile, targetRatio } from '../../lib/nutritionTargets';
import ProgressRing from '../ui/ProgressRing';
import MacroSummary from './MacroSummary';

interface NutritionRingsProps {
  className?: string;
}

/** Same kcal ring + macro bars as the Nutrition page — never invents targets. */
export default function NutritionRings({ className = '' }: NutritionRingsProps) {
  const { t } = useTranslation();
  const { logs } = useNutritionStore();
  const { profile } = useProfileStore();
  const tracking = useClientTracking();
  const targets = nutritionTargetsFromProfile(profile);
  const totalCals = logs.reduce((sum, log) => sum + log.calories, 0);
  const pct = targetRatio(totalCals, targets.calories);

  if (!anyMacroField(tracking)) return null;

  return (
    <div data-testid="nutrition-rings" className={`flex items-center gap-5 ${className}`.trim()}>
      {showNutritionField(tracking, 'calories') ? (
        <ProgressRing progress={pct} size={80} strokeWidth={6} color="#2563eb">
          <div className="text-center">
            <div className="text-sm font-bold text-white leading-tight">{Math.round(totalCals)}</div>
            <div className="text-xs text-neutral-500 leading-tight">
              {targets.calories != null ? `/ ${targets.calories}` : '—'}
            </div>
            <div className="text-xs text-neutral-400">{t('common.kcal')}</div>
          </div>
        </ProgressRing>
      ) : null}
      <MacroSummary />
    </div>
  );
}
