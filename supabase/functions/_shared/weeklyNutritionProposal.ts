/**
 * Canonical weekly nutrition proposal (Solo card + Coach fleet + watch snapshot).
 * Never auto-applied. Deno and the app import this file so P2.5 cannot drift
 * from the fleet/Solo calorie builder.
 */

export const WEEKLY_NUTRITION_WINDOW_DAYS = 14;
export const WEEKLY_SMALL_KCAL = 100;
export const WEEKLY_LARGE_KCAL = 200;
export const WEEKLY_CARB_SHIFT_G = 35;
export const FATIGUE_DECLARED_MIN = 7;
export const ENERGY_DECLARED_MAX = 3;
export const CUT_GAIN_MIN_DELTA_KG = 0.3;
export const CUT_STALL_MIN_DELTA_KG = -0.2;
export const CUT_TOO_FAST_PCT_PER_WEEK = 1.5;
export const BULK_TOO_FAST_PCT_PER_WEEK = 0.7;
export const MIN_NUTRITION_LOG_DAYS = 4;
export const OVEREAT_RATIO = 1.15;
export const UNDER_EAT_RATIO = 0.85;
const MACRO_KCAL_TOLERANCE = 0.15;

export interface CalorieDraft {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type WeeklyNutritionReason =
  | "keep"
  | "not_following"
  | "cut_stall"
  | "cut_gain"
  | "too_fast_cut"
  | "bulk_stall"
  | "bulk_too_fast"
  | "carb_support";

export interface WeeklyNutritionProposal {
  action: "keep" | "relance" | "calorie_adjustment";
  reason: WeeklyNutritionReason;
  draft: CalorieDraft | null;
  guarded?: boolean;
}

export interface WeeklyNutritionInput {
  goal: string;
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  weight_kg: number;
  logged_nutrition_days: number;
  avg_calories: number;
  weight_delta_kg: number | null;
  weight_start_kg?: number | null;
  weight_end_kg?: number | null;
  weight_span_days?: number | null;
  avg_effective_target?: number;
  avg_adherence_nutrition?: number | null;
  avg_fatigue?: number | null;
  avg_energy?: number | null;
  tracking?: {
    nutrition?: boolean;
    workouts?: boolean;
    weight?: boolean;
    checkins?: boolean;
  };
  is_minor?: boolean;
  has_medical_flags?: boolean;
}

export type NutritionTrackingKey = "nutrition" | "workouts" | "weight" | "checkins";

export function normalizeNutritionGoal(goal: string | null | undefined): "cut" | "bulk" | "maintain" | "" {
  const g = (goal || "").trim().toLowerCase();
  if (g === "cut" || g === "lose" || g === "fat_loss" || g === "weight_loss") return "cut";
  if (g === "bulk" || g === "gain" || g === "muscle") return "bulk";
  if (g === "maintain" || g === "recomp") return "maintain";
  return "";
}

export function isCompleteCalorieDraft(draft: CalorieDraft | null | undefined): boolean {
  if (!draft) return false;
  if (draft.calories < 800 || draft.calories > 8000) return false;
  if (draft.protein <= 0 || draft.carbs <= 0 || draft.fat <= 0) return false;
  const fromMacros = draft.protein * 4 + draft.carbs * 4 + draft.fat * 9;
  return Math.abs(fromMacros - draft.calories) <= draft.calories * MACRO_KCAL_TOLERANCE;
}

function calculateIssnMacros(calorieTarget: number, goal: string, weightKg?: number): {
  protein: number;
  fat: number;
  carbs: number;
} {
  const proteinPerKg = goal === "cut" ? 2.2 : goal === "bulk" ? 1.8 : 1.6;
  const maxProteinCal = calorieTarget * 0.40;
  let proteinG = weightKg && weightKg > 0
    ? Math.round(weightKg * proteinPerKg)
    : Math.round((calorieTarget * 0.30) / 4);
  if (proteinG * 4 > maxProteinCal) {
    proteinG = Math.round(maxProteinCal / 4);
  }
  const remainingCal = Math.max(0, calorieTarget - proteinG * 4);
  const fatShare = goal === "cut" ? 0.40 : goal === "bulk" ? 0.30 : 0.35;
  const carbShare = 1 - fatShare;
  return {
    protein: proteinG,
    fat: Math.round((remainingCal * fatShare) / 9),
    carbs: Math.round((remainingCal * carbShare) / 4),
  };
}

export function completeMacrosFor(calories: number, goal: string, weightKg: number): CalorieDraft {
  const macros = calculateIssnMacros(calories, normalizeNutritionGoal(goal) || "maintain", weightKg || undefined);
  return {
    calories: Math.round(calories),
    protein: Math.max(1, macros.protein),
    carbs: Math.max(1, macros.carbs),
    fat: Math.max(1, macros.fat),
  };
}

function clampCalories(n: number): number {
  return Math.min(8000, Math.max(800, Math.round(n)));
}

function adherenceOnFive(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 5) return Math.round(raw * 10) / 10;
  return Math.round((raw / 20) * 10) / 10;
}

