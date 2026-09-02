import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/cn';
import {
  areaPathFromLine,
  monotonePath,
  nearestIndex,
  niceTicks,
  scaleLinear,
  subsampleIndices,
  yDomain,
} from '../../lib/chartGeometry';

export type ChartDatum = Record<string, string | number>;

type CartesianProps = {
  data: ChartDatum[];
  xKey: string;
  yKey: string;
  className?: string;
  color?: string;
  tickFormatter?: (value: string | number, index: number) => string;
  formatValue?: (value: number) => string;
  valueLabel?: string;
  yPadding?: number;
  yWidth?: number;
  maxXTicks?: number;
  referenceY?: number;
  referenceLabel?: string;
  showDots?: boolean;
  allowDecimals?: boolean;
};

const PAD_TOP = 10;
const PAD_RIGHT = 8;
const PAD_BOTTOM = 22;

function useMeasure() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ...size };
}

function readNumber(row: ChartDatum, key: string): number {
  const value = row[key];
  return typeof value === 'number' ? value : Number(value);
}

function readLabel(row: ChartDatum, key: string): string | number {
  return row[key] ?? '';
}

type Layout = {
  xs: number[];
  ys: number[];
  labels: Array<string | number>;
  values: number[];
  xToPx: (v: number) => number;
  yToPx: (v: number) => number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  yTicks: number[];
  xTickIdx: number[];
};

function useLayout(
  data: ChartDatum[],
  xKey: string,
  yKey: string,
  width: number,
  height: number,
  yWidth: number,
  yPadding: number,
  maxXTicks: number,
  integers: boolean,
): Layout | null {
  return useMemo(() => {
    if (width < 8 || height < 8 || data.length === 0) return null;
    const values = data.map(d => readNumber(d, yKey));
    const labels = data.map(d => readLabel(d, xKey));
    const [yMin, yMax] = yDomain(values, yPadding, integers);
    const innerLeft = yWidth;
    const innerRight = width - PAD_RIGHT;
    const innerTop = PAD_TOP;
    const innerBottom = height - PAD_BOTTOM;
    const xToPx = scaleLinear([0, Math.max(1, data.length - 1)], [innerLeft, innerRight]);
    const yToPx = scaleLinear([yMin, yMax], [innerBottom, innerTop]);
    const xs = values.map((_, i) => xToPx(i));
    const ys = values.map(v => yToPx(v));
    return {
      xs,
      ys,
      labels,
      values,
      xToPx,
      yToPx,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
      yTicks: niceTicks(yMin, yMax, 4, integers),
      xTickIdx: subsampleIndices(data.length, maxXTicks),
    };
  }, [data, xKey, yKey, width, height, yWidth, yPadding, maxXTicks, integers]);
}

function ChartTooltip({
  layout,
  index,
  formatValue,
  valueLabel,
}: {
  layout: Layout;
  index: number;
  formatValue?: (value: number) => string;
  valueLabel?: string;
}) {
  const x = layout.xs[index];
  const y = layout.ys[index];
  const value = layout.values[index];
  const label = layout.labels[index];
  const text = formatValue ? formatValue(value) : String(value);
  const left = Math.min(layout.innerRight - 8, Math.max(layout.innerLeft + 8, x));
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={layout.innerTop}
        y2={layout.innerBottom}
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeDasharray="3 3"
      />
      <circle cx={x} cy={y} r={4} fill="var(--background, #000)" stroke="currentColor" strokeWidth={2} />
      <foreignObject x={left - 64} y={Math.max(0, y - 46)} width={128} height={42}>
        <div className="pointer-events-none flex flex-col items-center">
          <div className="rounded-lg border border-white/10 bg-neutral-950/95 px-2 py-1 text-center shadow-lg">
            <p className="text-[9px] leading-none text-neutral-500">{String(label)}</p>
            <p className="mt-0.5 text-[11px] font-medium text-white">
              {text}
              {valueLabel ? <span className="ml-1 text-neutral-500">{valueLabel}</span> : null}
            </p>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function Axes({
  layout,
  tickFormatter,
}: {
  layout: Layout;
  tickFormatter?: (value: string | number, index: number) => string;
}) {
  return (
    <g className="text-neutral-500">
      {layout.yTicks.map(tick => {
        const y = layout.yToPx(tick);
        if (y < layout.innerTop - 1 || y > layout.innerBottom + 1) return null;
        return (
          <g key={tick}>
            <line
              x1={layout.innerLeft}
              x2={layout.innerRight}
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
            />
            <text
              x={layout.innerLeft - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--chart-tick)"
            >
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        );
      })}
      {layout.xTickIdx.map(i => (
        <text
          key={i}
          x={layout.xs[i]}
          y={layout.innerBottom + 14}
          textAnchor="middle"
          fontSize={10}
          fill="var(--chart-tick)"
        >
          {tickFormatter ? tickFormatter(layout.labels[i], i) : String(layout.labels[i])}
        </text>
      ))}
    </g>
  );
}

function Reference({
  layout,
  y,
  label,
}: {
  layout: Layout;
  y: number;
  label?: string;
}) {
  const py = layout.yToPx(y);
  if (py < layout.innerTop || py > layout.innerBottom) return null;
  return (
    <g>
      <line
        x1={layout.innerLeft}
        x2={layout.innerRight}
        y1={py}
        y2={py}
        stroke="#f59e0b"
        strokeDasharray="4 4"
        strokeOpacity={0.85}
      />
      {label ? (
        <text x={layout.innerRight} y={py - 4} textAnchor="end" fontSize={10} fill="#f59e0b">
          {label}
        </text>
      ) : null}
    </g>
  );
}

function useHover(layout: Layout | null) {
  const [index, setIndex] = useState<number | null>(null);

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!layout) return;
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    setIndex(nearestIndex(layout.xs, x));
  };

  return {
    index,
    onPointerMove: onPointer,
    onPointerLeave: () => setIndex(null),
  };
}

