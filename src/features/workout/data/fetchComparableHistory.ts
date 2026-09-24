import { supabase } from '../../../lib/supabase';
import { exerciseKey, frontierOf, loadRepFrontier, type LoadReps } from '../domain/comparableRecords';

type HistoryRow = {
  name: string;
  workout_sets: Array<{ weight_kg: number; reps: number; completed: boolean; set_type: string }> | null;
};

/**
 * Best comparable sets per exercise from the athlete's sessions before
 * `before`. Returns null when the history cannot be read (offline, error):
 * no records is then shown rather than a wrong one.
 */
export async function fetchComparableHistory(
  userId: string,
  names: string[],
  excludeWorkoutId: string,
  before: string,
): Promise<Record<string, LoadReps[]> | null> {
  const distinct = [...new Set(names.map(n => n.trim()).filter(Boolean))];
  if (distinct.length === 0) return {};
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('name, workout_sets(weight_kg, reps, completed, set_type), workouts!inner(user_id, date)')
    .eq('workouts.user_id', userId)
    .lt('workouts.date', before)
    .neq('workout_id', excludeWorkoutId)
    .in('name', distinct)
    .limit(2000);
  if (error) return null;
  const out: Record<string, LoadReps[]> = {};
  for (const row of (data ?? []) as unknown as HistoryRow[]) {
    const key = exerciseKey(row.name);
    out[key] = frontierOf([...(out[key] ?? []), ...loadRepFrontier(row.workout_sets)]);
  }
  return out;
}