function overeatRatio(avgCalories: number, calorieTarget: number): number {
  if (calorieTarget <= 0 || avgCalories <= 0) return 0;
  return avgCalories / calorieTarget;
}

function weeklyWeightPct(
  deltaKg: number | null,
  startKg: number | null,
  spanDays: number | null | undefined = WEEKLY_NUTRITION_WINDOW_DAYS,
): number | null {
  if (deltaKg == null || startKg == null || startKg <= 0) return null;
  const span = spanDays ?? WEEKLY_NUTRITION_WINDOW_DAYS;
  if (!Number.isFinite(span) || span < 1) return null;
  return (deltaKg / startKg) * 100 / (span / 7);
}

export function trackingOn(d: WeeklyNutritionInput, key: NutritionTrackingKey): boolean {
  const t = d.tracking;
  if (!t) return true;
  return t[key] !== false;
}

export function effectiveCalorieTarget(d: WeeklyNutritionInput): number {
  const eff = d.avg_effective_target ?? 0;
  if (eff > 0) return Math.round(eff);
  return Math.round(d.calorie_target);
}

export function isGuardedProfile(d: WeeklyNutritionInput): boolean {
  return d.is_minor === true || d.has_medical_flags === true;
}

function currentOrIssnDraft(d: WeeklyNutritionInput): CalorieDraft {
  const current: CalorieDraft = {
    calories: Math.round(d.calorie_target),
    protein: Math.round(d.protein_target),
    carbs: Math.round(d.carbs_target),
    fat: Math.round(d.fat_target),
  };
  if (isCompleteCalorieDraft(current)) return current;
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  return completeMacrosFor(base, d.goal, d.weight_end_kg || d.weight_kg);
}

export function signsOfFatigue(d: WeeklyNutritionInput): boolean {
  const fatigue = d.avg_fatigue;
  const energy = d.avg_energy;
  if (fatigue != null && Number.isFinite(fatigue) && fatigue >= FATIGUE_DECLARED_MIN) return true;
  if (energy != null && Number.isFinite(energy) && energy <= ENERGY_DECLARED_MAX) return true;
  return false;
}

export function shiftCarbsKeepCalories(draft: CalorieDraft, extraCarbs = WEEKLY_CARB_SHIFT_G): CalorieDraft {
  const protein = Math.max(1, draft.protein);
  const carbs = Math.max(1, draft.carbs + extraCarbs);
  const remaining = draft.calories - protein * 4 - carbs * 4;
  const fat = Math.max(1, Math.round(remaining / 9));
  return {
    calories: Math.round(draft.calories),
    protein,
    carbs,
    fat,
  };
}

export function nutritionFollowingPlan(d: WeeklyNutritionInput): boolean {
  const target = effectiveCalorieTarget(d);
  if (target <= 0 || d.logged_nutrition_days < MIN_NUTRITION_LOG_DAYS) return false;
  const ratio = overeatRatio(d.avg_calories, target);
  if (ratio >= OVEREAT_RATIO || ratio <= UNDER_EAT_RATIO) return false;
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  if (adh != null && adh <= 2) return false;
  return true;
}

