import { ACTIVITY_LEVELS, GOALS } from './constants';
import type { UserProfile } from './types';

export function calculateBMR(weightKg: number, heightCm: number, age: number, gender: string): number {
  if (gender === 'female') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

export function calculateTDEE(bmr: number, activityLevel: string): number {
  const level = ACTIVITY_LEVELS.find(l => l.value === activityLevel);
  return Math.round(bmr * (level?.multiplier ?? 1.55));
}

const ACTIVITY_RANK = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
type ActivityRank = (typeof ACTIVITY_RANK)[number];

function asActivityRank(value: string | null | undefined): ActivityRank | null {
  return ACTIVITY_RANK.includes(value as ActivityRank) ? (value as ActivityRank) : null;
}

/** Harris-Benedict band from weekly sessions (occupation is a bump on top, not a replacement). */
export function activityLevelFromSessions(sessions: number): ActivityRank {
  if (!Number.isFinite(sessions) || sessions <= 0) return 'sedentary';
  if (sessions <= 2) return 'light';
  if (sessions <= 4) return 'moderate';
  if (sessions <= 6) return 'active';
  return 'very_active';
}

export function higherActivityLevel(a: string, b: string): ActivityRank {
  const ia = ACTIVITY_RANK.indexOf(asActivityRank(a) ?? 'moderate');
  const ib = ACTIVITY_RANK.indexOf(asActivityRank(b) ?? 'moderate');
  return ACTIVITY_RANK[Math.max(ia, ib)];
}

/**
 * Training days set the Harris-Benedict band. A physical job bumps one level.
 * Sitting / standing never *replace* the training band (that underfed desk athletes ~900 kcal).
 */
export function activityLevelFromTrainingAndOccupation(
  sessions: number,
  occupation?: string | null,
): ActivityRank {
  let level = activityLevelFromSessions(sessions);
  if (occupation === 'physical') {
    const i = ACTIVITY_RANK.indexOf(level);
    level = ACTIVITY_RANK[Math.min(ACTIVITY_RANK.length - 1, i + 1)];
  }
  return level;
}

/** Goal modifier on TDEE, never below BMR when BMR is known. */
export function calculateCalorieTarget(tdee: number, goal: string, bmr = 0): number {
  const g = GOALS.find(g => g.value === goal);
  const raw = Math.round(tdee + (g?.modifier ?? 0));
  const floor = bmr > 0 ? Math.round(bmr) : 0;
  return Math.max(floor, raw);
}

/**
 * ISSN-style protein from bodyweight, capped at ~40% of calories.
 * Fat/carbs fill the remainder. dietType overlays the remaining split.
 */
export function calculateMacros(
  calorieTarget: number,
  goal: string,
  dietType?: string,
  weightKg?: number,
) {
  const proteinPerKg = goal === 'cut' ? 2.2 : goal === 'bulk' ? 1.8 : 1.6;
  const maxProteinCal = calorieTarget * 0.40;
  let proteinG = weightKg && weightKg > 0
    ? Math.round(weightKg * proteinPerKg)
    : Math.round((calorieTarget * 0.30) / 4);
  if (proteinG * 4 > maxProteinCal) {
    proteinG = Math.round(maxProteinCal / 4);
  }

  const remainingCal = Math.max(0, calorieTarget - proteinG * 4);

  let fatShare: number;
  let carbShare: number;
  if (dietType === 'keto' || dietType === 'carnivore') {
    fatShare = 0.90;
    carbShare = 0.10;
  } else if (dietType === 'paleo') {
    fatShare = 0.45;
    carbShare = 0.55;
  } else if (goal === 'cut') {
    fatShare = 0.40;
    carbShare = 0.60;
  } else if (goal === 'bulk') {
    fatShare = 0.30;
    carbShare = 0.70;
  } else {
    fatShare = 0.35;
    carbShare = 0.65;
  }

  const fatG = Math.round((remainingCal * fatShare) / 9);
  const carbsG = Math.round((remainingCal * carbShare) / 4);

  return { protein: proteinG, fat: fatG, carbs: carbsG };
}

export function localWorkoutTimestamp(d: Date = new Date()): string {
  return `${toLocalDateStr(d)}T12:00:00`;
}

export function programWeekNumber(startDate: string, durationWeeks: number, today: Date = new Date()): number {
  const start = parseDate(startDate);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayLocal.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  return Math.min(durationWeeks, Math.floor(diffDays / 7) + 1);
}

export function calculateEnhancedTDEE(
  bmr: number,
  activityLevel: string,
  dailyStepsAverage: number,
  trainingFrequency: number,
): number {
  const effective = higherActivityLevel(activityLevel, activityLevelFromSessions(trainingFrequency));
  const level = ACTIVITY_LEVELS.find(l => l.value === effective);
  const baseMultiplier = level?.multiplier ?? 1.55;

  const stepsAbove5k = Math.max(0, dailyStepsAverage - 5000);
  const neatBonus = stepsAbove5k * 0.04;

  return Math.round(bmr * baseMultiplier + neatBonus);
}

export function calculateWaterTarget(
  weightKg: number,
  dailyStepsAverage: number,
  activityLevel: string,
  hydrationHabit: string,
): number {
  let base = weightKg * 33;

  const stepsAbove5k = Math.max(0, dailyStepsAverage - 5000);
  base += stepsAbove5k * 0.05;

  if (activityLevel === 'active' || activityLevel === 'very_active') {
    base += 500;
  } else if (activityLevel === 'moderate') {
    base += 250;
  }

  if (hydrationHabit === 'poor') {
    base = Math.min(base, base * 0.9);
  }

  return Math.round(base / 50) * 50;
}

export function getAge(dateOfBirth: string): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10;
}

