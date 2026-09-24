import type { UserProfile } from '../../../shared/types';
import { normalizePersonalModules, type PersonalModules } from '../../../lib/clientTracking';
import {
  calculateBMR, calculateCalorieTarget, calculateMacros, calculateTDEE, getAge, hasMeasuresForTargets,
} from '../../../lib/utils';
import { parseDecimalInput } from '../../workout/domain/workoutSetComplete';

/**
 * Vision §5.3 — minimal onboarding, never a giant questionnaire and never an
 * invented value. Four screens: goal, training, modules, measurements
 * (optional). Nothing is preselected; nutrition targets exist only when real
 * measurements allow them.
 */
export const SOLO_ONBOARDING_STEPS = 4;

export type Equipment = 'gym' | 'home' | 'bodyweight' | 'mixed';
export const EQUIPMENT_OPTIONS: readonly Equipment[] = ['gym', 'home', 'bodyweight', 'mixed'];

export interface SoloOnboardingForm {
  full_name: string;
  goal: '' | 'cut' | 'maintain' | 'bulk';
  training_experience: string;
  training_frequency: number | null;
  training_equipment: '' | Equipment;
  injuries_limitations: string;
  modules: PersonalModules;
  unit_weight: 'kg' | 'lbs';
  gender: '' | 'male' | 'female' | 'other';
  date_of_birth: string;
  height_cm: string;
  weight: string;
  target_weight: string;
}

export function emptySoloOnboardingForm(): SoloOnboardingForm {
  return {
    full_name: '',
    goal: '',
    training_experience: '',
    training_frequency: null,
    training_equipment: '',
    injuries_limitations: '',
    modules: { workouts: true, nutrition: true, weight: true, checkins: true },
    unit_weight: 'kg',
    gender: '',
    date_of_birth: '',
    height_cm: '',
    weight: '',
    target_weight: '',
  };
}

export type MeasureError = 'height' | 'weight' | 'targetWeight' | 'dateOfBirth';

const LB = 2.20462;

function toKg(value: string, unit: 'kg' | 'lbs'): number | null {
  if (value.trim() === '') return null;
  const n = parseDecimalInput(value);
  if (!Number.isFinite(n)) return Number.NaN;
  return unit === 'lbs' ? Math.round((n / LB) * 10) / 10 : n;
}

/** Optional measurements: empty is fine, a typed value must be plausible. */
export function measureErrors(form: SoloOnboardingForm, today = new Date()): MeasureError[] {
  const errors: MeasureError[] = [];
  const height = form.height_cm.trim() === '' ? null : parseDecimalInput(form.height_cm);
  if (height != null && !(height >= 100 && height <= 250)) errors.push('height');
  const weight = toKg(form.weight, form.unit_weight);
  if (weight != null && !(weight >= 30 && weight <= 300)) errors.push('weight');
  const target = toKg(form.target_weight, form.unit_weight);
  if (target != null && !(target >= 30 && target <= 300)) errors.push('targetWeight');
  if (form.date_of_birth) {
    const dob = new Date(`${form.date_of_birth}T12:00:00`);
    const age = Number.isNaN(dob.getTime()) ? -1 : getAge(form.date_of_birth);
    if (Number.isNaN(dob.getTime()) || dob > today || age < 13 || age > 100) errors.push('dateOfBirth');
  }
  return errors;
}

/** What still blocks « Continue », in screen order — said out loud, never a silent grey button. */
export type OnboardingMissing =
  | 'firstName'
  | 'goal'
  | 'experience'
  | 'frequency'
  | 'equipment'
  | 'modules'
  | 'measures';

export function missingSoloOnboarding(step: number, form: SoloOnboardingForm): OnboardingMissing[] {
  const missing: OnboardingMissing[] = [];
  switch (step) {
    case 0:
      if (form.full_name.trim().length === 0) missing.push('firstName');
      if (form.goal === '') missing.push('goal');
      break;
    case 1:
      if (form.training_experience === '') missing.push('experience');
      if (form.training_frequency == null) missing.push('frequency');
      if (form.training_equipment === '') missing.push('equipment');
      break;
    case 2:
      if (!Object.values(normalizePersonalModules(form.modules)).some(Boolean)) missing.push('modules');
      break;
    case 3:
      // Measurements are optional: only a typed, implausible value blocks.
      if (measureErrors(form).length > 0) missing.push('measures');
      break;
    default:
      break;
  }
  return missing;
}

export function canContinueSoloOnboarding(step: number, form: SoloOnboardingForm): boolean {
  if (step < 0 || step >= SOLO_ONBOARDING_STEPS) return false;
  return missingSoloOnboarding(step, form).length === 0;
}

/** Frequency stands in for the activity question we no longer ask. */
function activityFromFrequency(frequency: number | null): string {
  if (frequency == null || frequency <= 2) return 'light';
  if (frequency <= 4) return 'moderate';
  return 'active';
}

export interface SoloOnboardingResult {
  profile: Partial<UserProfile>;
  /** First weigh-in, only when the user typed a weight. */
  weighInKg: number | null;
}

export function buildSoloOnboardingPayload(
  form: SoloOnboardingForm,
  opts: { coached: boolean; fallbackName: string },
): SoloOnboardingResult {
  const heightCm = form.height_cm.trim() === '' ? null : parseDecimalInput(form.height_cm);
  const weightKg = toKg(form.weight, form.unit_weight);
  const targetKg = toKg(form.target_weight, form.unit_weight);
  const modules = normalizePersonalModules(form.modules);

  const profile: Partial<UserProfile> = {
    full_name: form.full_name.trim() || opts.fallbackName,
    goal: form.goal || 'maintain',
    training_experience: form.training_experience,
    training_frequency: form.training_frequency ?? undefined,
    training_equipment: form.training_equipment || null,
    injuries_limitations: form.injuries_limitations.trim(),
    unit_weight: form.unit_weight,
    personal_modules: modules,
    activity_level: activityFromFrequency(form.training_frequency),
    onboarding_completed: true,
  };
  if (form.gender) profile.gender = form.gender;
  if (form.date_of_birth) profile.date_of_birth = form.date_of_birth;
  if (heightCm != null && Number.isFinite(heightCm)) profile.height_cm = heightCm;
  if (weightKg != null && Number.isFinite(weightKg)) profile.weight_kg = weightKg;
  if (targetKg != null && Number.isFinite(targetKg)) profile.target_weight_kg = targetKg;

  // A coach owns a coached athlete's targets; a Solo gets targets only from real measurements.
  const measured = {
    weight_kg: profile.weight_kg ?? null,
    height_cm: profile.height_cm ?? null,
    date_of_birth: profile.date_of_birth ?? null,
  };
  if (!opts.coached && modules.nutrition && hasMeasuresForTargets(measured)) {
    const bmr = calculateBMR(measured.weight_kg as number, measured.height_cm as number, getAge(measured.date_of_birth as string), form.gender);
    const tdee = calculateTDEE(bmr, profile.activity_level as string);
    const calories = calculateCalorieTarget(tdee, profile.goal as string, bmr);
    const macros = calculateMacros(calories, profile.goal as string, undefined, measured.weight_kg as number);
    profile.daily_calorie_target = calories;
    profile.protein_target = macros.protein;
    profile.carbs_target = macros.carbs;
    profile.fat_target = macros.fat;
  }

  return {
    profile,
    weighInKg: weightKg != null && Number.isFinite(weightKg) ? weightKg : null,
  };
}
