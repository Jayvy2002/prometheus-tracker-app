/** Coach-owned kcal/macros/water/steps: an athlete never self-serves these columns. */

import type { CalorieDraft } from './coachInterventions';

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

export type SetupTargetChoice = 'keep' | 'issn';

type NutritionProfile = {
  daily_calorie_target?: number | null;
  protein_target?: number | null;
  carbs_target?: number | null;
  fat_target?: number | null;
};

function asMacro(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** Existing sent targets on the profile (ex-solo, or already written by a coach). */
export function profileNutritionDraft(profile: NutritionProfile | null | undefined): CalorieDraft | null {
  if (!hasSentNutritionTarget(profile)) return null;
  return {
    calories: asMacro(profile?.daily_calorie_target),
    protein: asMacro(profile?.protein_target),
    carbs: asMacro(profile?.carbs_target),
    fat: asMacro(profile?.fat_target),
  };
}

export function nutritionDraftsEqual(a: CalorieDraft, b: CalorieDraft): boolean {
  return a.calories === b.calories
    && a.protein === b.protein
    && a.carbs === b.carbs
    && a.fat === b.fat;
}

export function initialSetupTargetChoice(profile: NutritionProfile | null | undefined): SetupTargetChoice {
  return profileNutritionDraft(profile) ? 'keep' : 'issn';
}

export function setupTargetsFromChoice(
  choice: SetupTargetChoice,
  profile: NutritionProfile | null | undefined,
  issn: CalorieDraft,
): CalorieDraft {
  if (choice === 'keep') return profileNutritionDraft(profile) ?? issn;
  return issn;
}
