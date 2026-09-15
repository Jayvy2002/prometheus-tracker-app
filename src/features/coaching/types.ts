/** Contrats coaching / file / interventions / fleet — lot 22a. */
import type { DailyCheckin, LastSessionView, LiftSetSnapshot, WeightMeasurement } from '../../shared/types';

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
  /** ISO date/time of the last relevant signal (session, check-in, link). */
  sinceIso?: string | null;
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
