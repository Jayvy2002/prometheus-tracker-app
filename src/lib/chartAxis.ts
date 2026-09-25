/**
 * Evenly spaced whole-number ticks for a weight chart: « 62 · 64 · 66 · 68 »
 * instead of the library's « 62.8 · 63.65 · 64.5 ». Values keep one unit of
 * margin; the step grows (1, 2, 5, 10…) so there are at most five ticks.
 */
export function niceWeightAxis(values: number[]): { domain: [number, number]; ticks: number[] } | null {
  const finite = values.filter(v => Number.isFinite(v));
  if (finite.length === 0) return null;
  const low = Math.floor(Math.min(...finite) - 1);
  const high = Math.ceil(Math.max(...finite) + 1);
  const bounds = (step: number) => [Math.floor(low / step) * step, Math.ceil(high / step) * step] as const;
  const fits = (step: number) => {
    const [from, to] = bounds(step);
    return (to - from) / step + 1 <= 5;
  };
  const step = [1, 2, 5, 10, 20, 50, 100, 200].find(fits) ?? Math.ceil((high - low) / 4);
  const [start, end] = bounds(step);
  const ticks: number[] = [];
  for (let v = start; v <= end; v += step) ticks.push(v);
  return { domain: [start, end], ticks };
}
