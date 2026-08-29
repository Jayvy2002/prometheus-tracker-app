import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '../ui/Card';
import type { DailyNutritionPoint } from '../../lib/types';

function tick(value: string) {
  return value.slice(5);
}

export function WeightChart({ points }: { points: Array<{ date: string; kg: number }> }) {
  const { t } = useTranslation();
  if (points.length === 0) {
    return <Card className="text-sm text-neutral-500">{t('coaching.progress.noWeight')}</Card>;
  }
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.progress.weightTitle')}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points}>
            <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={['auto', 'auto']} width={32} tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }}
              formatter={(value) => [`${Number(value).toFixed(1)} kg`, t('common.kg')]}
            />
            <Area type="monotone" dataKey="kg" stroke="#60a5fa" fill="#2563eb33" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function NutritionChart({ points }: { points: DailyNutritionPoint[] }) {
  const { t } = useTranslation();
  if (points.length === 0) {
    return <Card className="text-sm text-neutral-500">{t('coaching.progress.noNutrition')}</Card>;
  }
  const target = points[points.length - 1]?.target || 0;
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.progress.nutritionTitle')}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points}>
            <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis width={36} tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
            {target > 0 && <ReferenceLine y={target} stroke="#f59e0b" strokeDasharray="4 4" />}
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }}
              formatter={(value) => [Math.round(Number(value)), t('common.calories')]}
            />
            <Bar dataKey="calories" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {target > 0 && (
        <p className="text-[10px] text-neutral-500 mt-1">{t('coaching.progress.calorieTarget', { n: Math.round(target) })}</p>
      )}
    </Card>
  );
}

export function LiftLineChart({ points }: { points: Array<{ date: string; topSet: number; volume: number; e1rm: number }> }) {
  const { t } = useTranslation();
  if (points.length === 0) return null;
  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis width={32} tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="topSet" name={t('coaching.progress.topSet')} stroke="#60a5fa" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="e1rm" name={t('coaching.progress.e1rm')} stroke="#a78bfa" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
