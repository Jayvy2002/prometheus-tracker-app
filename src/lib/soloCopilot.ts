import {
  FLEET_WINDOW_DAYS,
  UNDER_EAT_RATIO,
  overeatRatio,
  proposeWeeklyNutrition,
  weeklyWeightPct,
  type WeeklyNutritionProposal,
} from './coachFleet';
import { MIN_NUTRITION_LOG_DAYS, OVEREAT_RATIO } from './coachNutrition';
import { addDaysToDateStr } from './utils';
import type { CoachFleetDossier } from './types';

/**
 * Solo copilot — weekly kcal / macros review (docs/VISION.md, points 6 and 7).
 * Same data-driven rules as the coach fleet (`proposeWeeklyNutrition`), fed by the solo's own
 * logs. The copilot proposes and explains; the solo accepts or keeps. Nothing is auto-applied.
 */

export const SOLO_REVIEW_WINDOW_DAYS = FLEET_WINDOW_DAYS;
/** A start and an end weigh-in in the window — below that, no trajectory to judge. */
export const SOLO_MIN_WEIGH_INS = 2;

export interface SoloReviewInputs {
  today: string;
  goal: string;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  weightKg: number;
  trainingFrequency: number;
  nutritionLogs: Array<{ logged_at: string; calories: number }>;
  weights: Array<{ measured_at: string; weight_kg: number }>;
  workouts?: Array<{ date: string; completed: boolean }>;
  checkins?: Array<{ checked_at: string }>;
}

export interface SoloReviewEvidence {
  windowStart: string;
  windowEnd: string;
  loggedDays: number;
  avgCalories: number;
  /** avg / target; 0 when either is missing. */
  ratio: number;
  weighIns: number;
  weightStart: number | null;
  weightEnd: number | null;
  deltaKg: number | null;
  pctPerWeek: number | null;
  workouts: number;
  expectedWorkouts: number;
  followingPlan: boolean;
}

export type SoloRelanceDetail = 'few_logs' | 'over_target' | 'under_target';

export interface SoloWeeklyReview {
  weekStart: string;
  status: 'insufficient' | 'ready';
  /** The target the proposal starts from (profile.daily_calorie_target). */
  currentCalories: number;
  proposal: WeeklyNutritionProposal;
  evidence: SoloReviewEvidence;
  relanceDetail: SoloRelanceDetail | null;
}

export type SoloReviewDecision = 'accepted' | 'kept' | 'dismissed';

/** ISO Monday of the week containing `today` (YYYY-MM-DD). One review per week. */
export function soloReviewWeekStart(today: string): string {
  const ms = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(ms)) return today;
  const day = new Date(ms).getUTCDay();
  const back = (day + 6) % 7;
  return addDaysToDateStr(today, -back);
}

function inWindow(date: string, start: string, end: string): boolean {
  const d = date.slice(0, 10);
  return d >= start && d <= end;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildSoloEvidence(inputs: SoloReviewInputs): SoloReviewEvidence {
  const windowEnd = inputs.today;
  const windowStart = addDaysToDateStr(inputs.today, -SOLO_REVIEW_WINDOW_DAYS);

  const byDay = new Map<string, number>();
  for (const log of inputs.nutritionLogs) {
    const day = log.logged_at.slice(0, 10);
    if (!inWindow(day, windowStart, windowEnd)) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + (Number(log.calories) || 0));
  }
  const loggedDays = byDay.size;
  const avgCalories = loggedDays > 0
    ? Math.round([...byDay.values()].reduce((s, v) => s + v, 0) / loggedDays)
    : 0;
  const ratio = overeatRatio(avgCalories, inputs.calorieTarget);

  const weights = inputs.weights
    .filter(w => inWindow(w.measured_at, windowStart, windowEnd) && Number.isFinite(w.weight_kg) && w.weight_kg > 0)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const weightStart = weights.length ? weights[0].weight_kg : null;
  const weightEnd = weights.length ? weights[weights.length - 1].weight_kg : null;
  const deltaKg = weightStart != null && weightEnd != null && weights.length >= SOLO_MIN_WEIGH_INS
    ? round1(weightEnd - weightStart)
    : null;
  const pctPerWeek = weeklyWeightPct(deltaKg, weightStart ?? inputs.weightKg);

  const workouts = (inputs.workouts ?? []).filter(w => w.completed && inWindow(w.date, windowStart, windowEnd)).length;
  const freq = inputs.trainingFrequency > 0 ? inputs.trainingFrequency : 3;
  const expectedWorkouts = Math.round(freq * (SOLO_REVIEW_WINDOW_DAYS / 7));

  const followingPlan = inputs.calorieTarget > 0
    && loggedDays >= MIN_NUTRITION_LOG_DAYS
    && ratio > UNDER_EAT_RATIO
    && ratio < OVEREAT_RATIO;

  return {
    windowStart,
    windowEnd,
    loggedDays,
    avgCalories,
    ratio,
    weighIns: weights.length,
    weightStart,
    weightEnd,
    deltaKg,
    pctPerWeek: pctPerWeek == null ? null : Math.round(pctPerWeek * 100) / 100,
    workouts,
    expectedWorkouts,
    followingPlan,
  };
}

