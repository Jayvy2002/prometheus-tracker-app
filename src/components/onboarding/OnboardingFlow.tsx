import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User, Ruler, Dumbbell, Footprints, Salad, Target, Sparkles,
  ChevronRight, ChevronLeft, Check, AlertTriangle, Moon
} from 'lucide-react';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { useAuthStore } from '../../stores/authStore';
import WallSignOut from '../auth/WallSignOut';
import { useCoachingStore, clearOnboardingDeferred, setOnboardingDeferred } from '../../stores/coachingStore';
import {
  ACTIVITY_LEVELS, GOALS, DIET_TYPES, FOOD_ALLERGIES,
  TRAINING_EXPERIENCES, TRAINING_FOCUSES, HYDRATION_HABITS,
} from '../../lib/constants';
import {
  calculateBMR, calculateEnhancedTDEE, calculateCalorieTarget, calculateMacros,
  calculateWaterTarget, getAge, todayStr,
} from '../../lib/utils';
import { isCoachedAthlete } from '../../lib/coachRole';
import { stripSelfServeNutritionTargets } from '../../lib/coachOwnedTargets';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';
import { optionDescription, optionLabel, type OptionGroup } from '../../lib/optionLabels';

const TOTAL_STEPS = 4;

interface FormData {
  full_name: string;
  gender: string;
  date_of_birth: string;
  height_cm: number;
  weight_kg: number;
  target_weight_kg: number;
  activity_level: string;
  goal: string;
  daily_steps_average: number;
  sleep_hours_average: number;
  training_experience: string;
  training_frequency: number;
  training_focus: string;
  injuries_limitations: string;
  diet_type: string;
  food_allergies: string[];
  hydration_habit: string;
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-500 ${
            i < step ? 'bg-blue-500' : i === step ? 'bg-blue-400' : 'bg-neutral-800'
          }`}
        />
      ))}
    </div>
  );
}

function StepHeader({ icon: Icon, title, subtitle }: { icon: typeof User; title: string; subtitle: string }) {
  return (
    <div className="text-center mb-8 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
        <Icon size={28} className="text-blue-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-neutral-400">{subtitle}</p>
    </div>
  );
}

function SelectGrid({ options, value, onChange, columns = 2, group }: {
  options: readonly { value: string; label: string; description?: string }[];
  value: string;
  onChange: (val: string) => void;
  columns?: 2 | 3;
  group: OptionGroup;
}) {
  const { t } = useTranslation();
  return (
    <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`p-3 rounded-xl border text-left transition-all min-h-11 ${
            value === opt.value
              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
              : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
          }`}
        >
          <span className={`text-sm font-medium ${value === opt.value ? 'text-blue-300' : 'text-white'}`}>
            {optionLabel(t, group, opt.value, opt.label)}
          </span>
          {opt.description && (
            <span className="block text-xs text-neutral-500 mt-0.5">
              {optionDescription(t, group, opt.value, opt.description)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ChipSelect({ options, selected, onChange, group }: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
  group: OptionGroup;
}) {
  const { t } = useTranslation();
  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`min-h-11 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            selected.includes(opt.value)
              ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40'
              : 'bg-neutral-800/80 text-neutral-400 hover:text-white hover:bg-neutral-700/80'
          }`}
        >
          {optionLabel(t, group, opt.value, opt.label)}
        </button>
      ))}
    </div>
  );
}

// --- Step 1: About You ---
function StepPersonal({ form, setForm, banner = true }: { form: FormData; setForm: (f: FormData) => void; banner?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in-up">
      {banner ? <StepHeader icon={User} title={t('onboarding.steps.aboutYou')} subtitle={t('onboarding.steps.aboutYouSub')} /> : null}

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1.5 block">{t('onboarding.fields.fullName')}</label>
        <input
          type="text"
          value={form.full_name}
          onChange={e => setForm({ ...form, full_name: e.target.value })}
          className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          placeholder={t('onboarding.fields.fullNamePlaceholder')}
        />
      </div>

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.gender')}</label>
        <div className="grid grid-cols-3 gap-2">
          {['male', 'female', 'other'].map(g => (
            <button
              key={g}
              onClick={() => setForm({ ...form, gender: g })}
              className={`py-3 rounded-xl text-sm font-medium transition-all ${
                form.gender === g
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/40'
                  : 'bg-neutral-900/60 text-neutral-400 border border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {t(`onboarding.gender.${g}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1.5 block">{t('onboarding.fields.dateOfBirth')}</label>
        <input
          type="date"
          value={form.date_of_birth}
          onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
          className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
        />
      </div>
    </div>
  );
}

