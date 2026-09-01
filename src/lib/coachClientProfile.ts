import { DIET_TYPES, GOALS, TRAINING_EXPERIENCES, TRAINING_FOCUSES } from './constants';
import type { UserProfile } from './types';

export const CLIENT_VISIBLE_GOALS = GOALS.map(g => g.value);

export type ClientVisibleGoal = typeof GOALS[number]['value'];

export interface ClientVisibleProfilePatch {
  goal?: ClientVisibleGoal;
  target_weight_kg?: number;
  daily_calorie_target?: number;
  protein_target?: number;
  carbs_target?: number;
  fat_target?: number;
  daily_water_target_ml?: number;
  daily_steps_target?: number;
  training_experience?: string;
  training_frequency?: number;
  training_focus?: string;
  injuries_limitations?: string;
  diet_type?: string;
  food_allergies?: string[];
  sleep_hours_average?: number;
}

const GOAL_SET = new Set<string>(CLIENT_VISIBLE_GOALS);
const EXPERIENCE_SET = new Set<string>(TRAINING_EXPERIENCES.map(x => x.value));
const FOCUS_SET = new Set<string>(TRAINING_FOCUSES.map(x => x.value));
const DIET_SET = new Set<string>(DIET_TYPES.map(x => x.value));

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

export type PatchResult =
  | { ok: true; patch: ClientVisibleProfilePatch }
  | { ok: false; error: string };

export function parseClientVisiblePatch(raw: unknown): PatchResult {
  const src = asRecord(raw);
  if (!src) return { ok: false, error: 'empty' };
  const patch: ClientVisibleProfilePatch = {};

  if ('goal' in src) {
    const goal = String(src.goal ?? '').trim().toLowerCase();
    if (!GOAL_SET.has(goal)) return { ok: false, error: 'goal' };
    patch.goal = goal as ClientVisibleGoal;
  }
  if ('target_weight_kg' in src) {
    const n = asNumber(src.target_weight_kg);
    if (n == null || !inRange(n, 30, 300)) return { ok: false, error: 'target_weight_kg' };
    patch.target_weight_kg = Math.round(n * 10) / 10;
  }
  if ('daily_calorie_target' in src) {
    const n = asNumber(src.daily_calorie_target);
    if (n == null || !inRange(n, 800, 8000)) return { ok: false, error: 'daily_calorie_target' };
    patch.daily_calorie_target = Math.round(n);
  }
  if ('protein_target' in src) {
    const n = asNumber(src.protein_target);
    if (n == null || !inRange(n, 0, 500)) return { ok: false, error: 'protein_target' };
    patch.protein_target = Math.round(n);
  }
  if ('carbs_target' in src) {
    const n = asNumber(src.carbs_target);
    if (n == null || !inRange(n, 0, 800)) return { ok: false, error: 'carbs_target' };
    patch.carbs_target = Math.round(n);
  }
  if ('fat_target' in src) {
    const n = asNumber(src.fat_target);
    if (n == null || !inRange(n, 0, 400)) return { ok: false, error: 'fat_target' };
    patch.fat_target = Math.round(n);
  }
  if ('daily_water_target_ml' in src) {
    const n = asNumber(src.daily_water_target_ml);
    if (n == null || !inRange(n, 500, 10000)) return { ok: false, error: 'daily_water_target_ml' };
    patch.daily_water_target_ml = Math.round(n);
  }
  if ('daily_steps_target' in src) {
    const n = asNumber(src.daily_steps_target);
    if (n == null || !inRange(n, 0, 100000)) return { ok: false, error: 'daily_steps_target' };
    patch.daily_steps_target = Math.round(n);
  }
  if ('training_experience' in src) {
    const v = String(src.training_experience ?? '').trim();
    if (!EXPERIENCE_SET.has(v)) return { ok: false, error: 'training_experience' };
    patch.training_experience = v;
  }
  if ('training_frequency' in src) {
    const n = asNumber(src.training_frequency);
    if (n == null || !inRange(n, 1, 14)) return { ok: false, error: 'training_frequency' };
    patch.training_frequency = Math.round(n);
  }
  if ('training_focus' in src) {
    const v = String(src.training_focus ?? '').trim();
    if (!FOCUS_SET.has(v)) return { ok: false, error: 'training_focus' };
    patch.training_focus = v;
  }
  if ('injuries_limitations' in src) {
    const v = String(src.injuries_limitations ?? '');
    if (v.length > 2000) return { ok: false, error: 'injuries_limitations' };
    patch.injuries_limitations = v;
  }
  if ('diet_type' in src) {
    const v = String(src.diet_type ?? '').trim();
    if (!DIET_SET.has(v)) return { ok: false, error: 'diet_type' };
    patch.diet_type = v;
  }
  if ('food_allergies' in src) {
    if (!Array.isArray(src.food_allergies)) return { ok: false, error: 'food_allergies' };
    patch.food_allergies = src.food_allergies.map(x => String(x)).filter(Boolean).slice(0, 20);
  }
  if ('sleep_hours_average' in src) {
    const n = asNumber(src.sleep_hours_average);
    if (n == null || !inRange(n, 0, 24)) return { ok: false, error: 'sleep_hours_average' };
    patch.sleep_hours_average = Math.round(n * 10) / 10;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: 'empty' };
  return { ok: true, patch };
}

export function profileToVisiblePatch(profile: UserProfile): ClientVisibleProfilePatch {
  return {
    goal: GOAL_SET.has(profile.goal) ? profile.goal as ClientVisibleGoal : 'maintain',
    target_weight_kg: profile.target_weight_kg,
    daily_calorie_target: profile.daily_calorie_target ?? undefined,
    protein_target: profile.protein_target ?? undefined,
    carbs_target: profile.carbs_target ?? undefined,
    fat_target: profile.fat_target ?? undefined,
    daily_water_target_ml: profile.daily_water_target_ml,
    daily_steps_target: profile.daily_steps_target,
    training_experience: profile.training_experience,
    training_frequency: profile.training_frequency,
    training_focus: profile.training_focus,
    injuries_limitations: profile.injuries_limitations,
    diet_type: profile.diet_type,
    food_allergies: profile.food_allergies ?? [],
    sleep_hours_average: Number(profile.sleep_hours_average),
  };
}
