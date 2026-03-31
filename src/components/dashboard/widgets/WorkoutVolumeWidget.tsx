import { useWorkoutStore } from '../../../stores/workoutStore';
import { parseDate } from '../../../lib/utils';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function WorkoutVolumeWidget() {
  const { workouts } = useWorkoutStore();

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const data = last7.map(date => {
    const dayWorkouts = workouts.filter(w => w.date?.startsWith(date));
    return {
      day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      count: dayWorkouts.length,
    };
  });

  const total = workouts.filter(w => {
    const d = parseDate(w.date);
    const week = new Date();
    week.setDate(week.getDate() - 7);
    return d >= week;
  }).length;

  return (
    <div>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold text-white">{total}</span>
        <span className="text-sm text-neutral-400 mb-0.5">workouts this week</span>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={20} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 12 }}
            />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
