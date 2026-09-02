import { useTranslation } from 'react-i18next';
import { AreaChart, BarChart, LineChart } from '../charts/GymCharts';
import Card from '../ui/Card';
import type { DailyNutritionPoint } from '../../lib/types';

function tick(value: string | number) {
  return String(value).slice(5);
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
        <AreaChart
          data={points}
          xKey="date"
          yKey="kg"
          tickFormatter={tick}
          formatValue={value => `${Number(value).toFixed(1)} kg`}
          yPadding={1}
        />
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
        <BarChart
          data={points.map(p => ({ date: p.date, calories: p.calories }))}
          xKey="date"
          yKey="calories"
          tickFormatter={tick}
          formatValue={value => String(Math.round(value))}
          valueLabel={t('common.calories')}
          referenceY={target > 0 ? target : undefined}
        />
      </div>
      {target > 0 && (
        <p className="text-[10px] text-neutral-500 mt-1">{t('coaching.progress.calorieTarget', { n: Math.round(target) })}</p>
      )}
    </Card>
  );
}

export function LiftLineChart({ points }: { points: Array<{ date: string; topSet: number; volume?: number; e1rm?: number }> }) {
  const { t } = useTranslation();
  if (points.length === 0) return null;
  return (
    <div className="h-40">
      <LineChart
        data={points}
        xKey="date"
        yKey="topSet"
        tickFormatter={tick}
        formatValue={value => `${value} kg`}
        valueLabel={t('coaching.progress.topSet')}
      />
    </div>
  );
}
