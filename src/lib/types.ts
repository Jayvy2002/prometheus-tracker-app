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
  daily_water_target_ml: number;
  daily_steps_target: number;
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
  kinesiology_intake_completed_at?: string | null;
  /** Last time the coaching link ended (client or coach). The athlete is solo again. */
  coach_link_ended_at?: string | null;
  /** Presentation preference only. Not an authorization source. */
  entry_intent?: 'solo' | 'find_coach' | 'coach' | null;
  /** Solo trial started by that unlink (30 days). No billing wall until that chantier opens. */
  solo_trial_ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  date: string;
  duration_seconds: number;
  notes: string;
  completed: boolean;
  routine_id?: string | null;
  session_started_at?: string | null;
  program_assignment_id?: string | null;
  program_day_id?: string | null;
  exercises?: WorkoutExercise[];
  created_at: string;
  updated_at: string;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  name: string;
  order_index: number;
  notes: string;
  superset_group_id: string | null;
  prescribed_sets?: number | null;
  prescribed_reps?: number | null;
  prescribed_reps_min?: number | null;
  prescribed_rir?: number | null;
  prescribed_rest_seconds?: number | null;
  prescribed_weight_kg?: number | null;
  sets?: WorkoutSet[];
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_type: SetType;
  weight_kg: number;
  reps: number;
  rir: number;
  completed: boolean;
  order_index: number;
  duration_seconds: number | null;
  tempo: string | null;
  cluster_rest_seconds: number | null;
  cluster_reps_per_burst: number | null;
  myo_is_activation: boolean;
  drop_percentage: number | null;
  created_at: string;
}

export type SetType = 'warmup' | 'working' | 'drop' | 'superset' | 'myo' | 'tempo' | 'isometric' | 'cluster';

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description: string;
  scheduled_days?: string[] | null;
  exercises?: RoutineExercise[];
  created_at: string;
  updated_at: string;
}

export interface RoutineExercise {
  id: string;
  routine_id: string;
  name: string;
  default_sets: number;
  default_reps: number;
  default_rest_seconds: number;
  order_index: number;
  notes: string;
  created_at: string;
}

export interface WeightMeasurement {
  id: string;
  user_id: string;
  weight_kg: number;
  measured_at: string;
  notes: string;
  created_at: string;
}

export interface NutritionLog {
  id: string;
  user_id: string;
  food_product_id?: string | null;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: MealCategory;
  quantity: number;
  unit: string;
  logged_at: string;
  created_at: string;
}

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface WaterLog {
  id: string;
  user_id: string;
  amount_ml: number;
  logged_at: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  name_fr: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  category: string;
  equipment: string;
  instructions: string;
  tips: string;
  difficulty: string;
  verified: boolean;
  created_by: string | null;
  created_at: string;
}

export type ExerciseRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected';

export interface ExerciseRequest {
  id: string;
  user_id: string;
  name: string;
  muscles: string;
  description: string;
  status: ExerciseRequestStatus;
  result_exercise_id: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export type FoodDataSource = 'foundation' | 'sr_legacy' | 'fndds' | 'branded' | 'openfoodfacts' | 'user';

export interface FoodProduct {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_size: number;
  serving_unit: string;
  created_by: string | null;
  created_at: string;
  /** Source USDA ou 'user' pour les produits créés par l'utilisateur */
  data_source: FoodDataSource | null;
}

export type ProductRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description: string;
  servings: number;
  calories_per_serving: number;
  protein_per_serving: number;
  carbs_per_serving: number;
  fat_per_serving: number;
  ingredients?: RecipeIngredient[];
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  order_index: number;
  created_at: string;
}

export interface FoodFavorite {
  id: string;
  user_id: string;
  product_id: string | null;
  product_name: string;
  brand: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_size: number;
  serving_unit: string;
  created_at: string;
}

export interface DailySteps {
  id: string;
  user_id: string;
  steps: number;
  logged_at: string;
  created_at: string;
}