// --- Step 2: Your Body ---
function StepPhysical({ form, setForm, banner = true }: { form: FormData; setForm: (f: FormData) => void; banner?: boolean }) {
  const { t } = useTranslation();
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const shown = (kg: number) => unit === 'lbs' ? Math.round(kg * 2.20462 * 10) / 10 : kg;
  return (
    <div className="space-y-6 animate-fade-in-up">
      {banner ? <StepHeader icon={Ruler} title={t('onboarding.steps.yourBody')} subtitle={t('onboarding.steps.yourBodySub')} /> : null}

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider">{t('onboarding.fields.height')}</label>
          <span className="text-lg font-bold text-white">{form.height_cm} cm</span>
        </div>
        <input
          type="range"
          min={120} max={230} step={1}
          value={form.height_cm}
          onChange={e => setForm({ ...form, height_cm: +e.target.value })}
          className="w-full accent-blue-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider">{t('onboarding.fields.currentWeight')}</label>
          <span className="text-lg font-bold text-white">{shown(form.weight_kg)} {unit}</span>
        </div>
        <input
          type="range"
          min={30} max={200} step={0.5}
          value={form.weight_kg}
          onChange={e => setForm({ ...form, weight_kg: +e.target.value })}
          className="w-full accent-blue-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider">{t('onboarding.fields.targetWeight')}</label>
          <span className="text-lg font-bold text-white">{shown(form.target_weight_kg)} {unit}</span>
        </div>
        <input
          type="range"
          min={30} max={200} step={0.5}
          value={form.target_weight_kg}
          onChange={e => setForm({ ...form, target_weight_kg: +e.target.value })}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between mt-1 text-xs text-neutral-500">
          <span>{shown(30)} {unit}</span>
          <button type="button" className="min-h-11 px-2" onClick={() => setUnit(unit === 'kg' ? 'lbs' : 'kg')}>{unit === 'kg' ? 'lb' : 'kg'}</button>
          <span>{shown(200)} {unit}</span>
        </div>
      </div>
    </div>
  );
}

// --- Step 3: Training Background ---
function StepTraining({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Dumbbell} title={t('onboarding.steps.training')} subtitle={t('onboarding.steps.trainingSub')} />

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.experience')}</label>
        <SelectGrid group="trainingExperience" options={TRAINING_EXPERIENCES} value={form.training_experience} onChange={v => setForm({ ...form, training_experience: v })} />
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider">{t('onboarding.fields.sessionsPerWeek')}</label>
          <span className="text-lg font-bold text-white">{form.training_frequency}x</span>
        </div>
        <input
          type="range"
          min={1} max={7} step={1}
          value={form.training_frequency}
          onChange={e => setForm({ ...form, training_frequency: +e.target.value })}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between mt-1 text-[10px] text-neutral-600">
          <span>1</span>
          <span>7</span>
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.trainingFocus')}</label>
        <SelectGrid group="trainingFocus" options={TRAINING_FOCUSES} value={form.training_focus} onChange={v => setForm({ ...form, training_focus: v })} />
      </div>

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1.5 block">{t('onboarding.fields.injuries')}</label>
        <textarea
          value={form.injuries_limitations}
          onChange={e => setForm({ ...form, injuries_limitations: e.target.value })}
          rows={2}
          className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none placeholder-neutral-600"
          placeholder={t('onboarding.fields.injuriesPlaceholder')}
        />
      </div>
    </div>
  );
}

// --- Step 4: Daily Life ---
function StepLifestyle({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Footprints} title={t('onboarding.steps.lifestyle')} subtitle={t('onboarding.steps.lifestyleSub')} />

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.activityOutside')}</label>
        <SelectGrid group="activity" options={ACTIVITY_LEVELS} value={form.activity_level} onChange={v => setForm({ ...form, activity_level: v })} />
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider">{t('onboarding.fields.dailySteps')}</label>
          <span className="text-lg font-bold text-white">{form.daily_steps_average.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min={1000} max={25000} step={500}
          value={form.daily_steps_average}
          onChange={e => setForm({ ...form, daily_steps_average: +e.target.value })}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between mt-1 text-[10px] text-neutral-600">
          <span>1,000</span>
          <span>25,000</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
            <Moon size={12} /> {t('onboarding.fields.sleepHours')}
          </label>
          <span className="text-lg font-bold text-white">{form.sleep_hours_average}h</span>
        </div>
        <input
          type="range"
          min={4} max={10} step={0.5}
          value={form.sleep_hours_average}
          onChange={e => setForm({ ...form, sleep_hours_average: +e.target.value })}
          className="w-full accent-blue-500"
        />
      </div>
    </div>
  );
}

