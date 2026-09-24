import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Target, Dumbbell, LayoutList, Ruler, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { useAuthStore } from '../../stores/authStore';
import WallSignOut from '../auth/WallSignOut';
import { useCoachingStore, clearOnboardingDeferred, setOnboardingDeferred } from '../../stores/coachingStore';
import { GOALS, TRAINING_EXPERIENCES } from '../../lib/constants';
import { todayStr } from '../../lib/utils';
import { isCoachedAthlete } from '../../lib/coachRole';
import { stripSelfServeNutritionTargets } from '../../lib/coachOwnedTargets';
import { optionDescription, optionLabel, type OptionGroup } from '../../lib/optionLabels';
import {
  EQUIPMENT_OPTIONS,
  SOLO_ONBOARDING_STEPS,
  buildSoloOnboardingPayload,
  canContinueSoloOnboarding,
  emptySoloOnboardingForm,
  measureErrors,
  type SoloOnboardingForm,
} from '../../features/account/domain/soloOnboarding';
import PersonalModulesPicker from '../profile/PersonalModulesPicker';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

type SetForm = (next: SoloOnboardingForm) => void;

const inputClass = 'w-full bg-neutral-900/80 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500';
const labelClass = 'text-xs text-neutral-400 font-medium uppercase tracking-wider mb-2 block';

function ProgressBar({ step }: { step: number }) {
  const { t } = useTranslation();
  return (
    <div className="mb-8">
      <p className="sr-only">{t('onboarding.stepOf', { step: step + 1, total: SOLO_ONBOARDING_STEPS })}</p>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: SOLO_ONBOARDING_STEPS }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              i < step ? 'bg-blue-500' : i === step ? 'bg-blue-400' : 'bg-neutral-800'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function StepHeader({ icon: Icon, title, subtitle }: { icon: typeof Target; title: string; subtitle: string }) {
  return (
    <div className="text-center mb-8 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
        <Icon size={28} className="text-blue-400" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
      <p className="text-sm text-neutral-400">{subtitle}</p>
    </div>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`p-3 rounded-xl border text-left transition-all min-h-11 ${
        selected
          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
          : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
      }`}
    >
      {children}
    </button>
  );
}

function OptionGrid({ options, value, onChange, group, columns = 2 }: {
  options: readonly { value: string; label: string; description?: string }[];
  value: string;
  onChange: (next: string) => void;
  group: OptionGroup;
  columns?: 2 | 3;
}) {
  const { t } = useTranslation();
  return (
    <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {options.map(opt => (
        <Choice key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
          <span className={`text-sm font-medium ${value === opt.value ? 'text-blue-300' : 'text-white'}`}>
            {optionLabel(t, group, opt.value, opt.label)}
          </span>
          {opt.description && (
            <span className="block text-xs text-neutral-500 mt-0.5">{optionDescription(t, group, opt.value, opt.description)}</span>
          )}
        </Choice>
      ))}
    </div>
  );
}

// 1. Goal — what matters now.
function StepGoal({ form, setForm }: { form: SoloOnboardingForm; setForm: SetForm }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Target} title={t('onboarding.steps.goalTitle')} subtitle={t('onboarding.steps.goalSub')} />
      <div>
        <label htmlFor="onboarding-name" className={labelClass}>{t('onboarding.fields.firstName')}</label>
        <input
          id="onboarding-name"
          type="text"
          autoComplete="given-name"
          value={form.full_name}
          onChange={e => setForm({ ...form, full_name: e.target.value })}
          className={inputClass}
        />
      </div>
      <div>
        <p className={labelClass}>{t('onboarding.fields.bodyGoal')}</p>
        <OptionGrid group="goals" options={GOALS} value={form.goal} onChange={v => setForm({ ...form, goal: v as SoloOnboardingForm['goal'] })} columns={3} />
      </div>
    </div>
  );
}

