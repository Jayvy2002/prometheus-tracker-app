import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { toast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWeightStore } from '../../stores/weightStore';
import { ACTIVITY_LEVELS, GOALS, DEFAULT_DASHBOARD_WIDGETS } from '../../lib/constants';
import { calculateBMR, calculateTDEE, calculateCalorieTarget, calculateMacros, getAge, todayStr } from '../../lib/utils';

interface FormData {
  full_name: string;
  gender: string;
  date_of_birth: string;
  height_cm: number;
  weight_kg: number;
  activity_level: string;
  goal: string;
}

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { updateProfile } = useProfileStore();
  const { addMeasurement } = useWeightStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>({
    full_name: '',
    gender: 'male',
    date_of_birth: '',
    height_cm: 175,
    weight_kg: 75,
    activity_level: 'moderate',
    goal: 'maintain',
  });

  const update = (field: keyof FormData, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    const age = form.date_of_birth ? getAge(form.date_of_birth) : 25;
    const bmr = calculateBMR(form.weight_kg, form.height_cm, age, form.gender);
    const tdee = calculateTDEE(bmr, form.activity_level);
    const calories = calculateCalorieTarget(tdee, form.goal);
    const macros = calculateMacros(calories, form.goal);

    await updateProfile(user.id, {
      ...form,
      daily_calorie_target: calories,
      protein_target: macros.protein,
      carbs_target: macros.carbs,
      fat_target: macros.fat,
      onboarding_completed: true,
      dashboard_layout: DEFAULT_DASHBOARD_WIDGETS,
    });

    await addMeasurement({
      user_id: user.id,
      weight_kg: form.weight_kg,
      measured_at: todayStr(),
    });

    setSaving(false);
    navigate('/dashboard');
  };

  const steps = [
    <StepPersonal key="p" form={form} update={update} />,
    <StepPhysical key="ph" form={form} update={update} />,
    <StepActivity key="a" form={form} update={update} />,
    <StepGoal key="g" form={form} update={update} />,
    <StepSummary key="s" form={form} />,
  ];

  const titles = ['About You', 'Your Body', 'Activity Level', 'Your Goal', 'Summary'];

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-start">
      <div className="w-full max-w-lg px-6 py-8 flex flex-col flex-1">
      <div className="flex items-center gap-3 mb-2">
        <img src="/logo.svg" alt="Prometheus" className="w-7 h-7" />
        <span className="text-white font-semibold">Prometheus</span>
      </div>

      <div className="flex gap-1.5 my-6">
        {titles.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-500 animate-scale-in`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className={`h-full rounded-full transition-all duration-500 ${i <= step ? 'bg-blue-500' : 'bg-neutral-900'}`} />
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-white mb-1">{titles[step]}</h2>
      <p className="text-neutral-400 text-sm mb-6">Step {step + 1} of {titles.length}</p>

      <div className="flex-1 animate-fade-in-up" key={step}>{steps[step]}</div>

      <div className="flex gap-3 mt-8 animate-fade-in-up">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(s => s - 1)} className="flex-1">
            <ArrowLeft size={18} /> Back
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button onClick={() => {
            if (step === 0) {
              if (!form.full_name.trim()) { toast('Ton prénom est requis.', 'error'); return; }
              if (!form.date_of_birth) { toast('Ta date de naissance est requise.', 'error'); return; }
              const age = getAge(form.date_of_birth);
              if (age < 10 || age > 100) { toast('Date de naissance invalide.', 'error'); return; }
            }
            setStep(s => s + 1);
          }} className="flex-1">
            Continue <ArrowRight size={18} />
          </Button>
        ) : (
          <Button onClick={finish} loading={saving} className="flex-1">
            <Check size={18} /> Get Started
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}

function StepPersonal({ form, update }: { form: FormData; update: (k: keyof FormData, v: string | number) => void }) {
  return (
    <div className="space-y-5">
      <Input label="Full Name" value={form.full_name} onChange={e => update('full_name', e.target.value)} placeholder="John Doe" />
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-neutral-300">Gender</label>
        <div className="grid grid-cols-3 gap-2">
          {['male', 'female', 'other'].map(g => (
            <button
              key={g}
              onClick={() => update('gender', g)}
              className={`py-3 rounded-xl font-medium text-sm capitalize transition-all
                ${form.gender === g
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:border-neutral-700'}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} />
    </div>
  );
}

