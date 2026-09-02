import { supabase } from './supabase';
import type { IntakeUsageSignals } from './kinesiologyIntake';

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
  const [hasWorkout, hasNutrition, hasCheckIn, hasWeight] = await Promise.all([
    userHasRow('workouts', userId),
    userHasRow('nutrition_logs', userId),
    userHasRow('daily_checkins', userId),
    userHasRow('weight_measurements', userId),
  ]);
  return { hasWorkout, hasNutrition, hasCheckIn, hasWeight };
}
