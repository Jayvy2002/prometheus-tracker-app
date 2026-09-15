/** A stored target is honest only when the user or coach actually chose it. */
export function definedTarget(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function nutritionTargetsFromProfile(profile: {
  daily_calorie_target?: number | null;
  protein_target?: number | null;
  carbs_target?: number | null;
  fat_target?: number | null;
  daily_water_target_ml?: number | null;
  daily_steps_target?: number | null;
} | null | undefined): {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  waterMl: number | null;
  steps: number | null;
} {
  return {
    calories: definedTarget(profile?.daily_calorie_target),
    protein: definedTarget(profile?.protein_target),
    carbs: definedTarget(profile?.carbs_target),
    fat: definedTarget(profile?.fat_target),
    waterMl: definedTarget(profile?.daily_water_target_ml),
    steps: definedTarget(profile?.daily_steps_target),
  };
}

export function targetRatio(value: number, target: number | null): number {
  if (target == null || target <= 0) return 0;
  return Math.min(100, (value / target) * 100);
}
