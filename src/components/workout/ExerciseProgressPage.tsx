import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../ui/Card';
import PageTransition from '../ui/PageTransition';
import FullPageLayout from '../layout/FullPageLayout';

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

const METRIC_LABELS: Record<Metric, string> = {
  estimated1RM: 'Est. 1RM',
  maxWeight: 'Max Weight',
  totalVolume: 'Volume (kg)',
};

function estimate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export default function ExerciseProgressPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [exercises, setExercises] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [summary, setSummary] = useState<ExerciseSummary | null>(null);
  const [metric, setMetric] = useState<Metric>('estimated1RM');
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

  const chartData = (summary?.entries ?? []).slice(-20).map(e => ({
    date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: e[metric],
  }));

  const latest = summary?.entries[summary.entries.length - 1];
  const previous = summary?.entries[summary.entries.length - 2];
  const diff = latest && previous ? latest[metric] - previous[metric] : null;

  return (
    <FullPageLayout>
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center gap-3 mb-6 animate-fade-in-down">
        <button onClick={() => navigate('/workout')} className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white flex-1">Exercise Progress</h1>
      </div>

      <div className="mb-4 animate-fade-in-scale">
        <button
          onClick={() => setShowPicker(o => !o)}
          className="w-full flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm font-medium text-white hover:border-neutral-700 transition-colors"
        >
          {selected || 'Select exercise'}
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
              <p className="px-4 py-3 text-sm text-neutral-500">No exercises logged yet</p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-neutral-500">Loading...</div>
      ) : summary && summary.entries.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4 animate-fade-in-up stagger-2">
            {(Object.keys(METRIC_LABELS) as Metric[]).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`py-2 px-2 rounded-xl text-xs font-medium transition-all text-center
                  ${metric === m ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'}`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>

          {latest && (
            <Card className="mb-4 animate-fade-in-scale">
              <div className="flex items-start gap-4">
                <div>
                  <p className="text-3xl font-bold text-white">{latest[metric]}{metric === 'totalVolume' ? '' : ' kg'}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{METRIC_LABELS[metric]} — latest session</p>
                </div>
                {diff !== null && diff !== 0 && (
                  <div className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1
                    ${diff > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <TrendingUp size={12} className={diff < 0 ? 'rotate-180' : ''} />
                    {diff > 0 ? '+' : ''}{Math.round(diff * 10) / 10}
                  </div>
                )}
              </div>
            </Card>
          )}

          {chartData.length > 1 && (
            <Card className="mb-4 animate-fade-in-up stagger-3">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">{METRIC_LABELS[metric]} over time</h3>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
                    <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={38} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <h3 className="text-sm font-medium text-neutral-400 mb-3 animate-fade-in-up stagger-4">Sessions</h3>
          <div className="space-y-2">
            {[...summary.entries].reverse().slice(0, 15).map((e, i) => (
              <div key={e.date} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      <p className="text-xs text-neutral-500">{e.sets} working sets</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-400">{e.estimated1RM} kg</p>
                      <p className="text-[10px] text-neutral-500">est. 1RM</p>
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
          <p className="text-neutral-400">No completed working sets found for {selected}</p>
        </Card>
      ) : null}
    </div>
    </PageTransition>
    </FullPageLayout>
  );
}
