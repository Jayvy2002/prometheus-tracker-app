import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  DIET_TYPES, FOOD_ALLERGIES, GOALS, TRAINING_EXPERIENCES, TRAINING_FOCUSES,
} from '../../lib/constants';
import { parseClientVisiblePatch, profileToVisiblePatch } from '../../lib/coachClientProfile';
import type { ResolvedTrackingConfig } from '../../lib/clientTracking';
import type { UserProfile } from '../../lib/types';
import TrackingVarsEditor from './TrackingVarsEditor';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { toast } from '../ui/Toast';
import { optionLabel } from '../../lib/optionLabels';

interface Props {
  clientId: string;
  profile: UserProfile | null;
  tracking: ResolvedTrackingConfig;
  onTrackingChange: (next: ResolvedTrackingConfig) => void;
  onSaved?: (profile: UserProfile | null) => void;
}

export default function ClientProfileEditor({
  clientId, profile, tracking, onTrackingChange, onSaved,
}: Props) {
  const { t } = useTranslation();
  const { saveTrackingConfig, setClientVisibleProfile, fetchClientProfile } = useCoachingStore();
  const [goal, setGoal] = useState(profile?.goal ?? 'maintain');
  const [targetWeight, setTargetWeight] = useState(String(profile?.target_weight_kg || ''));
  // Empty = no goal sent (never a prefilled 2 500 ml / 10 000 steps).
  const [water, setWater] = useState(profile?.daily_water_target_ml ? String(profile.daily_water_target_ml) : '');
  const [steps, setSteps] = useState(profile?.daily_steps_target ? String(profile.daily_steps_target) : '');
  const [experience, setExperience] = useState(profile?.training_experience ?? 'beginner');
  const [frequency, setFrequency] = useState(profile?.training_frequency ?? 3);
  const [focus, setFocus] = useState(profile?.training_focus ?? 'hypertrophy');
  const [injuries, setInjuries] = useState(profile?.injuries_limitations ?? '');
  const [diet, setDiet] = useState(profile?.diet_type ?? 'omnivore');
  const [allergies, setAllergies] = useState<string[]>(profile?.food_allergies ?? []);
  const [sleepAvg, setSleepAvg] = useState(String(profile?.sleep_hours_average ?? ''));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setGoal(profile.goal || 'maintain');
    setTargetWeight(profile.target_weight_kg ? String(profile.target_weight_kg) : '');
    setWater(profile.daily_water_target_ml ? String(profile.daily_water_target_ml) : '');
    setSteps(profile.daily_steps_target ? String(profile.daily_steps_target) : '');
    setExperience(profile.training_experience || 'beginner');
    setFrequency(profile.training_frequency || 3);
    setFocus(profile.training_focus || 'hypertrophy');
    setInjuries(profile.injuries_limitations || '');
    setDiet(profile.diet_type || 'omnivore');
    setAllergies(profile.food_allergies ?? []);
    setSleepAvg(profile.sleep_hours_average != null ? String(profile.sleep_hours_average) : '');
  }, [profile]);

  const toggleAllergy = (value: string) => {
    setAllergies(prev => prev.includes(value) ? prev.filter(x => x !== value) : [...prev, value]);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const trackResult = await saveTrackingConfig(clientId, tracking);
    if (trackResult.error) {
      setSaving(false);
      toast(trackResult.error, 'error');
      return;
    }

    const raw: Record<string, unknown> = {
      goal,
      training_experience: experience,
      training_frequency: frequency,
      training_focus: focus,
      injuries_limitations: injuries,
      diet_type: diet,
      food_allergies: allergies,
    };
    if (targetWeight !== '') raw.target_weight_kg = Number(targetWeight);
    if (water.trim() !== '') raw.daily_water_target_ml = Number(water);
    if (steps.trim() !== '') raw.daily_steps_target = Number(steps);
    if (sleepAvg !== '') raw.sleep_hours_average = Number(sleepAvg);
    const parsed = parseClientVisiblePatch(raw);
    if (!parsed.ok) {
      setSaving(false);
      toast(t('coaching.fiche.invalid', { field: parsed.error }), 'error');
      return;
    }
    const profileResult = await setClientVisibleProfile(clientId, parsed.patch);
    if (profileResult.error) {
      setSaving(false);
      toast(profileResult.error, 'error');
      return;
    }
    const next = await fetchClientProfile(clientId);
    setSaving(false);
    toast(t('coaching.fiche.saved'));
    onSaved?.(next);
  };

  const current = profile ? profileToVisiblePatch(profile) : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-white mb-2">{t('coaching.fiche.goal')}</p>
        <div className="grid grid-cols-3 gap-2">
          {GOALS.map(g => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGoal(g.value)}
              aria-pressed={goal === g.value}
              className={`min-h-11 rounded-xl px-2 py-2 text-xs border ${
                goal === g.value
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
            >
              {/* Same labels as the goal panel and the client list (Vision §6). */}
              {t(`goals.kinds.${g.value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          label={t('coaching.setup.fields.weight')}
          type="number"
          value={targetWeight}
          onChange={e => setTargetWeight(e.target.value)}
        />
        <Input
          label={t('coaching.setup.fields.frequency')}
          type="number"
          value={frequency}
          onChange={e => setFrequency(+e.target.value || 1)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-medium text-neutral-300">
          {t('coaching.setup.fields.experience')}
          <select
            value={experience}
            onChange={e => setExperience(e.target.value)}
            className="mt-1.5 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white"
          >
            {TRAINING_EXPERIENCES.map(x => (
              <option key={x.value} value={x.value}>{optionLabel(t, 'trainingExperience', x.value, x.label)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-300">
          {t('coaching.setup.fields.focus')}
          <select
            value={focus}
            onChange={e => setFocus(e.target.value)}
            className="mt-1.5 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white"
          >
            {TRAINING_FOCUSES.map(x => (
              <option key={x.value} value={x.value}>{optionLabel(t, 'trainingFocus', x.value, x.label)}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-neutral-300">
        {t('coaching.setup.fields.injuries')}
        <textarea
          value={injuries}
          onChange={e => setInjuries(e.target.value)}
          rows={2}
          className="mt-1.5 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="block text-sm font-medium text-neutral-300">
        {t('coaching.setup.fields.diet')}
        <select
          value={diet}
          onChange={e => setDiet(e.target.value)}
          className="mt-1.5 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white"
        >
          {DIET_TYPES.map(x => (
            <option key={x.value} value={x.value}>{optionLabel(t, 'diet', x.value, x.label)}</option>
          ))}
        </select>
      </label>

      <div>
        <p className="text-xs font-medium text-neutral-400 mb-1.5">{t('coaching.setup.fields.allergies')}</p>
        <div className="flex flex-wrap gap-1.5">
          {FOOD_ALLERGIES.map(a => (
            <button
              key={a.value}
              type="button"
              onClick={() => toggleAllergy(a.value)}
              className={`text-[11px] px-2 py-1 rounded-lg border ${
                allergies.includes(a.value)
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-neutral-800 text-neutral-400'
              }`}
            >
              {optionLabel(t, 'allergies', a.value, a.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          label={t('profile.goals.dailyWater')}
          type="number"
          value={water}
          onChange={e => setWater(e.target.value)}
        />
        <Input
          label={t('profile.goals.dailySteps')}
          type="number"
          value={steps}
          onChange={e => setSteps(e.target.value)}
        />
      </div>

      <Input
        label={t('coaching.setup.fields.sleep')}
        type="number"
        value={sleepAvg}
        onChange={e => setSleepAvg(e.target.value)}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-white">{t('coaching.setup.targets')}</p>
        <p className="text-[11px] text-neutral-500">{t('coaching.fiche.targetsHint')}</p>
        {current && current.daily_calorie_target ? (
          <p className="text-[11px] text-neutral-300">
            {t('coaching.setup.profileTargets', {
              calories: current.daily_calorie_target,
              protein: current.protein_target,
              carbs: current.carbs_target,
              fat: current.fat_target,
            })}
          </p>
        ) : (
          <p className="text-[11px] text-neutral-500">{t('coaching.fiche.noSentTargets')}</p>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800 p-3">
        <p className="text-sm font-medium text-white mb-1">{t('coaching.setup.tracking')}</p>
        <p className="text-xs text-neutral-500 mb-3">{t('coaching.setup.trackingHint')}</p>
        <TrackingVarsEditor value={tracking} onChange={onTrackingChange} />
      </div>

      <Button onClick={() => void handleSave()} loading={saving} className="w-full">
        {t('coaching.fiche.save')}
      </Button>
      <p className="text-[11px] text-neutral-600 text-center">{t('coaching.fiche.confirmHint')}</p>
    </div>
  );
}
