import { useWeightStore } from '../../../stores/weightStore';
import { useProfileStore } from '../../../stores/profileStore';
import { formatDateShort, parseDateStr } from '../../../lib/utils';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function WeightWidget() {
  const { measurements } = useWeightStore();
  const { profile } = useProfileStore();
  const unit = profile?.unit_weight ?? 'kg';

  const data = [...measurements]
    .sort((a, b) => parseDateStr(a.measured_at).getTime() - parseDateStr(b.measured_at).getTime())
    .slice(-30)
    .map(m => ({
      date: formatDateShort(m.measured_at),
      weight: unit === 'lbs' ? +(m.weight_kg * 2.20462).toFixed(1) : +m.weight_kg.toFixed(1),
    }));

  if (data.length === 0) {
    return <p className="text-neutral-500 text-sm">No weight data yet</p>;
  }

  const latest = data[data.length - 1]?.weight;
  const first = data.length > 1 ? data[0]?.weight : null;
  const diff = latest != null && first != null ? +(latest - first).toFixed(1) : null;

  return (
    <div>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold text-white">{latest}</span>
        <span className="text-sm text-neutral-400 mb-0.5">{unit}</span>
        {diff !== null && diff !== 0 && (
          <span className={`text-sm font-medium mb-0.5 ${diff > 0 ? 'text-amber-400' : 'text-blue-400'}`}>
            {diff > 0 ? '+' : ''}{diff}
          </span>
        )}
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
            <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} width={35} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
