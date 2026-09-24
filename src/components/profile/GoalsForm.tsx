import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { soloNutritionTargets } from '../../features/nutrition/domain/soloTargets';
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
    setSaving(true);

    // Targets only from real measurements, for the current goal (set in the Goal panel above).
    const computed = soloNutritionTargets(profile, profile.goal);

    const updates = stripSelfServeNutritionTargets({
      daily_water_target_ml: water,
      daily_steps_target: steps,
      ...(computed ?? {}),
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
        {canUpdateCoachOwnedTargets && (
          <Button onClick={handleSave} loading={saving} className="w-full">{t('common.saveChanges')}</Button>
        )}
      </div>
    </div>
  );
}
