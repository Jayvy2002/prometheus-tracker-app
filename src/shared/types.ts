/** Contrats transversaux — lot 22a. Les écrans importent encore via `lib/types`. */

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  gender: string;
  date_of_birth: string | null;
  height_cm: number;
  weight_kg: number;
  activity_level: string;
  goal: string;
  target_weight_kg: number;
  daily_calorie_target: number | null;
  protein_target: number | null;
  carbs_target: number | null;
  fat_target: number | null;
  /** Null = no goal chosen (never an invented 2 500 ml / 10 000 steps). */
  daily_water_target_ml: number | null;
  daily_steps_target: number | null;
  unit_weight: 'kg' | 'lbs';
  unit_distance: 'km' | 'mi';
  unit_height: 'cm' | 'in';
  avatar_url: string;
  language?: string;
  /** IANA zone (e.g. America/Toronto). Written from the device on first profile load. */
  timezone?: string | null;
  onboarding_completed: boolean;
  diet_type: string;
  food_allergies: string[];
  meals_per_day: number;
  cooking_level: string;
  daily_steps_average: number;
  sleep_hours_average: number;
  training_experience: string;
  training_frequency: number;
  training_focus: string;
  injuries_limitations: string;
  stress_level: string;
  hydration_habit: string;
  supplement_use: string[];
  motivation: string;
  kinesiology_intake?: Record<string, unknown> | null;
  /** Solo module choice (Vision §5.3). Null = not chosen yet: everything shown. Ignored while a coach is active. */
  /** Available equipment, asked at onboarding. Null = not said. */
  training_equipment?: 'gym' | 'home' | 'bodyweight' | 'mixed' | null;
  /** « Action now » push categories (Vision §21). Null = all on. */
  notification_categories?: Partial<Record<'messages' | 'coaching' | 'program' | 'decisions', boolean>> | null;
  personal_modules?: Partial<Record<'workouts' | 'nutrition' | 'weight' | 'checkins', boolean>> | null;
  kinesiology_intake_completed_at?: string | null;
  /** Last time the coaching link ended (client or coach). The athlete is solo again. */
  coach_link_ended_at?: string | null;
  /** Presentation preference only. Not an authorization source. */
  entry_intent?: 'solo' | 'find_coach' | 'coach' | null;
  /** Solo trial started by that unlink (14 days). No billing wall until P6. */
  solo_trial_ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type SetType = 'warmup' | 'working' | 'drop' | 'superset' | 'myo' | 'tempo' | 'isometric' | 'cluster';

export interface WeightMeasurement {
  id: string;
  user_id: string;
  weight_kg: number;
  measured_at: string;
  notes: string;
  created_at: string;
}

export interface DailySteps {
  id: string;
  user_id: string;
  steps: number;
  logged_at: string;
  created_at: string;
}

export type AppRole = 'free' | 'premium' | 'admin';

export type CoachingRole = 'none' | 'coach' | 'client';

export interface UserRole {
  user_id: string;
  role: AppRole;
  coaching_role: CoachingRole;
  created_at: string;
  updated_at: string;
}

export type ProgressPhotoKind = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;
  user_id: string;
  taken_at: string;
  kind: ProgressPhotoKind;
  storage_path: string;
  notes: string;
  created_at: string;
}

export interface LiftSetSnapshot {
  weight_kg: number;
  reps: number;
  rir: number;
  completed: boolean;
  set_type?: string;
  duration_seconds?: number | null;
}

/** One completed workout, readable as sets — not a dump of all history. */
export interface LastSessionExercise {
  name: string;
  notes?: string;
  sets: LiftSetSnapshot[];
}

export interface LastSessionView {
  workoutId: string;
  date: string;
  name: string;
  exercises: LastSessionExercise[];
}

/** Viewer role recorded on a telemetry row (public.product_events.role). */
export type ProductEventRole = 'coach' | 'client' | 'solo';

/**
 * Telemetry event names (public.product_events.event). Add here first, then call track().
 * props must stay structural (ids, kinds, booleans, counts) — never names, emails or free text.
 */
export type ProductEventName =
  | 'screen_view'
  | 'account_created'
  | 'intake_completed'
  | 'invite_created'
  | 'invite_accepted'
  | 'coaching_request_accepted'
  | 'marketplace_athlete_confirmed'
  | 'intervention_resolved'
  | 'coach_message_sent'
  | 'client_reply_sent'
  | 'tracking_config_saved'
  | 'nutrition_targets_set'
  | 'fleet_round_run'
  | 'agent_asked'
  | 'program_assigned'
  | 'program_saved'
  | 'program_deleted'
  | 'program_adopted'
  | 'workout_completed'
  | 'checkin_saved'
  | 'solo_review_decided'
  | 'solo_program_accepted'
  | 'solo_program_dismissed'
  | 'solo_program_nl_asked'
  | 'setup_targets_choice';

export type ProductEventProps = Record<string, string | number | boolean | null>;

export interface ProductEventInsert {
  user_id: string;
  role: ProductEventRole;
  event: ProductEventName;
  props: ProductEventProps;
}

/** public.solo_weekly_reviews — the solo copilot's weekly proposal and what the solo did with it. */
export interface SoloWeeklyReviewRow {
  id: string;
  user_id: string;
  week_start: string;
  action: 'keep' | 'relance' | 'calorie_adjustment';
  reason: string;
  proposed: Record<string, number>;
  evidence: Record<string, unknown>;
  decision: 'accepted' | 'kept' | 'dismissed';
  decided_at: string;
  created_at: string;
}

export interface DailyCheckin {
  id: string;
  user_id: string;
  checked_at: string;
  hunger: number | null;
  fatigue: number | null;
  sleep_quality: number | null;
  sleep_hours: number | null;
  stress: number | null;
  motivation: number | null;
  muscle_soreness: number | null;
  joint_pain: number | null;
  adherence_nutrition: number | null;
  adherence_training: number | null;
  energy_level: number | null;
  mood: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Latest recovery fields from a check-in — logged values only, no invented score. */
export interface RecoverySnapshot {
  checkin: DailyCheckin;
  sleepHours: number | null;
  sleepQuality: number | null;
  pain: number | null;
  soreness: number | null;
  energy: number | null;
  hunger: number | null;
  mood: number | null;
  stress: number | null;
  notes: string;
  trend: {
    sleepHours: number[];
    pain: number[];
    energy: number[];
    hunger: number[];
    mood: number[];
    stress: number[];
  };
}

export type DailyCheckinInput = Partial<Omit<DailyCheckin, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & {
  checked_at: string;
};

export interface CheckinSummary {
  latest: DailyCheckin | null;
  previous: DailyCheckin | null;
  globalStatus: 'good' | 'watch' | 'concern' | 'unknown';
  training: number | null;
  recovery: number | null;
  nutrition: number | null;
  motivation: number | null;
  pain: number | null;
  deltas: {
    training: number | null;
    recovery: number | null;
    nutrition: number | null;
    motivation: number | null;
    pain: number | null;
  };
}
