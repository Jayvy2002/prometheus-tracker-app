import type { DailyCheckin, ProgramExerciseDraft } from './types';

export const TRAINING_VAR_KEYS = ['sets', 'reps', 'reps_range', 'rir', 'load', 'rest'] as const;
export const NUTRITION_VAR_KEYS = ['calories', 'protein', 'carbs', 'fat', 'water', 'steps'] as const;
export const CHECKIN_VAR_KEYS = [
  'sleep_hours',
  'sleep_quality',
  'energy',
  'mood',
  'motivation',
  'hunger',
  'fatigue',
  'stress',
  'soreness',
  'joint_pain',
  'notes',
] as const;

export type TrainingVarKey = typeof TRAINING_VAR_KEYS[number];
export type NutritionVarKey = typeof NUTRITION_VAR_KEYS[number];
export type CheckinVarKey = typeof CHECKIN_VAR_KEYS[number];

export type TrainingVars = Record<TrainingVarKey, boolean>;
export type NutritionVars = Record<NutritionVarKey, boolean>;
export type CheckinVars = Record<CheckinVarKey, boolean>;

export type TrackingModuleKey = 'workouts' | 'checkins' | 'nutrition' | 'weight';

export interface ResolvedTrackingConfig {
  track_workouts: boolean;
  track_checkins: boolean;
  track_nutrition: boolean;
  track_weight: boolean;
  workout_focus: string;
  training: TrainingVars;
  nutrition: NutritionVars;
  checkin: CheckinVars;
  setup_completed_at: string | null;
}

export const DEFAULT_TRAINING_VARS: TrainingVars = {
  sets: true,
  reps: true,
  reps_range: true,
  rir: true,
  load: true,
  rest: true,
};

export const DEFAULT_NUTRITION_VARS: NutritionVars = {
  calories: true,
  protein: true,
  carbs: true,
  fat: true,
  water: true,
  steps: true,
};

export const DEFAULT_CHECKIN_VARS: CheckinVars = {
  sleep_hours: true,
  sleep_quality: true,
  energy: true,
  mood: true,
  motivation: true,
  hunger: true,
  fatigue: true,
  stress: true,
  soreness: true,
  joint_pain: true,
  notes: true,
};

export const ALL_ON_TRACKING: ResolvedTrackingConfig = {
  track_workouts: true,
  track_checkins: true,
  track_nutrition: true,
  track_weight: true,
  workout_focus: '',
  training: { ...DEFAULT_TRAINING_VARS },
  nutrition: { ...DEFAULT_NUTRITION_VARS },
  checkin: { ...DEFAULT_CHECKIN_VARS },
  setup_completed_at: null,
};

const OFF_TRAINING_VARS: TrainingVars = {
  sets: false,
  reps: false,
  reps_range: false,
  rir: false,
  load: false,
  rest: false,
};

const OFF_NUTRITION_VARS: NutritionVars = {
  calories: false,
  protein: false,
  carbs: false,
  fat: false,
  water: false,
  steps: false,
};

const OFF_CHECKIN_VARS: CheckinVars = {
  sleep_hours: false,
  sleep_quality: false,
  energy: false,
  mood: false,
  motivation: false,
  hunger: false,
  fatigue: false,
  stress: false,
  soreness: false,
  joint_pain: false,
  notes: false,
};

/** Coached athlete before a tracking row exists — never flash the full tracker. */
export const ALL_OFF_TRACKING: ResolvedTrackingConfig = {
  track_workouts: false,
  track_checkins: false,
  track_nutrition: false,
  track_weight: false,
  workout_focus: '',
  training: { ...OFF_TRAINING_VARS },
  nutrition: { ...OFF_NUTRITION_VARS },
  checkin: { ...OFF_CHECKIN_VARS },
  setup_completed_at: null,
};

export type CheckinScaleKey = keyof Pick<
  DailyCheckin,
  | 'hunger'
  | 'fatigue'
  | 'sleep_quality'
  | 'stress'
  | 'motivation'
  | 'muscle_soreness'
  | 'joint_pain'
  | 'energy_level'
  | 'mood'
>;

