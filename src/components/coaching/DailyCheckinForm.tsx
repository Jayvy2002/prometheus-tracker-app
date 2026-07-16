import { useState, useEffect } from 'react';
import { 
  Moon, Zap, Brain, Smile, Dumbbell, Utensils, 
  Heart, AlertTriangle, ChevronRight, Check, Loader2 
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCheckinStore } from '../../stores/checkinStore';

interface MetricConfig {
  key: string;
  icon: typeof Moon;
  label: string;
  description: string;
  labels: string[];
  color: string;
}

export default function DailyCheckinForm({ onComplete }: { onComplete?: () => void }) {
  const { user } = useAuthStore();
  const { todayCheckin, upsertCheckin, saving, fetchTodayCheckin } = useCheckinStore();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, number>>({});
  const [adherenceNutrition, setAdherenceNutrition] = useState(80);
  const [adherenceTraining, setAdherenceTraining] = useState(80);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [notes, setNotes] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (user) fetchTodayCheckin(user.id);
  }, [user]);

  useEffect(() => {
    if (todayCheckin) {
      setValues({
        sleep_quality: todayCheckin.sleep_quality || 3,
        fatigue: todayCheckin.fatigue || 2,
        stress: todayCheckin.stress || 2,
        motivation: todayCheckin.motivation || 3,
        hunger: todayCheckin.hunger || 3,
        muscle_soreness: todayCheckin.muscle_soreness || 2,
        joint_pain: todayCheckin.joint_pain || 1,
        energy_level: todayCheckin.energy_level || 3,
        mood: todayCheckin.mood || 3,
      });
      setAdherenceNutrition(todayCheckin.adherence_nutrition || 80);
      setAdherenceTraining(todayCheckin.adherence_training || 80);
      setSleepHours(todayCheckin.sleep_hours || 7.5);
      setNotes(todayCheckin.notes || '');
    }
  }, [todayCheckin]);

  const metrics: MetricConfig[] = [
    { key: 'sleep_quality', icon: Moon, label: 'Qualite du sommeil', description: 'Comment as-tu dormi ?', labels: ['Tres mal', 'Mal', 'Moyen', 'Bien', 'Excellent'], color: 'indigo' },
    { key: 'energy_level', icon: Zap, label: 'Niveau d\'energie', description: 'Comment te sens-tu en ce moment ?', labels: ['Epuise', 'Faible', 'Normal', 'Energique', 'Surcharge'], color: 'yellow' },
    { key: 'stress', icon: Brain, label: 'Stress', description: 'Quel est ton niveau de stress ?', labels: ['Aucun', 'Leger', 'Modere', 'Eleve', 'Extreme'], color: 'red' },
    { key: 'motivation', icon: Smile, label: 'Motivation', description: 'Envie de t\'entrainer aujourd\'hui ?', labels: ['Aucune', 'Faible', 'Moderee', 'Bonne', 'A bloc'], color: 'green' },
    { key: 'hunger', icon: Utensils, label: 'Faim', description: 'As-tu faim ? (en general dans la journee)', labels: ['Aucune', 'Faible', 'Normale', 'Elevee', 'Extreme'], color: 'orange' },
    { key: 'fatigue', icon: Moon, label: 'Fatigue musculaire', description: 'Fatigue accumulee ?', labels: ['Aucune', 'Legere', 'Moderee', 'Elevee', 'Extreme'], color: 'purple' },
    { key: 'muscle_soreness', icon: Dumbbell, label: 'Courbatures', description: 'Niveau de courbatures (DOMS) ?', labels: ['Aucune', 'Legere', 'Moderee', 'Forte', 'Extreme'], color: 'blue' },
    { key: 'joint_pain', icon: AlertTriangle, label: 'Douleurs articulaires', description: 'Douleurs aux articulations ou tendons ?', labels: ['Aucune', 'Legere', 'Moderee', 'Forte', 'Severe'], color: 'red' },
    { key: 'mood', icon: Heart, label: 'Humeur', description: 'Ton humeur generale ?', labels: ['Tres basse', 'Basse', 'Neutre', 'Bonne', 'Excellente'], color: 'pink' },
  ];

  const totalSteps = metrics.length + 2; // metrics + adherence + sleep/notes

  const handleMetricSelect = (key: string, value: number) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setTimeout(() => {
      if (step < totalSteps - 1) setStep(step + 1);
    }, 300);
  };

  const handleSubmit = async () => {
    if (!user) return;
    await upsertCheckin(user.id, {
      ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v])),
      adherence_nutrition: adherenceNutrition,
      adherence_training: adherenceTraining,
      sleep_hours: sleepHours,
      notes,
    });
    setCompleted(true);
    onComplete?.();
  };

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Check-in enregistre !</h3>
        <p className="text-neutral-400 text-center text-sm max-w-xs">
          Tes donnees sont prises en compte pour tes recommandations coaching.
        </p>
      </div>
    );
  }

  // Metric steps
  if (step < metrics.length) {
    const metric = metrics[step];
    const Icon = metric.icon;
    const currentValue = values[metric.key] || 0;

    return (
      <div className="animate-fade-in">
        {/* Progress bar */}
        <div className="flex gap-1 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-blue-500' : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center">
            <Icon size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{metric.label}</h3>
            <p className="text-sm text-neutral-400">{metric.description}</p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {metric.labels.map((label, i) => {
            const value = i + 1;
            const isSelected = currentValue === value;
            return (
              <button
                key={value}
                onClick={() => handleMetricSelect(metric.key, value)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 border ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500/50 text-white'
                    : 'bg-neutral-900/50 border-neutral-800 text-neutral-300 hover:bg-neutral-800/80 hover:border-neutral-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                  isSelected ? 'bg-blue-500 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}>
                  {value}
                </div>
                <span className="font-medium">{label}</span>
                {isSelected && <Check size={16} className="ml-auto text-blue-400" />}
              </button>
            );
          })}
        </div>

        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="mt-4 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Retour
          </button>
        )}
      </div>
    );
  }

  // Adherence step
  if (step === metrics.length) {
    return (
      <div className="animate-fade-in">
        <div className="flex gap-1 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-blue-500' : 'bg-neutral-800'}`} />
          ))}
        </div>

        <h3 className="text-lg font-bold text-white mb-1">Adherence au plan</h3>
        <p className="text-sm text-neutral-400 mb-6">A quel point as-tu suivi ton plan hier ?</p>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-neutral-300 flex items-center gap-2">
                <Utensils size={14} /> Nutrition
              </span>
              <span className="text-sm font-bold text-white">{adherenceNutrition}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={adherenceNutrition}
              onChange={e => setAdherenceNutrition(Number(e.target.value))}
              className="w-full h-2 bg-neutral-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-neutral-300 flex items-center gap-2">
                <Dumbbell size={14} /> Entrainement
              </span>
              <span className="text-sm font-bold text-white">{adherenceTraining}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={adherenceTraining}
              onChange={e => setAdherenceTraining(Number(e.target.value))}
              className="w-full h-2 bg-neutral-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={() => setStep(step - 1)} className="px-4 py-2.5 text-sm text-neutral-400 hover:text-white transition-colors">
            Retour
          </button>
          <button
            onClick={() => setStep(step + 1)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            Suivant <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Sleep hours + notes step (final)
  return (
    <div className="animate-fade-in">
      <div className="flex gap-1 mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-blue-500' : 'bg-neutral-800'}`} />
        ))}
      </div>

      <h3 className="text-lg font-bold text-white mb-1">Sommeil & notes</h3>
      <p className="text-sm text-neutral-400 mb-6">Derniers details pour completer ton check-in.</p>

      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-300 flex items-center gap-2">
              <Moon size={14} /> Heures de sommeil
            </span>
            <span className="text-sm font-bold text-white">{sleepHours}h</span>
          </div>
          <input
            type="range"
            min={3}
            max={12}
            step={0.5}
            value={sleepHours}
            onChange={e => setSleepHours(Number(e.target.value))}
            className="w-full h-2 bg-neutral-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
            <span>3h</span><span>7h</span><span>12h</span>
          </div>
        </div>

        <div>
          <label className="text-sm text-neutral-300 mb-2 block">Notes (optionnel)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Quelque chose de particulier aujourd'hui ? (blessure, stress au travail, mauvaise nuit, etc.)"
            className="w-full h-24 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl text-white text-sm placeholder-neutral-600 resize-none focus:border-blue-500/50 focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button onClick={() => setStep(step - 1)} className="px-4 py-2.5 text-sm text-neutral-400 hover:text-white transition-colors">
          Retour
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
