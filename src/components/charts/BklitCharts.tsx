import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '../../lib/cn';
import { Area } from './area';
import { AreaChart as BklitAreaChart } from './area-chart';
import { Bar } from './bar';
import { BarChart as BklitBarChart } from './bar-chart';
import { BarXAxis } from './bar-x-axis';
import type { ChartStatus } from './chart-phase';
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
const ENTER_MS = 1100;
const LOADING_MS = 900;
const LOADING_STROKE = 'color-mix(in oklch, var(--chart-line-primary) 75%, white)';

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

function useBklitStatus(dataLength: number): ChartStatus {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<ChartStatus>('loading');

  useEffect(() => {
    if (reduceMotion) {
      setStatus(dataLength > 0 ? 'ready' : 'loading');
      return;
    }
    setStatus('loading');
    if (dataLength === 0) return;
    const id = window.setTimeout(() => setStatus('ready'), LOADING_MS);
    return () => window.clearTimeout(id);
  }, [dataLength, reduceMotion]);

  return status;
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
  const status = useBklitStatus(data.length);
  return (
    <BklitLineChart
      data={data}
      xDataKey={xKey}
      className={cn('h-full w-full min-h-[8rem]', className)}
      aspectRatio="auto"
      margin={MARGIN}
      status={status}
      animationDuration={ENTER_MS}
    >
      <Grid horizontal shimmer shimmerSpeed={1.35} />
      <Line
        dataKey={yKey}
        showMarkers={showDots}
        stroke={color}
        animate
        loadingStyle="sweep"
        loadingStroke={LOADING_STROKE}
        loadingStrokeOpacity={0.85}
      />
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
  const status = useBklitStatus(data.length);
  return (
    <BklitAreaChart
      data={data}
      xDataKey={xKey}
      className={cn('h-full w-full min-h-[8rem]', className)}
      aspectRatio="auto"
      margin={MARGIN}
      status={status}
      animationDuration={ENTER_MS}
    >
      <Grid horizontal shimmer shimmerSpeed={1.35} />
      <Area
        dataKey={yKey}
        showMarkers={showDots}
        fill={color}
        stroke={color}
        animate
        loadingStyle="sweep"
        loadingStroke={LOADING_STROKE}
        loadingStrokeOpacity={0.85}
      />
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
  const status = useBklitStatus(data.length);
  return (
    <BklitBarChart
      data={data}
      xDataKey={xKey}
      className={cn('h-full w-full min-h-[8rem]', className)}
      aspectRatio="auto"
      margin={MARGIN}
      status={status}
      animationDuration={ENTER_MS}
    >
      <Grid horizontal shimmer shimmerSpeed={1.35} />
      <Bar dataKey={yKey} fill={color} />
      <BarXAxis />
      <ChartTooltip rows={tooltipRows(yKey, formatValue, valueLabel)} />
    </BklitBarChart>
  );
}
