import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { GOALS } from '../../lib/constants';
import { calculateBMR, calculateTDEE, calculateCalorieTarget, calculateMacros, getAge } from '../../lib/utils';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useClientTracking } from '../../lib/useClientTracking';
import { showNutritionField } from '../../lib/clientTracking';

export default function GoalsForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const tracking = useClientTracking();
  const [goal, setGoal] = useState(profile?.goal ?? 'maintain');
  const storedKg = profile?.target_weight_kg ?? 0;
  const displayWeight = profile?.unit_weight === 'lbs' && storedKg ? Math.round(storedKg * 2.20462).toString() : (storedKg ? storedKg.toString() : '');
  const [targetWeight, setTargetWeight] = useState(displayWeight);
  const [waterTarget, setWaterTarget] = useState(profile?.daily_water_target_ml?.toString() ?? '2500');
  const [stepsTarget, setStepsTarget] = useState(profile?.daily_steps_target?.toString() ?? '10000');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !profile) return;

    const water = +waterTarget;
    const steps = +stepsTarget;
    if (water < 500 || water > 10000) { toast(`${t('profile.goals.errors.waterInvalid')} (500–10 000 ml).`, 'error'); return; }
    if (steps < 0 || steps > 100000) { toast(`${t('profile.goals.errors.stepsInvalid')} (0–100 000).`, 'error'); return; }
    if (targetWeight) {
      const minW = profile.unit_weight === 'lbs' ? 66 : 30;
      const maxW = profile.unit_weight === 'lbs' ? 660 : 300;
      const tw = +targetWeight;
      if (isNaN(tw) || tw < minW || tw > maxW) { toast(`${t('profile.goals.errors.weightInvalid')} (${minW}–${maxW} ${profile.unit_weight ?? 'kg'}).`, 'error'); return; }
    }

    setSaving(true);

    const age = profile.date_of_birth ? getAge(profile.date_of_birth) : 25;
    const bmr = calculateBMR(profile.weight_kg, profile.height_cm, age, profile.gender);
    const tdee = calculateTDEE(bmr, profile.activity_level);
    const calories = calculateCalorieTarget(tdee, goal);
    const macros = calculateMacros(calories, goal, profile.diet_type, profile.weight_kg);

    const rawWeight = +targetWeight || 0;
    const targetKg = profile.unit_weight === 'lbs' ? rawWeight / 2.20462 : rawWeight;

    await updateProfile(user.id, {
      goal,
      target_weight_kg: targetKg,
      daily_water_target_ml: water,
      daily_steps_target: steps,
      daily_calorie_target: calories,
      protein_target: macros.protein,
      carbs_target: macros.carbs,
      fat_target: macros.fat,
    });

    setSaving(false);
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
              <div className="font-medium">{g.label}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{g.description}</div>
            </button>
          ))}
        </div>
        <Input
          label={`${t('profile.goals.targetWeight')} (${profile?.unit_weight ?? 'kg'})`}
          type="number"
          value={targetWeight}
          onChange={e => setTargetWeight(e.target.value)}
        />
        {showNutritionField(tracking, 'water') && (
        <Input
          label={t('profile.goals.dailyWater')}
          type="number"
          value={waterTarget}
          onChange={e => setWaterTarget(e.target.value)}
        />
        )}
        {showNutritionField(tracking, 'steps') && (
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