function StepPhysical({ form, update }: { form: FormData; update: (k: keyof FormData, v: string | number) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Height (cm)</label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={120}
            max={230}
            value={form.height_cm}
            onChange={e => update('height_cm', +e.target.value)}
            className="flex-1 accent-blue-500"
          />
          <span className="text-xl font-bold text-white w-20 text-right">{form.height_cm} cm</span>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Weight (kg)</label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={30}
            max={200}
            step={0.5}
            value={form.weight_kg}
            onChange={e => update('weight_kg', +e.target.value)}
            className="flex-1 accent-blue-500"
          />
          <span className="text-xl font-bold text-white w-20 text-right">{form.weight_kg} kg</span>
        </div>
      </div>
    </div>
  );
}

function StepActivity({ form, update }: { form: FormData; update: (k: keyof FormData, v: string | number) => void }) {
  return (
    <div className="space-y-3">
      {ACTIVITY_LEVELS.map(level => (
        <button
          key={level.value}
          onClick={() => update('activity_level', level.value)}
          className={`w-full text-left p-4 rounded-xl transition-all border
            ${form.activity_level === level.value
              ? 'bg-blue-600/20 border-blue-500 text-white'
              : 'bg-neutral-900/50 border-neutral-800 text-neutral-300 hover:border-neutral-700'}`}
        >
          <div className="font-medium">{level.label}</div>
          <div className="text-sm text-neutral-400 mt-0.5">{level.description}</div>
        </button>
      ))}
    </div>
  );
}

function StepGoal({ form, update }: { form: FormData; update: (k: keyof FormData, v: string | number) => void }) {
  return (
    <div className="space-y-3">
      {GOALS.map(goal => (
        <button
          key={goal.value}
          onClick={() => update('goal', goal.value)}
          className={`w-full text-left p-5 rounded-xl transition-all border
            ${form.goal === goal.value
              ? 'bg-blue-600/20 border-blue-500 text-white'
              : 'bg-neutral-900/50 border-neutral-800 text-neutral-300 hover:border-neutral-700'}`}
        >
          <div className="font-semibold text-lg">{goal.label}</div>
          <div className="text-sm text-neutral-400 mt-1">{goal.description}</div>
        </button>
      ))}
    </div>
  );
}

function StepSummary({ form }: { form: FormData }) {
  const age = getAge(form.date_of_birth);
  const bmr = calculateBMR(form.weight_kg, form.height_cm, age, form.gender);
  const tdee = calculateTDEE(bmr, form.activity_level);
  const calories = calculateCalorieTarget(tdee, form.goal);
  const macros = calculateMacros(calories, form.goal);

  return (
    <div className="space-y-4">
      <div className="bg-neutral-900/50 rounded-2xl p-5 border border-neutral-800/50">
        <h3 className="text-sm font-medium text-neutral-400 mb-3">Your Stats</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-neutral-500">Age:</span> <span className="text-white font-medium">{age} years</span></div>
          <div><span className="text-neutral-500">Height:</span> <span className="text-white font-medium">{form.height_cm} cm</span></div>
          <div><span className="text-neutral-500">Weight:</span> <span className="text-white font-medium">{form.weight_kg} kg</span></div>
          <div><span className="text-neutral-500">BMR:</span> <span className="text-white font-medium">{bmr} cal</span></div>
        </div>
      </div>

      <div className="bg-blue-600/10 rounded-2xl p-5 border border-blue-500/30">
        <h3 className="text-sm font-medium text-blue-400 mb-3">Your Daily Targets</h3>
        <div className="text-center mb-4">
          <span className="text-4xl font-bold text-white">{calories}</span>
          <span className="text-neutral-400 ml-1">cal/day</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-neutral-900/50 rounded-xl p-3">
            <div className="text-lg font-bold text-sky-400">{macros.protein}g</div>
            <div className="text-xs text-neutral-500">Protein</div>
          </div>
          <div className="bg-neutral-900/50 rounded-xl p-3">
            <div className="text-lg font-bold text-amber-400">{macros.carbs}g</div>
            <div className="text-xs text-neutral-500">Carbs</div>
          </div>
          <div className="bg-neutral-900/50 rounded-xl p-3">
            <div className="text-lg font-bold text-rose-400">{macros.fat}g</div>
            <div className="text-xs text-neutral-500">Fat</div>
          </div>
        </div>
      </div>
    </div>
  );
}