export const CHECKIN_SCALE_BY_VAR: Partial<Record<CheckinVarKey, CheckinScaleKey>> = {
  sleep_quality: 'sleep_quality',
  energy: 'energy_level',
  mood: 'mood',
  motivation: 'motivation',
  hunger: 'hunger',
  fatigue: 'fatigue',
  stress: 'stress',
  soreness: 'muscle_soreness',
  joint_pain: 'joint_pain',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function parseBoolMap<K extends string>(
  raw: unknown,
  keys: readonly K[],
  defaults: Record<K, boolean>,
): Record<K, boolean> {
  const src = asRecord(raw);
  const out = { ...defaults };
  if (!src) return out;
  for (const key of keys) {
    if (key in src) out[key] = asBool(src[key], defaults[key]);
  }
  return out;
}

export function parseTrainingVars(raw: unknown): TrainingVars {
  return parseBoolMap(raw, TRAINING_VAR_KEYS, DEFAULT_TRAINING_VARS);
}

export function parseNutritionVars(raw: unknown): NutritionVars {
  return parseBoolMap(raw, NUTRITION_VAR_KEYS, DEFAULT_NUTRITION_VARS);
}

export function parseCheckinVars(raw: unknown): CheckinVars {
  return parseBoolMap(raw, CHECKIN_VAR_KEYS, DEFAULT_CHECKIN_VARS);
}

export function parseResolvedTracking(raw: unknown): ResolvedTrackingConfig {
  const src = asRecord(raw);
  if (!src) return { ...ALL_ON_TRACKING, training: { ...DEFAULT_TRAINING_VARS }, nutrition: { ...DEFAULT_NUTRITION_VARS }, checkin: { ...DEFAULT_CHECKIN_VARS } };
  return {
    track_workouts: asBool(src.track_workouts, true),
    track_checkins: asBool(src.track_checkins, true),
    track_nutrition: asBool(src.track_nutrition, true),
    track_weight: asBool(src.track_weight, true),
    workout_focus: typeof src.workout_focus === 'string' ? src.workout_focus : '',
    training: parseTrainingVars(src.training_vars ?? src.training),
    nutrition: parseNutritionVars(src.nutrition_vars ?? src.nutrition),
    checkin: parseCheckinVars(src.checkin_vars ?? src.checkin),
    setup_completed_at: typeof src.setup_completed_at === 'string' ? src.setup_completed_at : null,
  };
}

export function serializeTrackingVars(cfg: ResolvedTrackingConfig): {
  track_workouts: boolean;
  track_checkins: boolean;
  track_nutrition: boolean;
  track_weight: boolean;
  workout_focus: string;
  training_vars: TrainingVars;
  nutrition_vars: NutritionVars;
  checkin_vars: CheckinVars;
  setup_completed_at?: string | null;
} {
  return {
    track_workouts: cfg.track_workouts,
    track_checkins: cfg.track_checkins,
    track_nutrition: cfg.track_nutrition,
    track_weight: cfg.track_weight,
    workout_focus: cfg.workout_focus,
    training_vars: { ...cfg.training },
    nutrition_vars: { ...cfg.nutrition },
    checkin_vars: { ...cfg.checkin },
    setup_completed_at: cfg.setup_completed_at,
  };
}

/** Coach-level defaults stored on coach_settings.default_tracking. */
export function parseCoachTrackingDefaults(raw: unknown): ResolvedTrackingConfig {
  return parseResolvedTracking(raw);
}

export function seedTrackingFromDefaults(defaults: ResolvedTrackingConfig | null | undefined): ResolvedTrackingConfig {
  const src = defaults ?? ALL_ON_TRACKING;
  return {
    ...src,
    training: { ...src.training },
    nutrition: { ...src.nutrition },
    checkin: { ...src.checkin },
    setup_completed_at: null,
  };
}

export function showModule(cfg: ResolvedTrackingConfig, module: TrackingModuleKey): boolean {
  if (module === 'workouts') return cfg.track_workouts;
  if (module === 'checkins') return cfg.track_checkins;
  if (module === 'nutrition') return cfg.track_nutrition;
  return cfg.track_weight;
}

export function showTrainingField(cfg: ResolvedTrackingConfig, key: TrainingVarKey): boolean {
  return cfg.track_workouts && cfg.training[key];
}

export function showNutritionField(cfg: ResolvedTrackingConfig, key: NutritionVarKey): boolean {
  return cfg.track_nutrition && cfg.nutrition[key];
}

export function showCheckinField(cfg: ResolvedTrackingConfig, key: CheckinVarKey): boolean {
  return cfg.track_checkins && cfg.checkin[key];
}

export type RepsInputMode = 'hidden' | 'single' | 'range' | 'either';

export function repsInputMode(cfg: ResolvedTrackingConfig): RepsInputMode {
  const single = showTrainingField(cfg, 'reps');
  const range = showTrainingField(cfg, 'reps_range');
  if (!single && !range) return 'hidden';
  if (single && range) return 'either';
  if (range) return 'range';
  return 'single';
}

export function visibleCheckinFields(cfg: ResolvedTrackingConfig): CheckinVarKey[] {
  if (!cfg.track_checkins) return [];
  return CHECKIN_VAR_KEYS.filter(key => cfg.checkin[key]);
}

export function checkinHasAnyField(cfg: ResolvedTrackingConfig): boolean {
  return visibleCheckinFields(cfg).length > 0;
}

export function anyMacroField(cfg: ResolvedTrackingConfig): boolean {
  return (['calories', 'protein', 'carbs', 'fat'] as const).some(key => showNutritionField(cfg, key));
}

/** Overlay AI/module flags onto an existing config without forcing every variable on. */
export function mergeTrackingOverlay(
  current: ResolvedTrackingConfig,
  overlay: unknown,
): ResolvedTrackingConfig {
  const src = asRecord(overlay);
  if (!src) return current;
  const hasTraining = 'training_vars' in src || 'training' in src;
  const hasNutrition = 'nutrition_vars' in src || 'nutrition' in src;
  const hasCheckin = 'checkin_vars' in src || 'checkin' in src;
  return {
    ...current,
    track_workouts: 'track_workouts' in src ? asBool(src.track_workouts, current.track_workouts) : current.track_workouts,
    track_checkins: 'track_checkins' in src ? asBool(src.track_checkins, current.track_checkins) : current.track_checkins,
    track_nutrition: 'track_nutrition' in src ? asBool(src.track_nutrition, current.track_nutrition) : current.track_nutrition,
    track_weight: 'track_weight' in src ? asBool(src.track_weight, current.track_weight) : current.track_weight,
    workout_focus: typeof src.workout_focus === 'string' && src.workout_focus
      ? src.workout_focus
      : current.workout_focus,
    training: hasTraining ? parseTrainingVars(src.training_vars ?? src.training) : current.training,
    nutrition: hasNutrition ? parseNutritionVars(src.nutrition_vars ?? src.nutrition) : current.nutrition,
    checkin: hasCheckin ? parseCheckinVars(src.checkin_vars ?? src.checkin) : current.checkin,
  };
}

export function toggleGroup<K extends string>(
  current: Record<K, boolean>,
  keys: readonly K[],
  enabled: boolean,
): Record<K, boolean> {
  const next = { ...current };
  for (const key of keys) next[key] = enabled;
  return next;
}

export function groupAllEnabled<K extends string>(current: Record<K, boolean>, keys: readonly K[]): boolean {
  return keys.every(key => current[key]);
}

export function formatExercisePrescription(
  ex: Pick<ProgramExerciseDraft, 'default_sets' | 'default_reps' | 'default_reps_min' | 'default_rir' | 'default_weight_kg'> & {
    default_rest_seconds?: number | null;
  },
  cfg?: ResolvedTrackingConfig | null,
): string {
  const tracking = cfg ?? ALL_ON_TRACKING;
  const parts: string[] = [];
  const mode = repsInputMode(tracking);
  const setsOn = showTrainingField(tracking, 'sets');
  const repsText = mode === 'hidden'
    ? ''
    : (mode !== 'single' && ex.default_reps_min && ex.default_reps_min !== ex.default_reps
      ? `${ex.default_reps_min}–${ex.default_reps}`
      : String(ex.default_reps));
  if (setsOn && repsText) parts.push(`${ex.default_sets}×${repsText}`);
  else if (setsOn) parts.push(`${ex.default_sets} séries`);
  else if (repsText) parts.push(repsText);
  if (showTrainingField(tracking, 'load') && ex.default_weight_kg != null && ex.default_weight_kg > 0) {
    parts.push(`${ex.default_weight_kg} kg`);
  }
  if (showTrainingField(tracking, 'rir') && ex.default_rir != null) {
    parts.push(`RIR ${ex.default_rir}`);
  }
  if (showTrainingField(tracking, 'rest') && ex.default_rest_seconds != null) {
    parts.push(`${ex.default_rest_seconds}s`);
  }
  return parts.join(' · ');
}

/** Solo users (no coach) always see the full tracker. Coached + no row = all off. */
export function resolveViewerTracking(
  row: unknown,
  hasCoach: boolean,
): ResolvedTrackingConfig {
  if (!hasCoach) {
    return {
      ...ALL_ON_TRACKING,
      training: { ...DEFAULT_TRAINING_VARS },
      nutrition: { ...DEFAULT_NUTRITION_VARS },
      checkin: { ...DEFAULT_CHECKIN_VARS },
    };
  }
  if (row == null) {
    return {
      ...ALL_OFF_TRACKING,
      training: { ...OFF_TRAINING_VARS },
      nutrition: { ...OFF_NUTRITION_VARS },
      checkin: { ...OFF_CHECKIN_VARS },
    };
  }
  return parseResolvedTracking(row);
}