export interface ProductRequest {
  id: string;
  user_id: string;
  barcode: string;
  notes: string;
  image_front: string;
  image_back: string;
  image_nutrition: string;
  status: ProductRequestStatus;
  result_product_id: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
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

export interface CoachClientLink {
  id: string;
  coach_id: string;
  client_id: string;
  status: 'active' | 'ended';
  created_at: string;
  updated_at: string;
}

export interface CoachInvite {
  id: string;
  coach_id: string;
  token: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  created_at: string;
}

export interface CoachNote {
  id: string;
  coach_id: string;
  client_id: string;
  note_date: string | null;
  workout_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CoachClientSummary {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  linked_at: string;
  onboarding_completed: boolean;
  goal: string;
  training_frequency: number;
  target_weight_kg: number;
  weight_kg: number;
  last_visited_at: string | null;
  last_nudged_at: string | null;
  daily_calorie_target?: number;
  protein_target?: number;
  carbs_target?: number;
  fat_target?: number;
  /** Any « Oui » on the intake PAR-Q questions (see kinesiologyIntake.MEDICAL_FLAG_IDS). */
  medical_flags?: boolean;
}

export interface ClientTrackingConfig {
  id: string;
  coach_id: string;
  client_id: string;
  track_weight: boolean;
  track_checkins: boolean;
  track_nutrition: boolean;
  track_workouts: boolean;
  workout_focus: string;
  training_vars?: Record<string, boolean> | null;
  nutrition_vars?: Record<string, boolean> | null;
  checkin_vars?: Record<string, boolean> | null;
  setup_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientAlertKind =
  | 'onboarding_incomplete'
  | 'program_unassigned'
  | 'missing_checkin'
  | 'missing_workout_today'
  | 'missing_workout_week'
  | 'missing_weight'
  | 'missing_nutrition';

export interface ClientOpsRow {
  client: CoachClientSummary;
  alerts: ClientAlertKind[];
  hasScheduledTrainingToday: boolean;
  hasProgram: boolean;
  setupCompleted: boolean;
}

export type CoachPrioritySeverity = 'red' | 'orange' | 'yellow';

export type CoachPriorityKind =
  | 'new_pain'
  | 'low_sleep'
  | 'high_stress'
  | 'low_mood'
  | 'high_hunger'
  | 'stalled_lift'
  | 'weight_off_trajectory'
  | 'nutrition_stall'
  | 'dropped_adherence'
  | 'missed_checkin'
  | 'missed_workout'
  | 'missed_nutrition'
  | 'session_logged'
  | 'program_adapt'
  | 'onboarding_incomplete'
  | 'program_unassigned'
  /** A fleet/agent draft waiting for the coach, with no matching local priority. */
  | 'draft_pending';

export type CoachClientTab =
  | 'overview'
  | 'profile'
  | 'training'
  | 'progress'
  | 'checkins'
  | 'health'
  | 'notes';

export type CoachInboxKind = 'checkin' | 'pain' | 'adherence' | 'draft';

export interface CoachPriority {
  id: string;
  clientId: string;
  clientName: string;
  avatarUrl: string;
  kind: CoachPriorityKind;
  severity: CoachPrioritySeverity;
  headlineKey: string;
  headlineParams?: Record<string, string | number>;
  detailKey: string;
  detailParams?: Record<string, string | number>;
  href: string;
  exerciseName?: string;
  checkinId?: string;
  workoutId?: string;
  interventionId?: string;
}

export type CheckinReviewKind = 'unread' | 'new_pain' | 'dropped_adherence' | 'missed_checkin';

/** One row in Aujourd’hui → cuts who stall (calories too high). Always a Progression deep-link. */
export interface NutritionStallRow {
  clientId: string;
  clientName: string;
  avatarUrl: string;
  href: string;
  relanceHref: string;
  draftHref: string | null;
  avgCalories: number;
  calorieTarget: number;
  weightDelta: string;
  title: string;
}

export interface NutritionLogSnapshot {
  user_id: string;
  logged_at: string;
  calories: number;
}

/** One row in Aujourd’hui → Check-ins à relire. Always has a submitted check-in. */
export interface CheckinReviewRow {
  clientId: string;
  clientName: string;
  avatarUrl: string;
  checkin: DailyCheckin;
  href: string;
  kind: CheckinReviewKind;
  relanceHref: string;
}

export type CoachNudgeTemplateKey = 'missed_training' | 'missed_checkins' | 'general_followup';
export type CoachMessageTemplateKey = CoachNudgeTemplateKey | 'reply';

export type CoachQueueActionKind = 'compose' | 'open_draft' | 'open_setup' | 'open_360';

export interface CoachQueueAction {
  kind: CoachQueueActionKind;
  ctaKey: string;
  href?: string;
  templateKey?: CoachNudgeTemplateKey;
  interventionId?: string;
}

/** One File du jour card: a client and every remaining item for them today. */
export interface CoachQueueClientGroup {
  clientId: string;
  clientName: string;
  avatarUrl: string;
  href: string;
  severity: CoachPrioritySeverity;
  items: CoachPriority[];
}

export interface CoachMessage {
  id: string;
  coach_id: string;
  client_id: string;
  sender_id: string;
  body: string;
  template_key: CoachMessageTemplateKey;
  created_at: string;
  read_at: string | null;
}

export interface CoachMessageThread {
  clientId: string;
  lastMessage: CoachMessage | null;
  unreadCount: number;
}

export const DEFAULT_COACH_VISIBLE_TABS: CoachClientTab[] = [
  'overview',
  'training',
  'progress',
  'checkins',
  'health',
  'notes',
];

export interface CoachNudgeTemplateSet {
  missed_training?: { fr?: string; en?: string };
  missed_checkins?: { fr?: string; en?: string };
  general_followup?: { fr?: string; en?: string };
}

export interface CoachTrackingDefaultsJson {
  track_weight?: boolean;
  track_checkins?: boolean;
  track_nutrition?: boolean;
  track_workouts?: boolean;
  workout_focus?: string;
  training?: Record<string, boolean>;
  nutrition?: Record<string, boolean>;
  checkin?: Record<string, boolean>;
  training_vars?: Record<string, boolean>;
  nutrition_vars?: Record<string, boolean>;
  checkin_vars?: Record<string, boolean>;
  setup_completed_at?: string | null;
}

export interface CoachSettings {
  coach_id: string;
  visible_tabs: CoachClientTab[];
  nudge_templates: CoachNudgeTemplateSet;
  default_tracking: CoachTrackingDefaultsJson;
  timezone: string;
  missed_workout_cutoff_hour: number;
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

export interface DailyNutritionPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  target: number;
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
  sets: LiftSetSnapshot[];
}

export interface LastSessionView {
  workoutId: string;
  date: string;
  name: string;
  exercises: LastSessionExercise[];
}

/** Aujourd’hui → séance faite (today / yesterday). Deep-link, not Relancer. */
export interface SessionReviewRow {
  clientId: string;
  clientName: string;
  avatarUrl: string;
  href: string;
  relanceHref: string;
  session: LastSessionView;
}

export interface LiftSessionSnapshot {
  date: string;
  workoutId: string;
  workoutName: string;
  maxWeight: number;
  bestSet: string;
  avgRir: number | null;
  volume: number;
  sets: LiftSetSnapshot[];
}

export interface ClientLiftProgress {
  clientId: string;
  exerciseName: string;
  displayName: string;
  sessions: LiftSessionSnapshot[];
  stalled: boolean;
}

export interface CoachRosterSignals {
  checkins: DailyCheckin[];
  weights: WeightMeasurement[];
  lifts: ClientLiftProgress[];
  nutritionLogs: NutritionLogSnapshot[];
  calorieTargets: Record<string, number>;
  lastNoteAt: Record<string, string>;
  lastInterventionAt: Record<string, string>;
  assignmentStart: Record<string, string>;
  assignmentWeeks: Record<string, number>;
  assignmentName: Record<string, string>;
  scheduledDays: Record<string, number>;
}

export interface CoachCommandStats {
  activeClients: number;
  needAttention: number;
  checkinsToReview: number;
  programsMayAdapt: number;
  important: number;
}

export interface ProgramExerciseDraft {
  name: string;
  default_sets: number;
  default_reps: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds?: number;
  default_weight_kg?: number | null;
}

export interface AiProgramDayDraft {
  weekday: number;
  name: string;
  exercises: ProgramExerciseDraft[];
}

export interface ProgramExercisePatch {
  exercise: string;
  /** I02 : résolution exacte — prioritaire sur le nom dès qu'elle est renseignée. */
  exercise_id?: string | null;
  program_day_id?: string | null;
  weekday?: number | null;
  default_sets?: number;
  default_reps?: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds?: number;
  default_weight_kg?: number | null;
  replace_with?: string;
}

export interface AiPlanDraft {
  program: {
    name: string;
    description: string;
    duration_weeks: number;
    days: AiProgramDayDraft[];
  };
  tracking: {
    track_weight: boolean;
    track_checkins: boolean;
    track_nutrition: boolean;
    track_workouts: boolean;
    workout_focus: string;
    training_vars?: Record<string, boolean>;
    nutrition_vars?: Record<string, boolean>;
    checkin_vars?: Record<string, boolean>;
  };
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    rationale: string;
  };
  recipes?: string[];
}

export type CoachInterventionKind =
  | 'onboarding_plan'
  | 'calorie_adjustment'
  | 'program_adjustment'
  | 'adherence_nutrition'
  | 'adherence_training'
  | 'keep_in_touch'
  | 'other'
  | 'ask_prometheus'
  | 'program_nl_edit';

export type CoachInterventionStatus = 'pending' | 'sent' | 'dismissed' | 'kept';

export interface CoachIntervention {
  id: string;
  coach_id: string;
  client_id: string | null;
  kind: CoachInterventionKind;
  title: string | null;
  rationale: string;
  payload: Record<string, unknown>;
  status: CoachInterventionStatus;
  source: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  /** I05 : valeurs réellement persistées au moment du finalize (snapshot serveur). */
  applied_values?: Record<string, unknown> | null;
}

/** SQL/RPC 14-day aggregate. Fleet rounds never pull raw logs into the LLM. */
export type CoachFleetFlag =
  | 'on_track'
  | 'onboarding'
  | 'ghost'
  | 'adherence_nutrition'
  | 'adherence_training'
  | 'too_fast'
  | 'stall_adherent'
  | 'keep_in_touch';

export interface CoachFleetDossier {
  coach_id: string;
  client_id: string;
  full_name: string;
  goal: string;
  onboarding_completed: boolean;
  has_program: boolean;
  setup_completed: boolean;
  linked_days: number;
  training_frequency: number;
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  weight_kg: number;
  logged_nutrition_days: number;
  avg_calories: number;
  last_nutrition_at: string | null;
  workout_count: number;
  last_workout_at: string | null;
  checkin_count: number;
  last_checkin_at: string | null;
  avg_adherence_nutrition: number | null;
  avg_adherence_training: number | null;
  weight_start_kg: number | null;
  weight_end_kg: number | null;
  weight_delta_kg: number | null;
  /** I03 : dates réelles des pesées extrêmes (ISO) — le rythme se calcule sur la durée vraie. */
  weight_start_at?: string | null;
  weight_end_at?: string | null;
  /** I03 : jours réels entre les deux pesées ; null = tendance inconnue. */
  weight_span_days?: number | null;
  /** I03 : moyenne des cibles journalières effectives sur la fenêtre (historique daté). 0/absent = repli sur calorie_target. */
  avg_effective_target?: number;
  /** I04 : signaux de récupération DÉCLARÉS (0–10), jamais déduits de l'adhérence. */
  avg_fatigue?: number | null;
  avg_sleep_quality?: number | null;
  avg_soreness?: number | null;
  avg_energy?: number | null;
  /**
   * I04 : modules réellement suivis. Absent = tout suivi (solo).
   * Un module désactivé ne déclenche ni reproche ni jugement.
   */
  tracking?: {
    nutrition: boolean;
    workouts: boolean;
    weight: boolean;
    checkins: boolean;
  };
  /** I04 : mineur ou drapeaux médicaux → accompagnement général, jamais d'objectif auto. */
  is_minor?: boolean;
  has_medical_flags?: boolean;
  last_message_at: string | null;
  /** Last outbound coach_messages row (sender_id = coach). Not client replies. */
  last_coach_message_at: string | null;
  /** Last keep_in_touch send/dismiss/keep (handled_at) — one contact Relancer per week. */
  last_keep_in_touch_at: string | null;
  avg_hunger?: number | null;
  avg_mood?: number | null;
  avg_stress?: number | null;
  /** Intake extras.joursDispo as JS weekday ints (0 = Sunday). */
  available_weekdays?: number[] | null;
  /** True if a pending fleet card already exists for this client (refresh in place). */
  pending_fleet: boolean;
  /** Last sent/dismissed/kept fleet (or agent) cards per signal — cooldown after handle. */
  fleet_handled: CoachFleetHandled[];
}

export interface CoachFleetEvidence {
  avg_calories: number;
  logged_nutrition_days: number;
  workout_count: number;
  checkin_count: number;
  weight_delta_kg: number | null;
  last_nutrition_at: string | null;
  last_workout_at: string | null;
  last_checkin_at: string | null;
  /** I03 : cible moyenne effective jugée + durée réelle des pesées + fenêtre. */
  target_avg_kcal?: number;
  weight_span_days?: number | null;
  window_days?: number;
}

export interface CoachFleetHandled {
  kind: string;
  flag: string;
  status: string;
  handled_at: string;
  evidence: CoachFleetEvidence | null;
}

export interface CoachFleetCard {
  flag: CoachFleetFlag;
  kind: CoachInterventionKind;
  title: string;
  observation: string;
  cause: string;
  rationale: string;
  payload: Record<string, unknown>;
}

export interface CoachAiRound {
  id: string;
  coach_id: string | null;
  trigger: 'cron' | 'on_demand';
  started_at: string;
  finished_at: string | null;
  clients_seen: number;
  clients_flagged: number;
  clients_skipped: number;
  model_used: string | null;
  error: string | null;
  payload?: Record<string, unknown>;
}

/** public.coach_agent_lessons — what the coach sent vs what the agent proposed. */
export interface CoachAgentLesson {
  id: string;
  coach_id: string;
  kind: string;
  proposed: Record<string, unknown>;
  accepted: Record<string, unknown>;
  note: string | null;
  intervention_id: string | null;
  /** I05 : true = ignorée par coach-agent (désactivée par le coach). */
  disabled?: boolean;
  created_at: string;
}

export interface CoachPreview {
  id: string;
  full_name: string;
  avatar_url: string;
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
  | 'intervention_resolved'
  | 'coach_message_sent'
  | 'client_reply_sent'
  | 'tracking_config_saved'
  | 'nutrition_targets_set'
  | 'fleet_round_run'
  | 'agent_asked'
  | 'program_assigned'
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

export interface Program {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  duration_weeks: number;
  days?: ProgramDay[];
  created_at: string;
  updated_at: string;
}

export interface ProgramDay {
  id: string;
  program_id: string;
  weekday: number;
  name: string;
  routine_id: string | null;
  order_index: number;
  exercises?: ProgramDayExercise[];
  created_at: string;
}

export interface ProgramDayExercise {
  id: string;
  program_day_id: string;
  name: string;
  default_sets: number;
  default_reps: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds: number;
  default_weight_kg?: number | null;
  order_index: number;
  created_at: string;
}

export interface ProgramAssignment {
  id: string;
  program_id: string;
  client_id: string;
  assigned_by: string;
  start_date: string;
  status: 'active' | 'completed' | 'paused';
  program?: Program;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateExercise {
  name: string;
  default_sets: number;
  default_reps: number;
  default_reps_min?: number | null;
  default_rir?: number | null;
  default_rest_seconds?: number;
  default_weight_kg?: number | null;
  order_index: number;
}

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