// --- Step 5: Nutrition Habits ---
function StepNutrition({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Salad} title={t('onboarding.steps.nutrition')} subtitle={t('onboarding.steps.nutritionSub')} />

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.diet')}</label>
        <SelectGrid group="diet" options={DIET_TYPES} value={form.diet_type} onChange={v => setForm({ ...form, diet_type: v })} />
      </div>

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.allergies')}</label>
        <ChipSelect group="allergies" options={FOOD_ALLERGIES} selected={form.food_allergies} onChange={v => setForm({ ...form, food_allergies: v })} />
        {form.food_allergies.length === 0 && (
          <p className="text-[11px] text-neutral-600 mt-1.5">{t('onboarding.fields.tapNone')}</p>
        )}
      </div>

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.hydration')}</label>
        <SelectGrid group="hydration" options={HYDRATION_HABITS} value={form.hydration_habit} onChange={v => setForm({ ...form, hydration_habit: v })} />
      </div>
    </div>
  );
}

// --- Step 6: Your Goal ---
function StepGoalMotivation({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Target} title={t('onboarding.steps.yourGoal')} subtitle={t('onboarding.steps.yourGoalSub')} />

      <div>
        <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block">{t('onboarding.fields.bodyGoal')}</label>
        <SelectGrid group="goals" options={GOALS} value={form.goal} onChange={v => setForm({ ...form, goal: v })} columns={3} />
      </div>
    </div>
  );
}

