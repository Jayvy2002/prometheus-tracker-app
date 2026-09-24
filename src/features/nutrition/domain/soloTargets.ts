import type { UserProfile } from '../../../shared/types';
import {
  calculateBMR, calculateCalorieTarget, calculateMacros, calculateTDEE, getAge, hasMeasuresForTargets,
} from '../../../lib/utils';

export interface SoloNutritionTargets {
  daily_calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
}

/**
 * A Solo's calorie and macro targets for a body goal, from real measurements
 * only. Null when weight, height or birth date is missing: no target is
 * better than a target built on invented numbers.
 */
export function soloNutritionTargets(
  profile: Pick<UserProfile, 'weight_kg' | 'height_cm' | 'date_of_birth' | 'gender' | 'activity_level' | 'diet_type'>,
  goal: string,
): SoloNutritionTargets | null {
  if (!hasMeasuresForTargets(profile)) return null;
  const bmr = calculateBMR(profile.weight_kg, profile.height_cm, getAge(profile.date_of_birth as string), profile.gender);
  const tdee = calculateTDEE(bmr, profile.activity_level);
  const calories = calculateCalorieTarget(tdee, goal, bmr);
  const macros = calculateMacros(calories, goal, profile.diet_type, profile.weight_kg);
  return {
    daily_calorie_target: calories,
    protein_target: macros.protein,
    carbs_target: macros.carbs,
    fat_target: macros.fat,
  };
}