/** Data-driven weekly nutrition proposal. Never auto-applied — human confirms. */
export function proposeWeeklyNutrition(d: WeeklyNutritionInput): WeeklyNutritionProposal {
  if (!trackingOn(d, "nutrition")) {
    return { action: "keep", reason: "keep", draft: null };
  }
  if (!nutritionFollowingPlan(d)) {
    return { action: "relance", reason: "not_following", draft: null };
  }

  const weight = d.weight_end_kg || d.weight_kg;
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  const goal = normalizeNutritionGoal(d.goal);
  const current = currentOrIssnDraft(d);
  const span = d.weight_span_days ?? WEEKLY_NUTRITION_WINDOW_DAYS;
  const guarded = isGuardedProfile(d);
  const adjust = (reason: WeeklyNutritionReason, draft: CalorieDraft): WeeklyNutritionProposal =>
    guarded
      ? { action: "keep", reason: "keep", draft: null, guarded: true }
      : { action: "calorie_adjustment", reason, draft };

  if (signsOfFatigue(d)) {
    return adjust("carb_support", shiftCarbsKeepCalories(current));
  }

  const delta = d.weight_delta_kg;
  const pct = weeklyWeightPct(delta, d.weight_start_kg ?? d.weight_kg, span);

  if (goal === "cut") {
    if (pct != null && pct <= -CUT_TOO_FAST_PCT_PER_WEEK) {
      return adjust("too_fast_cut", completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    if (delta != null && delta >= CUT_GAIN_MIN_DELTA_KG) {
      return adjust("cut_gain", completeMacrosFor(clampCalories(base - WEEKLY_LARGE_KCAL), d.goal, weight));
    }
    if (delta != null && delta >= CUT_STALL_MIN_DELTA_KG) {
      return adjust("cut_stall", completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    return guarded && delta != null
      ? { action: "keep", reason: "keep", draft: null, guarded: true }
      : { action: "keep", reason: "keep", draft: null };
  }

  if (goal === "bulk") {
    if (pct != null && pct >= BULK_TOO_FAST_PCT_PER_WEEK) {
      return adjust("bulk_too_fast", completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    if (delta != null && delta <= 0.1) {
      return adjust("bulk_stall", completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    return guarded && delta != null
      ? { action: "keep", reason: "keep", draft: null, guarded: true }
      : { action: "keep", reason: "keep", draft: null };
  }

  if (delta != null && Math.abs(delta) >= 1.5) {
    const dir = delta > 0 ? -WEEKLY_SMALL_KCAL : WEEKLY_SMALL_KCAL;
    return adjust(
      delta > 0 ? "cut_gain" : "bulk_stall",
      completeMacrosFor(clampCalories(base + dir), d.goal, weight),
    );
  }
  return { action: "keep", reason: "keep", draft: null };
}

export interface WatchNutritionTarget {
  domain: "nutrition" | "weight" | "recovery";
  type: "not_following" | "stall" | "too_fast" | "fatigue";
  kind: "adherence_nutrition" | "calorie_adjustment";
  flag: string;
}

/** Maps the canonical nutrition proposal onto the watch (domain, type) it judges. */
export function watchTargetFromNutritionProposal(
  proposal: WeeklyNutritionProposal,
): WatchNutritionTarget | null {
  if (proposal.action === "keep") return null;
  if (proposal.reason === "not_following" || proposal.action === "relance") {
    return {
      domain: "nutrition",
      type: "not_following",
      kind: "adherence_nutrition",
      flag: "adherence_nutrition",
    };
  }
  if (proposal.reason === "too_fast_cut" || proposal.reason === "bulk_too_fast") {
    return { domain: "weight", type: "too_fast", kind: "calorie_adjustment", flag: "too_fast" };
  }
  if (proposal.reason === "cut_stall" || proposal.reason === "cut_gain" || proposal.reason === "bulk_stall") {
    return { domain: "weight", type: "stall", kind: "calorie_adjustment", flag: "stall_adherent" };
  }
  if (proposal.reason === "carb_support") {
    return { domain: "recovery", type: "fatigue", kind: "calorie_adjustment", flag: "carb_support" };
  }
  return null;
}
