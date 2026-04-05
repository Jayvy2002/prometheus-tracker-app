import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { useRoutineStore } from '../../../stores/routineStore';
import { supabase } from '../../../lib/supabase';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface TonnageEntry {
  date: string;
  tonnage: number;
}

export default function RoutineTonnageWidget() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { routines, fetchRoutines } = useRoutineStore();
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>('');
  const [tonnageData, setTonnageData] = useState<TonnageEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchRoutines(user.id);
  }, [user]);

  useEffect(() => {
    if (routines.length > 0 && !selectedRoutineId) {
      setSelectedRoutineId(routines[0].id);
    }
  }, [routines]);

  useEffect(() => {
    if (!user || !selectedRoutineId) return;
    const routine = routines.find(r => r.id === selectedRoutineId);
    if (!routine) return;
    setLoading(true);

    supabase
      .from('workouts')
      .select(`
        id, date, name, routine_id,
        workout_exercises(
          workout_sets(weight_kg, reps, set_type)
        )
      `)
      .eq('user_id', user.id)
      .eq('routine_id', selectedRoutineId)
      .order('date', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }

        const entries: TonnageEntry[] = (data as unknown as {
          id: string;
          date: string;
          workout_exercises: { workout_sets: { weight_kg: number; reps: number; set_type: string }[] }[];
        }[])
          .map(w => {
            let tonnage = 0;
            for (const ex of (w.workout_exercises ?? [])) {
              for (const s of (ex.workout_sets ?? [])) {
                if (s.set_type !== 'warmup') {
                  tonnage += (s.weight_kg || 0) * (s.reps || 0);
                }
              }
            }
            return { date: w.date.split('T')[0], tonnage: Math.round(tonnage) };
          })
          .filter(e => e.tonnage > 0)
          .reverse();

        setTonnageData(entries.slice(-10));
        setLoading(false);
      });
  }, [user, selectedRoutineId, routines]);

  const chartData = tonnageData.map(e => ({
    date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tonnage: e.tonnage,
  }));

  const latest = tonnageData[tonnageData.length - 1];
  const previous = tonnageData[tonnageData.length - 2];
  const trend = latest && previous ? latest.tonnage - previous.tonnage : null;

  if (routines.length === 0) {
    return <p className="text-xs text-neutral-500 text-center py-2">{t('widgets.routineTonnage.noRoutines')}</p>;
  }

  return (
    <div>
      <select
        value={selectedRoutineId}
        onChange={e => setSelectedRoutineId(e.target.value)}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        className="relative z-10 w-full mb-3 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
      >
        {routines.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      {loading ? (
        <div className="h-20 flex items-center justify-center text-neutral-500 text-xs">{t('widgets.routineTonnage.loading')}</div>
      ) : chartData.length > 1 ? (
        <>
          {latest && (
            <div className="flex items-end gap-2 mb-2">
              <span className="text-xl font-bold text-white">{latest.tonnage.toLocaleString()}</span>
              <span className="text-xs text-neutral-400 mb-0.5">{t('widgets.routineTonnage.kgTonnage')}</span>
              {trend !== null && trend !== 0 && (
                <span className={`text-xs ml-auto ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {trend > 0 ? '+' : ''}{trend.toLocaleString()} kg
                </span>
              )}
            </div>
          )}
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#737373' }} axisLine={false} tickLine={false} />
                <YAxis hide domain={['dataMin - 500', 'dataMax + 500']} />
                <Tooltip
                  contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '10px', fontSize: 11 }}
                />
                <Line type="monotone" dataKey="tonnage" stroke="#2563eb" strokeWidth={2} dot={{ r: 2, fill: '#2563eb' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500 text-center py-3">{t('widgets.routineTonnage.notEnoughData')}</p>
      )}
    </div>
  );
}
