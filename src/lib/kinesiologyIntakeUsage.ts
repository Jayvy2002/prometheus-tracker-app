import { supabase } from './supabase';
import type { IntakeUsageSignals } from './kinesiologyIntake';

const PROBE_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('intake usage probe timeout')), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function userHasRow(table: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Cheap existence checks — never load full logs just to decide the intake wall. */
export async function probeIntakeUsage(userId: string): Promise<IntakeUsageSignals> {
  return withTimeout((async () => {
    const [hasWorkout, hasNutrition, hasCheckIn, hasWeight] = await Promise.all([
      userHasRow('workouts', userId),
      userHasRow('nutrition_logs', userId),
      userHasRow('daily_checkins', userId),
      userHasRow('weight_measurements', userId),
    ]);
    return { hasWorkout, hasNutrition, hasCheckIn, hasWeight };
  })(), PROBE_TIMEOUT_MS);
}
