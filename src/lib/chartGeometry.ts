/** Gym-usable cartesian helpers (Bklit-inspired, owned). No visx. */

export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range || 1));
  const fraction = range / 10 ** exponent;
  let nice: number;
  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else if (fraction <= 1) nice = 1;
  else if (fraction <= 2) nice = 2;
  else if (fraction <= 5) nice = 5;
  else nice = 10;
  return nice * 10 ** exponent;
}

export function niceTicks(min: number, max: number, count: number, integers = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = integers ? 1 : Math.abs(min) * 0.05 || 1;
    return niceTicks(min - pad, max + pad, count, integers);
  }
  const span = max - min;
  let step = niceNum(span / Math.max(1, count - 1), true);
  if (integers) step = Math.max(1, Math.round(step));
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

export function yDomain(values: number[], padding = 0, integers = false): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= padding || (integers ? 1 : Math.abs(min) * 0.05 || 1);
    max += padding || (integers ? 1 : Math.abs(max) * 0.05 || 1);
  } else {
    min -= padding;
    max += padding;
  }
  if (integers) {
    min = Math.floor(min);
    max = Math.ceil(max);
  }
  return [min, max];
}

/** Fritsch–Carlson monotone cubic. */
export function monotonePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const n = points.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    m[i] = dx[i] === 0 ? 0 : dy / dx[i];
  }

  const tangents = new Array<number>(n);
  tangents[0] = m[0];
  tangents[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-12) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / m[i];
    const b = tangents[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangents[i] = t * a * m[i];
      tangents[i + 1] = t * b * m[i];
    }
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpx = dx[i] / 3;
    d += ` C ${p0.x + cpx} ${p0.y + tangents[i] * cpx}, ${p1.x - cpx} ${p1.y - tangents[i + 1] * cpx}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function areaPathFromLine(line: string, firstX: number, lastX: number, baselineY: number): string {
  if (!line) return '';
  return `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
}

export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const dist = Math.abs(xs[i] - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function subsampleIndices(length: number, max: number): number[] {
  if (length <= 0) return [];
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / Math.max(1, max - 1);
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const index = Math.round(i * step);
    if (!seen.has(index)) {
      seen.add(index);
      out.push(index);
    }
  }
  return out;
}
