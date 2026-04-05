import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, ChevronDown, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';

interface ExerciseEntry {
  date: string;
  maxWeight: number;
  totalVolume: number;
  estimated1RM: number;
  sets: number;
}

interface ExerciseSummary {
  name: string;
  entries: ExerciseEntry[];
}

type Metric = 'estimated1RM' | 'maxWeight' | 'totalVolume';

// METRIC_LABELS is now computed inside the component using t()

const METRICS: Metric[] = ['estimated1RM', 'maxWeight', 'totalVolume'];

function estimate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export default function ExerciseProgressPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const METRIC_LABELS: Record<Metric, string> = {
    estimated1RM: t('workout.progressPage.metrics.estOneRM'),
    maxWeight: t('workout.progressPage.metrics.maxWeight'),
    totalVolume: t('workout.progressPage.metrics.volume'),
  };
  const [exercises, setExercises] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [summary, setSummary] = useState<ExerciseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('workout_exercises')
      .select('name, workouts!inner(user_id)')
      .eq('workouts.user_id', user.id)
      .then(({ data }) => {
        if (!data) return;
        const names = [...new Set((data as { name: string }[]).map(e => e.name))].sort();
        setExercises(names);
        if (names.length > 0 && !selected) setSelected(names[0]);
      });
  }, [user]);

  useEffect(() => {
    if (!user || !selected) return;
    setLoading(true);

    supabase
      .from('workout_exercises')
      .select(`
        name,
        workout_sets(weight_kg, reps, set_type, completed),
        workouts!inner(user_id, date, completed)
      `)
      .eq('workouts.user_id', user.id)
      .eq('name', selected)
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }

        const byDate: Record<string, { maxWeight: number; totalVolume: number; best1RM: number; sets: number }> = {};

        for (const ex of data as unknown as {
          name: string;
          workout_sets: { weight_kg: number; reps: number; set_type: string; completed: boolean }[];
          workouts: { date: string; completed: boolean };
        }[]) {
          const dateKey = new Date(ex.workouts.date).toISOString().split('T')[0];
          if (!byDate[dateKey]) {
            byDate[dateKey] = { maxWeight: 0, totalVolume: 0, best1RM: 0, sets: 0 };
          }
          const workoutCompleted = ex.workouts.completed;
          for (const s of (ex.workout_sets ?? [])) {
            if (s.set_type === 'warmup') continue;
            if (!s.completed && !workoutCompleted) continue;
            const w = s.weight_kg || 0;
            const r = s.reps || 0;
            byDate[dateKey].maxWeight = Math.max(byDate[dateKey].maxWeight, w);
            byDate[dateKey].totalVolume += w * r;
            byDate[dateKey].best1RM = Math.max(byDate[dateKey].best1RM, estimate1RM(w, r));
            byDate[dateKey].sets++;
          }
        }

        const entries: ExerciseEntry[] = Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, d]) => ({
            date,
            maxWeight: Math.round(d.maxWeight * 10) / 10,
            totalVolume: Math.round(d.totalVolume),
            estimated1RM: d.best1RM,
            sets: d.sets,
          }))
          .filter(e => e.sets > 0);

        setSummary({ name: selected, entries });
        setLoading(false);
      });
  }, [user, selected]);

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center gap-3 mb-6 animate-fade-in-down">
        <button onClick={() => navigate('/workout')} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white flex-1">{t('workout.progressPage.title')}</h1>
      </div>

      <div className="mb-4 animate-fade-in-scale">
        <button
          onClick={() => setShowPicker(o => !o)}
          className="w-full flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm font-medium text-white hover:border-neutral-700 transition-colors"
        >
          {selected || t('workout.progressPage.selectExercise')}
          <ChevronDown size={16} className={`text-neutral-400 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
        </button>
        {showPicker && (
          <div className="mt-1 bg-neutral-900 border border-neutral-800 rounded-xl max-h-52 overflow-y-auto animate-fade-in-down z-10 relative">
            {exercises.map(ex => (
              <button
                key={ex}
                onClick={() => { setSelected(ex); setShowPicker(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-neutral-800/50 last:border-0
                  ${ex === selected ? 'text-blue-400 bg-blue-600/10' : 'text-neutral-300 hover:bg-neutral-800'}`}
              >
                {ex}
              </button>
            ))}
            {exercises.length === 0 && (
              <p className="px-4 py-3 text-sm text-neutral-500">{t('workout.progressPage.noExercisesYet')}</p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-neutral-500">{t('common.loading')}</div>
      ) : summary && summary.entries.length > 0 ? (
        <>
          <div className="space-y-3 mb-4">
            {METRICS.map((m, idx) => {
              const entries = summary.entries;
              const latest = entries[entries.length - 1];
              const previous = entries[entries.length - 2];
              const diff = latest && previous ? latest[m] - previous[m] : null;
              const allTimeBest = Math.max(...entries.map(e => e[m]));
              const isNewPR = latest && latest[m] === allTimeBest && entries.length > 1;
              const chartData = entries.slice(-20).map(e => ({
                date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: e[m],
              }));
              const unit = m === 'totalVolume' ? '' : ' kg';
              return (
                <Card key={m} className={`animate-fade-in-up stagger-${idx + 2}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-neutral-300">{METRIC_LABELS[m]}</h3>
                    <div className="flex items-center gap-2">
                      {latest && (
                        <span className="text-lg font-bold text-white">{latest[m]}{unit}</span>
                      )}
                      {isNewPR && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                          <Trophy size={10} />PR
                        </span>
                      )}
                      {diff !== null && diff !== 0 && (
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium flex items-center gap-1
                          ${diff > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          <TrendingUp size={11} className={diff < 0 ? 'rotate-180' : ''} />
                          {diff > 0 ? '+' : ''}{Math.round(diff * 10) / 10}
                        </span>
                      )}
                    </div>
                  </div>
                  {chartData.length > 1 ? (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
                          <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={38} />
                          <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 12 }} />
                          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600 mt-1">{t('workout.progressPage.logMoreSessions')}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    <Trophy size={11} className="text-amber-500 shrink-0" />
                    <span className="text-[11px] text-neutral-500">{t('workout.progressPage.allTimeBest')} — <span className="text-amber-400 font-medium">{allTimeBest}{unit}</span></span>
                  </div>
                </Card>
              );
            })}
          </div>

          <h3 className="text-sm font-medium text-neutral-400 mb-3 animate-fade-in-up stagger-5">{t('workout.progressPage.sessions')}</h3>
          <div className="space-y-2">
            {[...summary.entries].reverse().slice(0, 15).map((e, i) => (
              <div key={e.date} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      <p className="text-xs text-neutral-500">{e.sets} {t('workout.progressPage.workingSets')}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className="text-xs text-blue-400 font-medium">{e.estimated1RM} kg <span className="text-neutral-600 font-normal">1RM</span></p>
                      <p className="text-xs text-neutral-400">{e.maxWeight} kg <span className="text-neutral-600">max</span></p>
                      <p className="text-xs text-neutral-500">{e.totalVolume} <span className="text-neutral-600">vol</span></p>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </>
      ) : selected ? (
        <Card className="text-center py-12">
          <TrendingUp className="mx-auto mb-3 text-neutral-600" size={32} />
          <p className="text-neutral-400">{t('workout.progressPage.noSetsFound', { name: selected })}</p>
        </Card>
      ) : null}
    </div>
    </PageTransition>
  );
}
