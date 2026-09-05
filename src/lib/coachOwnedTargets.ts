/** Coach-owned kcal/macros/water/steps: an athlete never self-serves these columns. */

export const MIN_SENT_CALORIE_TARGET = 800;

export const NUTRITION_TARGET_KEYS = [
  'daily_calorie_target',
  'protein_target',
  'carbs_target',
  'fat_target',
] as const;

export const COACH_LOCKED_PROFILE_KEYS = [
  ...NUTRITION_TARGET_KEYS,
  'daily_water_target_ml',
  'daily_steps_target',
] as const;

export type NutritionTargetKey = typeof NUTRITION_TARGET_KEYS[number];

export function hasSentNutritionTarget(
  profile: { daily_calorie_target?: number | null } | null | undefined,
): boolean {
  const n = profile?.daily_calorie_target;
  return typeof n === 'number' && Number.isFinite(n) && n >= MIN_SENT_CALORIE_TARGET;
}

export function stripSelfServeNutritionTargets<T extends Record<string, unknown>>(
  updates: T,
  isCoached: boolean,
): T {
  if (!isCoached) return updates;
  const next = { ...updates };
  for (const key of COACH_LOCKED_PROFILE_KEYS) {
    delete next[key];
  }
  return next;
}
