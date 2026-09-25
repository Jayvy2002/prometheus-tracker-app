import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '../ui/Card';
import type { DailyNutritionPoint } from '../../lib/types';
import { formatNumber, weightInUnit } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import { useChartColors } from '../../shared/theme/chartColors';

function tick(value: string) {
  return value.slice(5);
}

export function WeightChart({ points }: { points: Array<{ date: string; kg: number }> }) {
  const { t } = useTranslation();
  const chart = useChartColors();
  const unit = useProfileStore(s => s.profile?.unit_weight === 'lbs' ? 'lbs' : 'kg');
  if (points.length === 0) {
    return <Card className="text-sm text-neutral-500">{t('coaching.progress.noWeight')}</Card>;
  }
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">{t('coaching.progress.weightTitle')}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points.map(p => ({ date: p.date, value: weightInUnit(p.kg, unit) }))}>
            <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={['auto', 'auto']} width={32} tick={{ fill: chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: chart.tooltipBgRaised, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 12, fontSize: 12 }}
              formatter={(value) => [`${formatNumber(Number(value))} ${unit}`, t('coaching.progress.weightTitle')]}
            />
            <Area type="monotone" dataKey="value" stroke={chart.primaryLine} fill={chart.primaryArea} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function NutritionChart({ points }: { points: DailyNutritionPoint[] }) {
  const { t } = useTranslation();
  const chart = useChartColors();
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
            <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis width={36} tick={{ fill: chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
            {target > 0 && <ReferenceLine y={target} stroke={chart.goal} strokeDasharray="4 4" />}
            <Tooltip
              contentStyle={{ background: chart.tooltipBgRaised, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 12, fontSize: 12 }}
              formatter={(value) => [Math.round(Number(value)), t('common.calories')]}
            />
            <Bar dataKey="calories" fill={chart.primaryBar} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {target > 0 && (
        <p className="text-[11px] text-neutral-500 mt-1">{t('coaching.progress.calorieTarget', { n: Math.round(target) })}</p>
      )}
    </Card>
  );
}

export function LiftLineChart({ points }: { points: Array<{ date: string; topSet: number; volume?: number; e1rm?: number }> }) {
  const { t } = useTranslation();
  const chart = useChartColors();
  const unit = useProfileStore(s => s.profile?.unit_weight === 'lbs' ? 'lbs' : 'kg');
  if (points.length === 0) return null;
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points.map(p => ({ ...p, topSet: weightInUnit(p.topSet, unit) }))}>
          <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={['auto', 'auto']} width={36} tick={{ fill: chart.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: chart.tooltipBgRaised, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 12, fontSize: 12 }}
            formatter={(value) => [`${Number(value)} ${unit}`, t('coaching.progress.topSet')]}
          />
          <Line type="monotone" dataKey="topSet" name={t('coaching.progress.topSet')} stroke={chart.primaryLine} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