function Frame({
  className,
  color,
  data,
  xKey,
  yKey,
  yWidth = 36,
  yPadding = 0,
  maxXTicks = 6,
  allowDecimals = true,
  tickFormatter,
  formatValue,
  valueLabel,
  referenceY,
  referenceLabel,
  children,
}: CartesianProps & {
  children: (layout: Layout, hover: number | null, reduce: boolean | null) => ReactNode;
}) {
  const { ref, width, height } = useMeasure();
  const layout = useLayout(
    data,
    xKey,
    yKey,
    width,
    height,
    yWidth,
    yPadding,
    maxXTicks,
    !allowDecimals,
  );
  const hover = useHover(layout);
  const reduce = useReducedMotion();

  return (
    <div ref={ref} className={cn('relative h-full w-full min-h-[8rem]', className)} style={{ color }}>
      {layout ? (
        <svg
          width={width}
          height={height}
          className="block overflow-visible"
          onPointerMove={hover.onPointerMove}
          onPointerLeave={hover.onPointerLeave}
        >
          <Axes layout={layout} tickFormatter={tickFormatter} />
          {referenceY != null && (
            <Reference layout={layout} y={referenceY} label={referenceLabel} />
          )}
          {children(layout, hover.index, reduce)}
          {hover.index != null && (
            <ChartTooltip
              layout={layout}
              index={hover.index}
              formatValue={formatValue}
              valueLabel={valueLabel}
            />
          )}
        </svg>
      ) : null}
    </div>
  );
}

export function LineChart({
  showDots = true,
  color = 'var(--chart-1)',
  ...props
}: CartesianProps) {
  return (
    <Frame {...props} color={color}>
      {(layout, hover, reduce) => {
        const points = layout.xs.map((x, i) => ({ x, y: layout.ys[i] }));
        const d = monotonePath(points);
        return (
          <g>
            <motion.path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            />
            {showDots &&
              points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={hover === i ? 4 : 3}
                  fill="currentColor"
                />
              ))}
          </g>
        );
      }}
    </Frame>
  );
}

export function AreaChart({
  showDots = false,
  color = 'var(--chart-1)',
  ...props
}: CartesianProps) {
  const gradId = useId();
  return (
    <Frame {...props} color={color}>
      {(layout, hover, reduce) => {
        const points = layout.xs.map((x, i) => ({ x, y: layout.ys[i] }));
        const line = monotonePath(points);
        const area = areaPathFromLine(line, points[0].x, points[points.length - 1].x, layout.innerBottom);
        return (
          <g>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <motion.path
              d={area}
              fill={`url(#${gradId})`}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            />
            <motion.path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            />
            {showDots &&
              points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 4 : 3} fill="currentColor" />
              ))}
          </g>
        );
      }}
    </Frame>
  );
}

export function BarChart({
  color = 'var(--chart-1)',
  ...props
}: CartesianProps) {
  return (
    <Frame {...props} color={color}>
      {(layout, hover, reduce) => {
        const n = layout.xs.length;
        const slot = n > 1 ? (layout.innerRight - layout.innerLeft) / Math.max(1, n) : 16;
        const barW = Math.max(3, Math.min(28, slot * 0.62));
        return (
          <g>
            {layout.xs.map((x, i) => {
              const y = layout.ys[i];
              const h = Math.max(1, layout.innerBottom - y);
              return (
                <motion.rect
                  key={i}
                  x={x - barW / 2}
                  width={barW}
                  rx={3}
                  ry={3}
                  fill="currentColor"
                  fillOpacity={hover == null || hover === i ? 1 : 0.45}
                  initial={reduce ? false : { y: layout.innerBottom, height: 0 }}
                  animate={{ y, height: h }}
                  transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </g>
        );
      }}
    </Frame>
  );
}