/** The solo is his own coach: a fleet dossier built from his own logs so the fleet rules apply verbatim. */
export function buildSoloDossier(inputs: SoloReviewInputs, evidence: SoloReviewEvidence): CoachFleetDossier {
  return {
    coach_id: 'self',
    client_id: 'self',
    full_name: '',
    goal: inputs.goal,
    onboarding_completed: true,
    has_program: false,
    setup_completed: true,
    linked_days: SOLO_REVIEW_WINDOW_DAYS,
    training_frequency: inputs.trainingFrequency,
    calorie_target: inputs.calorieTarget,
    protein_target: inputs.proteinTarget,
    carbs_target: inputs.carbsTarget,
    fat_target: inputs.fatTarget,
    weight_kg: evidence.weightEnd ?? inputs.weightKg,
    logged_nutrition_days: evidence.loggedDays,
    avg_calories: evidence.avgCalories,
    last_nutrition_at: null,
    workout_count: evidence.workouts,
    last_workout_at: null,
    checkin_count: (inputs.checkins ?? []).filter(c => inWindow(c.checked_at, evidence.windowStart, evidence.windowEnd)).length,
    last_checkin_at: (() => {
      const days = (inputs.checkins ?? [])
        .filter(c => inWindow(c.checked_at, evidence.windowStart, evidence.windowEnd))
        .map(c => c.checked_at.slice(0, 10))
        .sort();
      return days[days.length - 1] ?? null;
    })(),
    avg_adherence_nutrition: null,
    avg_adherence_training: null,
    weight_start_kg: evidence.weightStart,
    weight_end_kg: evidence.weightEnd,
    weight_delta_kg: evidence.deltaKg,
    last_message_at: null,
    last_coach_message_at: null,
    last_keep_in_touch_at: null,
    pending_fleet: false,
    fleet_handled: [],
  };
}

function relanceDetail(evidence: SoloReviewEvidence): SoloRelanceDetail {
  if (evidence.loggedDays < MIN_NUTRITION_LOG_DAYS) return 'few_logs';
  if (evidence.ratio >= OVEREAT_RATIO) return 'over_target';
  return 'under_target';
}

export function computeSoloWeeklyReview(inputs: SoloReviewInputs): SoloWeeklyReview {
  const evidence = buildSoloEvidence(inputs);
  const weekStart = soloReviewWeekStart(inputs.today);
  const currentCalories = Math.round(inputs.calorieTarget) || 0;
  if (inputs.calorieTarget <= 0 || evidence.weighIns < SOLO_MIN_WEIGH_INS) {
    return {
      weekStart,
      status: 'insufficient',
      currentCalories,
      proposal: { action: 'keep', reason: 'keep', draft: null },
      evidence,
      relanceDetail: null,
    };
  }
  const proposal = proposeWeeklyNutrition(buildSoloDossier(inputs, evidence));
  return {
    weekStart,
    status: 'ready',
    currentCalories,
    proposal,
    evidence,
    relanceDetail: proposal.action === 'relance' ? relanceDetail(evidence) : null,
  };
}

/** i18n key of the sentence the copilot shows — the « why », never a bare number. */
export function soloReviewMessageKey(review: SoloWeeklyReview): string {
  if (review.status === 'insufficient') return 'soloReview.insufficient';
  const { proposal } = review;
  if (proposal.action === 'relance') return `soloReview.relance.${review.relanceDetail ?? 'few_logs'}`;
  if (proposal.action === 'keep') return 'soloReview.keep';
  return `soloReview.adjust.${proposal.reason}`;
}

/** Has any signal at all? Below this the card stays silent instead of nagging an empty account. */
export function soloReviewHasAnyData(evidence: SoloReviewEvidence): boolean {
  return evidence.loggedDays > 0 || evidence.weighIns > 0;
}