export function cmToIn(cm: number): number {
  return Math.round(cm / 2.54 * 10) / 10;
}

export function inToCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10;
}

export function formatWeight(kg: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') return `${kgToLbs(kg)} lbs`;
  return `${Math.round(kg * 10) / 10} kg`;
}

export function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function parseDate(dateStr: string): Date {
  if (dateStr.includes('T') || dateStr.includes('Z')) {
    const d = new Date(dateStr);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return parseDateStr(dateStr);
}

/** Product default is French; English only when the user picked it. */
export function dateLocale(lang?: string): string {
  return (lang ?? 'fr').toLowerCase().startsWith('en') ? 'en-US' : 'fr-FR';
}

export function formatDate(dateStr: string, lang?: string): string {
  return parseDate(dateStr).toLocaleDateString(dateLocale(lang), {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatDateShort(dateStr: string, lang?: string): string {
  return parseDate(dateStr).toLocaleDateString(dateLocale(lang), {
    month: 'short', day: 'numeric',
  });
}

export function formatWeekdayDate(d: Date = new Date(), lang?: string): string {
  return d.toLocaleDateString(dateLocale(lang), { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** YYYY-MM-DD in the user's local timezone (never UTC via toISOString). */
export function toLocalDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayStr(): string {
  return toLocalDateStr();
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function issnTargetsFromProfile(profile: Pick<
  UserProfile,
  | 'weight_kg'
  | 'height_cm'
  | 'date_of_birth'
  | 'gender'
  | 'activity_level'
  | 'goal'
  | 'diet_type'
  | 'daily_steps_average'
  | 'training_frequency'
  | 'hydration_habit'
>) {
  const age = profile.date_of_birth ? getAge(profile.date_of_birth) : 25;
  const bmr = calculateBMR(profile.weight_kg, profile.height_cm, age, profile.gender || 'male');
  const tdee = calculateEnhancedTDEE(
    bmr,
    profile.activity_level,
    profile.daily_steps_average,
    profile.training_frequency,
  );
  const calories = calculateCalorieTarget(tdee, profile.goal, bmr);
  const macros = calculateMacros(calories, profile.goal, profile.diet_type, profile.weight_kg);
  const water = calculateWaterTarget(
    profile.weight_kg,
    profile.daily_steps_average,
    profile.activity_level,
    profile.hydration_habit,
  );
  return { calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat, water, tdee, bmr };
}
