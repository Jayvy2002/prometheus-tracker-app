import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { GOALS } from '../../lib/constants';
import { calculateBMR, calculateTDEE, calculateCalorieTarget, calculateMacros, getAge, hasMeasuresForTargets } from '../../lib/utils';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useClientTracking } from '../../lib/useClientTracking';
import { showNutritionField } from '../../lib/clientTracking';
import { stripSelfServeNutritionTargets } from '../../lib/coachOwnedTargets';
import { useResourcePermissions } from '../../lib/useResourcePermissions';

export default function GoalsForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const { canUpdateCoachOwnedTargets } = useResourcePermissions();
  const tracking = useClientTracking();
  const [goal, setGoal] = useState(profile?.goal ?? 'maintain');
  const storedKg = profile?.target_weight_kg ?? 0;
  const displayWeight = profile?.unit_weight === 'lbs' && storedKg ? Math.round(storedKg * 2.20462).toString() : (storedKg ? storedKg.toString() : '');
  const [targetWeight, setTargetWeight] = useState(displayWeight);
  // Empty = no goal (never a prefilled 2 500 ml / 10 000 steps).
  const [waterTarget, setWaterTarget] = useState(profile?.daily_water_target_ml ? String(profile.daily_water_target_ml) : '');
  const [stepsTarget, setStepsTarget] = useState(profile?.daily_steps_target ? String(profile.daily_steps_target) : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !profile) return;

    const water = waterTarget.trim() === '' ? null : Number(waterTarget.replace(/\s/g, ''));
    const steps = stepsTarget.trim() === '' ? null : Number(stepsTarget.replace(/\s/g, ''));
    if (canUpdateCoachOwnedTargets) {
      if (water != null && !(water >= 500 && water <= 10000)) { toast(t('profile.goals.errors.waterInvalidRange', { min: 500, max: '10 000' }), 'error'); return; }
      if (steps != null && !(steps >= 0 && steps <= 100000)) { toast(t('profile.goals.errors.stepsInvalidRange', { min: 0, max: '100 000' }), 'error'); return; }
    }
    if (targetWeight) {
      const minW = profile.unit_weight === 'lbs' ? 66 : 30;
      const maxW = profile.unit_weight === 'lbs' ? 660 : 300;
      const tw = +targetWeight;
      if (isNaN(tw) || tw < minW || tw > maxW) { toast(t('profile.goals.errors.weightInvalidRange', { min: minW, max: maxW, unit: profile.unit_weight ?? 'kg' }), 'error'); return; }
    }

    setSaving(true);

    // Targets only from real measurements; otherwise the current ones stay as they are.
    const canCompute = hasMeasuresForTargets(profile);
    const age = canCompute ? getAge(profile.date_of_birth as string) : 0;
    const bmr = canCompute ? calculateBMR(profile.weight_kg, profile.height_cm, age, profile.gender) : 0;
    const tdee = canCompute ? calculateTDEE(bmr, profile.activity_level) : 0;
    const calorieTarget = canCompute ? calculateCalorieTarget(tdee, goal, bmr) : null;
    const macros = calorieTarget != null ? calculateMacros(calorieTarget, goal, profile.diet_type, profile.weight_kg) : null;

    const rawWeight = +targetWeight || 0;
    const targetKg = profile.unit_weight === 'lbs' ? rawWeight / 2.20462 : rawWeight;

    const updates = stripSelfServeNutritionTargets({
      goal,
      target_weight_kg: targetKg,
      daily_water_target_ml: water,
      daily_steps_target: steps,
      ...(calorieTarget != null && macros ? {
        daily_calorie_target: calorieTarget,
        protein_target: macros.protein,
        carbs_target: macros.carbs,
        fat_target: macros.fat,
      } : {}),
    }, !canUpdateCoachOwnedTargets);

    const result = await updateProfile(user.id, updates);
    setSaving(false);
    if (result.error) {
      toast(result.error, 'error');
      return;
    }
    onBack();
  };

  return (
    <div>
      {!inline && (
        <>
          <button onClick={onBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={18} /> <span className="text-sm">{t('common.back')}</span>
          </button>
          <h2 className="text-xl font-bold text-white mb-6">{t('profile.goals.title')}</h2>
        </>
      )}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-300">{t('profile.goals.goal')}</label>
          {GOALS.map(g => (
            <button
              key={g.value}
              onClick={() => setGoal(g.value)}
              className={`w-full text-left p-3 rounded-xl text-sm transition-all border
                ${goal === g.value
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400'}`}
            >
              <div className="font-medium">{t(`coaching.goalLabels.${g.value}`)}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{t(`coaching.goalLabels.${g.value}Hint`)}</div>
            </button>
          ))}
        </div>
        <Input
          label={`${t('profile.goals.targetWeight')} (${profile?.unit_weight ?? 'kg'})`}
          type="number"
          value={targetWeight}
          onChange={e => setTargetWeight(e.target.value)}
        />
        {!canUpdateCoachOwnedTargets && (
          <p className="text-xs text-neutral-500">{t('profile.goals.coachOwnsTargets')}</p>
        )}
        {canUpdateCoachOwnedTargets && showNutritionField(tracking, 'water') && (
        <Input
          label={t('profile.goals.dailyWater')}
          type="number"
          value={waterTarget}
          onChange={e => setWaterTarget(e.target.value)}
        />
        )}
        {canUpdateCoachOwnedTargets && showNutritionField(tracking, 'steps') && (
        <Input
          label={t('profile.goals.dailySteps')}
          type="number"
          value={stepsTarget}
          onChange={e => setStepsTarget(e.target.value)}
        />
        )}
        <Button onClick={handleSave} loading={saving} className="w-full">{t('common.saveChanges')}</Button>
      </div>
    </div>
  );
}
