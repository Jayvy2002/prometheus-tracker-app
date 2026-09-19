/** P2.1 persistent athlete signals — longitudinal hypotheses, not a proposal inbox. */

export const ATHLETE_SIGNAL_DOMAINS = [
  'training',
  'nutrition',
  'recovery',
  'weight',
  'goal',
  'adherence',
] as const;

export type AthleteSignalDomain = (typeof ATHLETE_SIGNAL_DOMAINS)[number];

export const ATHLETE_SIGNAL_STATUSES = [
  'open',
  'waiting',
  'resolved',
  'not_relevant',
] as const;

export type AthleteSignalStatus = (typeof ATHLETE_SIGNAL_STATUSES)[number];

export const ATHLETE_SIGNAL_CONFIDENCE = ['low', 'medium', 'high'] as const;

export type AthleteSignalConfidence = (typeof ATHLETE_SIGNAL_CONFIDENCE)[number];

export const ATHLETE_SIGNAL_OPEN_STATUSES = ['open', 'waiting'] as const;

export type AthleteSignalOpenStatus = (typeof ATHLETE_SIGNAL_OPEN_STATUSES)[number];

export const ATHLETE_SIGNAL_CLOSED_STATUSES = ['resolved', 'not_relevant'] as const;

export type AthleteSignalClosedStatus = (typeof ATHLETE_SIGNAL_CLOSED_STATUSES)[number];

export interface AthleteSignalEvidenceItem {
  kind: string;
  summary: string;
  at?: string;
}

export interface AthleteSignal {
  id: string;
  athlete_id: string;
  domain: AthleteSignalDomain;
  type: string;
  hypothesis: string;
  evidence_for: AthleteSignalEvidenceItem[];
  evidence_against: AthleteSignalEvidenceItem[];
  confidence: AthleteSignalConfidence;
  status: AthleteSignalStatus;
  first_seen_at: string;
  last_seen_at: string;
  next_review_at: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** P2.2 universal weekly review — one ISO week, wait is a valid result. */

export const WEEKLY_REVIEW_DECISIONS = ['wait', 'request_info', 'propose', 'close'] as const;

export type WeeklyReviewDecision = (typeof WEEKLY_REVIEW_DECISIONS)[number];

export const WEEKLY_REVIEW_AUTHORITIES = ['athlete', 'coach'] as const;

export type WeeklyReviewAuthority = (typeof WEEKLY_REVIEW_AUTHORITIES)[number];

export const WEEKLY_REVIEW_DATA_QUALITIES = ['insufficient', 'sparse', 'adequate'] as const;

export type WeeklyReviewDataQuality = (typeof WEEKLY_REVIEW_DATA_QUALITIES)[number];

export interface WeeklyReviewTracking {
  nutrition: boolean;
  workouts: boolean;
  weight: boolean;
  checkins: boolean;
}

export interface WeeklyReviewAggregates {
  windowStart: string;
  windowEnd: string;
  loggedNutritionDays: number;
  avgCalories: number;
  calorieTarget: number;
  workoutCount: number;
  expectedWorkouts: number;
  weighIns: number;
  weightDeltaKg: number | null;
  weightStartKg: number | null;
  weightSpanDays: number | null;
  checkinCount: number;
  avgFatigue: number | null;
  avgEnergy: number | null;
  goal: string;
  proteinTarget?: number;
  carbsTarget?: number;
  fatTarget?: number;
  weightKg?: number;
  weightEndKg?: number | null;
}

export interface AthleteWeeklyReview {
  id: string;
  athlete_id: string;
  week_start: string;
  authority: WeeklyReviewAuthority;
  data_quality: WeeklyReviewDataQuality;
  decision: WeeklyReviewDecision;
  summary: string;
  aggregates: Record<string, unknown>;
  tracking: WeeklyReviewTracking;
  signal_actions: unknown[];
  created_at: string;
  updated_at: string;
}

/** P2.3 human decision journal — Vision §8.6 / P2.4 §8.5. Append-only. Never auto-applies. */

export const ATHLETE_HUMAN_DECISIONS = ['accepted', 'modified', 'refused', 'ignored', 'corrected'] as const;

export type AthleteHumanDecision = (typeof ATHLETE_HUMAN_DECISIONS)[number];

export const ATHLETE_DECISION_ACTOR_ROLES = ['athlete', 'coach'] as const;

export type AthleteDecisionActorRole = (typeof ATHLETE_DECISION_ACTOR_ROLES)[number];

export interface AthleteDecisionLog {
  id: string;
  athlete_id: string;
  actor_id: string | null;
  actor_role: AthleteDecisionActorRole;
  domain: AthleteSignalDomain;
  type: string;
  decision: AthleteHumanDecision;
  proposal: Record<string, unknown>;
  why: string;
  data_used: Record<string, unknown>;
  human_reason: string | null;
  applied_effect: Record<string, unknown>;
  source: string | null;
  source_id: string | null;
  created_at: string;
}