// --- Step 8: Summary ---
function StepSummary({ form, coached }: { form: FormData; coached: boolean }) {
  const { t } = useTranslation();
  const age = form.date_of_birth ? getAge(form.date_of_birth) : 25;
  const bmr = calculateBMR(form.weight_kg, form.height_cm, age, form.gender);
  const tdee = calculateEnhancedTDEE(bmr, form.activity_level, form.daily_steps_average, form.training_frequency);
  const calorieTarget = calculateCalorieTarget(tdee, form.goal, bmr);
  const macros = calculateMacros(calorieTarget, form.goal, form.diet_type, form.weight_kg);
  const waterTarget = calculateWaterTarget(form.weight_kg, form.daily_steps_average, form.activity_level, form.hydration_habit);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Sparkles} title={t('onboarding.steps.summary')} subtitle={t('onboarding.steps.summarySub')} />

      {coached ? (
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5">
        <p className="text-sm text-neutral-300">{t('onboarding.fields.coachOwnsTargets')}</p>
      </div>
      ) : (
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5">
        <h3 className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-3">{t('onboarding.fields.dailyTargets')}</h3>
        <div className="text-center mb-4">
          <span className="text-4xl font-bold text-white">{calorieTarget}</span>
          <span className="text-sm text-neutral-500 ml-1">{t('onboarding.summary.calDay')}</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-blue-500/10">
            <span className="text-lg font-bold text-blue-400">{macros.protein}g</span>
            <span className="block text-[10px] text-neutral-500 mt-0.5">{t('common.protein')}</span>
          </div>
          <div className="text-center p-3 rounded-xl bg-amber-500/10">
            <span className="text-lg font-bold text-amber-400">{macros.carbs}g</span>
            <span className="block text-[10px] text-neutral-500 mt-0.5">{t('common.carbs')}</span>
          </div>
          <div className="text-center p-3 rounded-xl bg-rose-500/10">
            <span className="text-lg font-bold text-rose-400">{macros.fat}g</span>
            <span className="block text-[10px] text-neutral-500 mt-0.5">{t('common.fat')}</span>
          </div>
        </div>
      </div>
      )}

      {/* Key Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{t('onboarding.summary.bmr')}</span>
          <span className="block text-lg font-bold text-white">{Math.round(bmr)} kcal</span>
        </div>
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
          <span className="text-xs text-neutral-500 uppercase tracking-wider">{t('onboarding.summary.tdee')}</span>
          <span className="block text-lg font-bold text-white">{tdee} kcal</span>
        </div>
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{t('profile.goals.dailyWater')}</span>
          <span className="block text-lg font-bold text-white">{(waterTarget / 1000).toFixed(1)}L</span>
        </div>
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{t('onboarding.fields.sessionsPerWeek')}</span>
          <span className="block text-lg font-bold text-white">{t('onboarding.summary.sessionsShort', { n: form.training_frequency })}</span>
        </div>
      </div>

      {/* Recovery note */}
      {(form.sleep_hours_average < 6.5) && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-300">{t('onboarding.fields.recoveryNotice')}</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {t('onboarding.fields.recoveryBody')}
            </p>
          </div>
        </div>
      )}

      {/* Diet summary */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{t('onboarding.fields.yourProfile')}</span>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-medium">
            {optionLabel(t, 'diet', form.diet_type)}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium">
            {optionLabel(t, 'trainingFocus', form.training_focus)}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-medium">
            {optionLabel(t, 'trainingExperience', form.training_experience)}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Main Onboarding Component ---
export default function OnboardingFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { updateProfile } = useProfileStore();
  const { addMeasurement } = useWeightStore();
  const { user } = useAuthStore();
  const myCoach = useCoachingStore(st => st.myCoach);
  const coachingRole = useCoachingStore(st => st.coachingRole);
  const coached = isCoachedAthlete(coachingRole, myCoach);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormData>({
    full_name: '',
    gender: 'male',
    date_of_birth: '',
    height_cm: 175,
    weight_kg: 75,
    target_weight_kg: 75,
    activity_level: 'moderate',
    goal: 'maintain',
    daily_steps_average: 7000,
    sleep_hours_average: 7.5,
    training_experience: 'beginner',
    training_frequency: 3,
    training_focus: 'hypertrophy',
    injuries_limitations: '',
    diet_type: 'omnivore',
    food_allergies: [],
    hydration_habit: 'average',
  });

  const canProceed = () => {
    switch (step) {
      case 0: return form.full_name.trim().length > 0 && form.date_of_birth.length > 0;
      default: return true;
    }
  };

  const finish = async () => {
    if (!user || saving) return;
    setSaving(true);

    const age = form.date_of_birth ? getAge(form.date_of_birth) : 25;
    const bmr = calculateBMR(form.weight_kg, form.height_cm, age, form.gender);
    const tdee = calculateEnhancedTDEE(bmr, form.activity_level, form.daily_steps_average, form.training_frequency);
    const calorieTarget = calculateCalorieTarget(tdee, form.goal, bmr);
    const macros = calculateMacros(calorieTarget, form.goal, form.diet_type, form.weight_kg);
    const waterTarget = calculateWaterTarget(form.weight_kg, form.daily_steps_average, form.activity_level, form.hydration_habit);

    const payload = {
      full_name: form.full_name.trim() || user.email?.split('@')[0] || t('profile.fallbackName'),
      gender: form.gender,
      date_of_birth: form.date_of_birth,
      height_cm: form.height_cm,
      weight_kg: form.weight_kg,
      target_weight_kg: form.target_weight_kg,
      activity_level: form.activity_level,
      goal: form.goal,
      daily_calorie_target: calorieTarget,
      protein_target: macros.protein,
      carbs_target: macros.carbs,
      fat_target: macros.fat,
      daily_water_target_ml: waterTarget,
      daily_steps_target: form.daily_steps_average,
      diet_type: form.diet_type,
      food_allergies: form.food_allergies,
      daily_steps_average: form.daily_steps_average,
      sleep_hours_average: form.sleep_hours_average,
      training_experience: form.training_experience,
      training_frequency: form.training_frequency,
      training_focus: form.training_focus,
      injuries_limitations: form.injuries_limitations,
      hydration_habit: form.hydration_habit,
      onboarding_completed: true,
    };
    const saved = await updateProfile(user.id, stripSelfServeNutritionTargets(payload, coached));
    if (saved.error) {
      setSaving(false);
      toast(saved.error, 'error');
      return;
    }

    await addMeasurement({ user_id: user.id, weight_kg: form.weight_kg, measured_at: todayStr() });
    clearOnboardingDeferred();
    navigate('/dashboard');
  };

  const skipWithoutCompleting = () => {
    if (!myCoach) return;
    setOnboardingDeferred();
    navigate('/dashboard');
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <StepGoalMotivation form={form} setForm={setForm} />
            <StepPersonal form={form} setForm={setForm} banner={false} />
            <StepPhysical form={form} setForm={setForm} banner={false} />
          </>
        );
      case 1: return <StepTraining form={form} setForm={setForm} />;
      case 2: return <StepLifestyle form={form} setForm={setForm} />;
      case 3: return <StepNutrition form={form} setForm={setForm} />;
      default: return null;
    }
  };
  void StepSummary;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-32 max-w-lg mx-auto w-full">
        <div className="flex justify-end mb-3">
          <WallSignOut />
        </div>
        <ProgressBar step={step} />
        {renderStep()}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-lg border-t border-neutral-900 p-4">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 0 && (
            <Button
              variant="secondary"
              onClick={() => setStep(step - 1)}
              className="flex-shrink-0"
            >
              <ChevronLeft size={16} />
            </Button>
          )}

          {step < TOTAL_STEPS - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1"
            >
              {t('onboarding.continue')} <ChevronRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={finish}
              disabled={saving}
              className="flex-1"
            >
              {saving ? t('onboarding.settingUp') : t('onboarding.getStarted')} <Check size={16} />
            </Button>
          )}
        </div>
        {myCoach && (
        <button
          type="button"
          onClick={skipWithoutCompleting}
          className="max-w-lg mx-auto mt-2 block text-center text-xs text-neutral-500 hover:text-neutral-300"
        >
          {t('onboarding.skipWithCoach', { name: myCoach.full_name })}
        </button>
        )}
      </div>
    </div>
  );
}
