import { cn } from '../../lib/cn';
import { Area } from './area';
import { AreaChart as BklitAreaChart } from './area-chart';
import { Bar } from './bar';
import { BarChart as BklitBarChart } from './bar-chart';
import { BarXAxis } from './bar-x-axis';
import { Grid } from './grid';
import { Line } from './line';
import { LineChart as BklitLineChart } from './line-chart';
import { ChartTooltip } from './tooltip';
import { XAxis } from './x-axis';

export type ChartDatum = Record<string, string | number>;

type GymChartProps = {
  data: ChartDatum[];
  xKey?: string;
  yKey: string;
  className?: string;
  color?: string;
  tickFormatter?: (value: string | number, index: number) => string;
  formatValue?: (value: number) => string;
  valueLabel?: string;
  yPadding?: number;
  showDots?: boolean;
  referenceY?: number;
  referenceLabel?: string;
  allowDecimals?: boolean;
};

const MARGIN = { top: 12, right: 8, bottom: 28, left: 8 };

function tooltipRows(
  yKey: string,
  formatValue?: (value: number) => string,
  valueLabel?: string,
) {
  return (point: Record<string, unknown>) => {
    const raw = point[yKey];
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    const value = formatValue ? formatValue(numeric) : String(raw ?? '');
    return [{ label: valueLabel ?? yKey, value, color: 'var(--chart-line-primary)' }];
  };
}

export function LineChart({
  data,
  xKey = 'date',
  yKey,
  className,
  color,
  formatValue,
  valueLabel,
  showDots = true,
}: GymChartProps) {
  return (
    <BklitLineChart
      data={data}
      xDataKey={xKey}
      className={cn('h-full w-full min-h-[8rem]', className)}
      aspectRatio="auto"
      margin={MARGIN}
    >
      <Grid horizontal />
      <Line dataKey={yKey} showMarkers={showDots} stroke={color} />
      <XAxis />
      <ChartTooltip rows={tooltipRows(yKey, formatValue, valueLabel)} />
    </BklitLineChart>
  );
}

export function AreaChart({
  data,
  xKey = 'date',
  yKey,
  className,
  color,
  formatValue,
  valueLabel,
  showDots = false,
}: GymChartProps) {
  return (
    <BklitAreaChart
      data={data}
      xDataKey={xKey}
      className={cn('h-full w-full min-h-[8rem]', className)}
      aspectRatio="auto"
      margin={MARGIN}
    >
      <Grid horizontal />
      <Area dataKey={yKey} showMarkers={showDots} fill={color} stroke={color} />
      <XAxis />
      <ChartTooltip rows={tooltipRows(yKey, formatValue, valueLabel)} />
    </BklitAreaChart>
  );
}

export function BarChart({
  data,
  xKey = 'date',
  yKey,
  className,
  color,
  formatValue,
  valueLabel,
}: GymChartProps) {
  return (
    <BklitBarChart
      data={data}
      xDataKey={xKey}
      className={cn('h-full w-full min-h-[8rem]', className)}
      aspectRatio="auto"
      margin={MARGIN}
    >
      <Grid horizontal />
      <Bar dataKey={yKey} fill={color} />
      <BarXAxis />
      <ChartTooltip rows={tooltipRows(yKey, formatValue, valueLabel)} />
    </BklitBarChart>
  );
}
