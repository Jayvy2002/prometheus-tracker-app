import { useTranslation } from 'react-i18next';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Scale } from 'lucide-react';
import CardLink from '../ui/CardLink';
import { useChartColors } from '../../shared/theme/chartColors';
import { formatNumber, formatSignedNumber } from '../../lib/utils';

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

/**
 * Half-width tile on Today: the week's weight and its change, with a small
 * trend line. The full chart lives on /weight.
 */
export default function DashboardWeightCard({ points, unit, latest, delta }: Props) {
  const { t } = useTranslation();
  const chart = useChartColors();
  const showChart = points.length >= 2;

  return (
    <CardLink to="/weight" className="h-full">
      <div data-testid="dashboard-weight-chart" className="flex h-full flex-col">
        <div className="flex items-center gap-2 mb-2">
          <Scale size={14} className="text-emerald-400" aria-hidden="true" />
          <p className="text-xs text-neutral-400">{t('dashboard.weight')} · {t('dashboard.weightAvg7')}</p>
        </div>
        {latest !== null ? (
          <p className="text-lg font-semibold text-white leading-tight">
            {formatNumber(latest)} <span className="text-xs font-normal text-neutral-500">{unit}</span>
          </p>
        ) : (
          <p className="text-xs text-neutral-500">{t('dashboard.noWeightYet')}</p>
        )}
        {delta !== null && delta !== 0 && (
          // Neutral colour: gaining is the goal for some, losing for others (Vision §14 — no judgement).
          <p className="text-[11px] text-neutral-300">
            {formatSignedNumber(delta)} {unit} · {t('dashboard.thisWeek')}
          </p>
        )}
        {showChart ? (
          <div className="mt-auto h-10 pt-1" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points}>
                <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                <Area type="monotone" dataKey="weight" stroke={chart.successSoft} fill={chart.successSoftArea} strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : latest !== null ? (
          <p className="mt-auto text-[11px] text-neutral-500">{t('dashboard.weightChartHint')}</p>
        ) : null}
      </div>
    </CardLink>
  );
}
