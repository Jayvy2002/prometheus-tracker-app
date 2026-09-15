import { useTranslation } from 'react-i18next';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Scale } from 'lucide-react';
import CardLink from '../ui/CardLink';

export interface DashboardWeightPoint {
  date: string;
  weight: number;
}

interface Props {
  points: DashboardWeightPoint[];
  unit: 'kg' | 'lbs';
  latest: number | null;
  delta: number | null;
}

export default function DashboardWeightCard({ points, unit, latest, delta }: Props) {
  const { t } = useTranslation();
  const showChart = points.length >= 2;

  return (
    <CardLink to="/weight" className="mb-4">
      <div data-testid="dashboard-weight-chart">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <Scale size={15} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('dashboard.weightTrend')}</p>
            {latest !== null ? (
              <p className="text-[11px] text-neutral-500">
                {latest} {unit}
                {delta !== null && delta !== 0 && (
                  <span className={delta > 0 ? ' text-rose-400' : ' text-emerald-400'}>
                    {' '}{delta > 0 ? '+' : ''}{delta} {unit}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500">{t('dashboard.noWeightYet')}</p>
            )}
          </div>
        </div>
        <span className="text-xs text-neutral-500">{t('common.details')}</span>
      </div>
      {showChart ? (
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <XAxis
                dataKey="date"
                tick={{ fill: '#737373', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['dataMin - 1', 'dataMax + 1']}
                width={36}
                tick={{ fill: '#737373', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 12, fontSize: 12 }}
                formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, t('dashboard.weight')]}
              />
              <Area type="monotone" dataKey="weight" stroke="#34d399" fill="#34d39922" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-neutral-500">{t('dashboard.weightChartHint')}</p>
      )}
      </div>
    </CardLink>
  );
}