// 2. Training — experience, rhythm, equipment, constraints.
function StepTraining({ form, setForm }: { form: SoloOnboardingForm; setForm: SetForm }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Dumbbell} title={t('onboarding.steps.training')} subtitle={t('onboarding.steps.trainingSubMinimal')} />
      <div>
        <p className={labelClass}>{t('onboarding.fields.experience')}</p>
        <OptionGrid group="trainingExperience" options={TRAINING_EXPERIENCES} value={form.training_experience} onChange={v => setForm({ ...form, training_experience: v })} />
      </div>
      <div>
        <p className={labelClass}>{t('onboarding.fields.sessionsPerWeek')}</p>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t('onboarding.fields.sessionsPerWeek')}>
          {[1, 2, 3, 4, 5, 6, 7].map(n => (
            <button
              key={n}
              type="button"
              aria-pressed={form.training_frequency === n}
              onClick={() => setForm({ ...form, training_frequency: n })}
              className={`min-h-11 rounded-xl text-sm font-semibold ${
                form.training_frequency === n ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300 border border-neutral-800'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className={labelClass}>{t('onboarding.fields.equipment')}</p>
        <div className="grid grid-cols-2 gap-2">
          {EQUIPMENT_OPTIONS.map(value => (
            <Choice key={value} selected={form.training_equipment === value} onClick={() => setForm({ ...form, training_equipment: value })}>
              <span className={`text-sm font-medium ${form.training_equipment === value ? 'text-blue-300' : 'text-white'}`}>{t(`onboarding.equipment.${value}`)}</span>
              <span className="block text-xs text-neutral-500 mt-0.5">{t(`onboarding.equipment.${value}Hint`)}</span>
            </Choice>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="onboarding-constraints" className={labelClass}>{t('onboarding.fields.constraints')}</label>
        <textarea
          id="onboarding-constraints"
          value={form.injuries_limitations}
          onChange={e => setForm({ ...form, injuries_limitations: e.target.value })}
          rows={2}
          className={`${inputClass} text-sm resize-none placeholder-neutral-600`}
          placeholder={t('onboarding.fields.injuriesPlaceholder')}
        />
      </div>
    </div>
  );
}

// 3. Modules — the Solo chooses what they follow.
function StepModules({ form, setForm }: { form: SoloOnboardingForm; setForm: SetForm }) {
  const { t } = useTranslation();
  const none = !canContinueSoloOnboarding(2, form);
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={LayoutList} title={t('modules.onboardingTitle')} subtitle={t('modules.onboardingHint')} />
      <PersonalModulesPicker value={form.modules} onChange={modules => setForm({ ...form, modules })} />
      {none && <p role="alert" className="text-sm text-amber-300">{t('modules.noneSelected')}</p>}
    </div>
  );
}

// 4. Measurements — optional, never prefilled.
function StepMeasures({ form, setForm }: { form: SoloOnboardingForm; setForm: SetForm }) {
  const { t } = useTranslation();
  const errors = measureErrors(form);
  const unit = form.unit_weight;
  const numberField = (id: string, label: string, key: 'height_cm' | 'weight' | 'target_weight', error: boolean, suffix: string) => (
    <div>
      <label htmlFor={id} className={labelClass}>{label} ({suffix})</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-amber-300">{t(`onboarding.errors.${key === 'height_cm' ? 'height' : key === 'weight' ? 'weight' : 'targetWeight'}`)}</p>}
    </div>
  );
  return (
    <div className="space-y-5 animate-fade-in-up">
      <StepHeader icon={Ruler} title={t('onboarding.steps.measuresTitle')} subtitle={t('onboarding.steps.measuresSub')} />
      <div className="flex gap-2" role="group" aria-label={t('onboarding.fields.weightUnit')}>
        {(['kg', 'lbs'] as const).map(u => (
          <button
            key={u}
            type="button"
            aria-pressed={unit === u}
            onClick={() => setForm({ ...form, unit_weight: u })}
            className={`min-h-11 flex-1 rounded-xl text-sm font-medium ${unit === u ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300 border border-neutral-800'}`}
          >
            {u === 'kg' ? 'kg' : 'lb'}
          </button>
        ))}
      </div>
      <div>
        <p className={labelClass}>{t('onboarding.fields.sex')}</p>
        <div className="grid grid-cols-2 gap-2">
          {(['female', 'male', 'other', ''] as const).map(g => (
            <Choice key={g || 'unsaid'} selected={form.gender === g} onClick={() => setForm({ ...form, gender: g })}>
              <span className="text-sm font-medium text-white">{t(`onboarding.gender.${g || 'unsaid'}`)}</span>
            </Choice>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="onboarding-dob" className={labelClass}>{t('onboarding.fields.dateOfBirth')}</label>
        <input
          id="onboarding-dob"
          type="date"
          max={todayStr()}
          value={form.date_of_birth}
          onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
          aria-invalid={errors.includes('dateOfBirth') || undefined}
          className={inputClass}
        />
        {errors.includes('dateOfBirth') && <p className="mt-1 text-xs text-amber-300">{t('onboarding.errors.dobInvalid')}</p>}
      </div>
      {numberField('onboarding-height', t('onboarding.fields.height'), 'height_cm', errors.includes('height'), 'cm')}
      {numberField('onboarding-weight', t('onboarding.fields.currentWeight'), 'weight', errors.includes('weight'), unit === 'kg' ? 'kg' : 'lb')}
      {numberField('onboarding-target', t('onboarding.fields.targetWeight'), 'target_weight', errors.includes('targetWeight'), unit === 'kg' ? 'kg' : 'lb')}
    </div>
  );
}

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
  const [form, setForm] = useState<SoloOnboardingForm>(emptySoloOnboardingForm);

  const canProceed = canContinueSoloOnboarding(step, form);
  const last = step === SOLO_ONBOARDING_STEPS - 1;

  const finish = async () => {
    if (!user || saving || !canProceed) return;
    setSaving(true);
    const { profile, weighInKg } = buildSoloOnboardingPayload(form, {
      coached,
      fallbackName: user.email?.split('@')[0] || t('profile.fallbackName'),
    });
    const saved = await updateProfile(user.id, stripSelfServeNutritionTargets(profile, coached));
    if (saved.error) {
      setSaving(false);
      toast(saved.error, 'error');
      return;
    }
    if (weighInKg != null) {
      await addMeasurement({ user_id: user.id, weight_kg: weighInKg, measured_at: todayStr() });
    }
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
      case 0: return <StepGoal form={form} setForm={setForm} />;
      case 1: return <StepTraining form={form} setForm={setForm} />;
      case 2: return <StepModules form={form} setForm={setForm} />;
      case 3: return <StepMeasures form={form} setForm={setForm} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-32 max-w-lg mx-auto w-full">
        <div className="flex justify-end mb-3">
          <WallSignOut />
        </div>
        <ProgressBar step={step} />
        {renderStep()}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-lg border-t border-neutral-900 p-4">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)} className="flex-shrink-0" aria-label={t('onboarding.back')}>
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
          )}
          {!last ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed} className="flex-1">
              {t('onboarding.continue')} <ChevronRight size={16} aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving || !canProceed} className="flex-1">
              {saving ? t('onboarding.settingUp') : t('onboarding.getStarted')} <Check size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
        {myCoach && (
          <button
            type="button"
            onClick={skipWithoutCompleting}
            className="max-w-lg mx-auto mt-2 block min-h-11 text-center text-xs text-neutral-500 hover:text-neutral-300"
          >
            {t('onboarding.skipWithCoach', { name: myCoach.full_name })}
          </button>
        )}
      </div>
    </div>
  );
}
