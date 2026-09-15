import type { ClientLiftProgress, DailyNutritionPoint, WeightMeasurement } from '../../../lib/types';
import { correctLogCalories } from '../../../lib/foodEnergy';
import { epley1RM, isPerformedSet } from '../../../lib/performedSets';

export { epley1RM } from '../../../lib/performedSets';

export function aggregateNutritionByDay(
  logs: Array<{ logged_at: string; calories: number; protein: number; carbs: number; fat: number; quantity?: number; unit?: string }>,
  target: number,
): DailyNutritionPoint[] {
  const byDate = new Map<string, DailyNutritionPoint>();
  for (const log of logs) {
    const d = (log.logged_at || '').slice(0, 10);
    if (!d) continue;
    const calories = correctLogCalories(log);
    const row = byDate.get(d) ?? { date: d, calories: 0, protein: 0, carbs: 0, fat: 0, target };
    row.calories += calories;
    row.protein += Number(log.protein) || 0;
    row.carbs += Number(log.carbs) || 0;
    row.fat += Number(log.fat) || 0;
    byDate.set(d, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function liftChartPoints(lift: ClientLiftProgress): Array<{
  date: string;
  topSet: number;
  volume: number;
  e1rm: number;
}> {
  return [...lift.sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => {
      const e1rm = s.sets
        .filter(isPerformedSet)
        .reduce((acc, set) => Math.max(acc, epley1RM(set.weight_kg, set.reps)), 0);
      return {
        date: s.date,
        topSet: s.maxWeight,
        volume: Math.round(s.volume),
        e1rm,
      };
    });
}

export function sparklineValues(lift: ClientLiftProgress, metric: 'topSet' | 'volume' | 'e1rm' = 'topSet'): number[] {
  return liftChartPoints(lift).map(p => p[metric]).filter(n => n > 0);
}

export function weightChartPoints(weights: WeightMeasurement[]): Array<{ date: string; kg: number }> {
  return [...weights]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .map(w => ({ date: w.measured_at.slice(0, 10), kg: Number(w.weight_kg) }));
}
