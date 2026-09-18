/**
 * P2.2 — universal weekly review (docs/VISION.md §8.2–8.4).
 * Same loop for Solo and Coach fleet: authorized aggregates → data quality →
 * athlete_signals → wait | request_info | propose | close.
 * A week without modification is valid. Weak signals wait. Nothing is auto-applied.
 */

import type {
  AthleteSignal,
  AthleteSignalConfidence,
  AthleteSignalDomain,
  AthleteSignalEvidenceItem,
  AthleteSignalOpenStatus,
  WeeklyReviewAggregates,
  WeeklyReviewAuthority,
  WeeklyReviewDataQuality,
  WeeklyReviewDecision,
  WeeklyReviewTracking,
} from '../types';
import { isOpenAthleteSignalStatus } from './athleteSignals';

/** Same 14-date window as the fleet / Solo copilot (I03). */
export const WEEKLY_REVIEW_WINDOW_DAYS = 14;
const MIN_NUTRITION_LOG_DAYS = 4;
const MIN_WEIGH_INS = 2;
const OVEREAT_RATIO = 1.15;
const UNDER_EAT_RATIO = 0.85;
const CUT_STALL_MIN_DELTA_KG = -0.2;
const CUT_TOO_FAST_PCT_PER_WEEK = 1.5;
const BULK_TOO_FAST_PCT_PER_WEEK = 0.7;
const FATIGUE_DECLARED_MIN = 7;
const ENERGY_DECLARED_MAX = 3;

export interface WeeklyReviewInput {
  athleteId: string;
  today: string;
  identity: 'solo' | 'coached';
  tracking: WeeklyReviewTracking;
  aggregates: WeeklyReviewAggregates;
  existingSignals: AthleteSignal[];
  guarded?: boolean;
}

export interface WeeklyReviewSignalAction {
  op: 'upsert' | 'resolve';
  domain?: AthleteSignalDomain;
  type?: string;
  hypothesis?: string;
  evidenceFor?: AthleteSignalEvidenceItem[];
  evidenceAgainst?: AthleteSignalEvidenceItem[];
  confidence?: AthleteSignalConfidence;
  status?: AthleteSignalOpenStatus | 'resolved' | 'not_relevant';
  reason?: string;
  id?: string;
  nextReviewAt?: string | null;
}

export interface WeeklyReviewResult {
  weekStart: string;
  authority: WeeklyReviewAuthority;
  dataQuality: WeeklyReviewDataQuality;
  decision: WeeklyReviewDecision;
  summary: string;
  signalActions: WeeklyReviewSignalAction[];
  aggregates: WeeklyReviewAggregates;
  tracking: WeeklyReviewTracking;
}

/** Structural fleet dossier — avoids importing coachFleet (circular). */
export interface WeeklyReviewFleetLike {
  client_id: string;
  goal: string;
  training_frequency: number;
  calorie_target: number;
  avg_effective_target?: number;
  logged_nutrition_days: number;
  avg_calories: number;
  workout_count: number;
  checkin_count: number;
  weight_delta_kg: number | null;
  weight_start_kg?: number | null;
  weight_end_kg?: number | null;
  weight_kg: number;
  weight_span_days?: number | null;
  avg_fatigue?: number | null;
  avg_energy?: number | null;
  tracking?: WeeklyReviewTracking;
  is_minor?: boolean;
  has_medical_flags?: boolean;
}

export interface WeeklyReviewSoloLike {
  today: string;
  goal: string;
  calorieTarget: number;
  trainingFrequency: number;
  isMinor?: boolean;
  hasMedicalFlags?: boolean;
  tracking?: WeeklyReviewTracking;
}

export interface WeeklyReviewSoloEvidenceLike {
  windowStart: string;
  windowEnd: string;
  loggedDays: number;
  avgCalories: number;
  targetAvg: number;
  weighIns: number;
  weightStart: number | null;
  deltaKg: number | null;
  weightSpanDays: number | null;
  workouts: number;
  expectedWorkouts: number;
  avgFatigue: number | null;
  avgEnergy: number | null;
}

const ALL_TRACKING: WeeklyReviewTracking = {
  nutrition: true,
  workouts: true,
  weight: true,
  checkins: true,
};

export function isoWeekStart(today: string): string {
  const ms = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(ms)) return today;
  const day = new Date(ms).getUTCDay();
  const back = (day + 6) % 7;
  const start = new Date(ms);
  start.setUTCDate(start.getUTCDate() - back);
  return start.toISOString().slice(0, 10);
}

export function addUtcDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function trackingOf(input: WeeklyReviewTracking | undefined): WeeklyReviewTracking {
  if (!input) return { ...ALL_TRACKING };
  return {
    nutrition: input.nutrition !== false,
    workouts: input.workouts !== false,
    weight: input.weight !== false,
    checkins: input.checkins !== false,
  };
}

function normalizeGoal(goal: string): 'cut' | 'bulk' | 'maintain' | '' {
  const g = goal.trim().toLowerCase();
  if (g === 'cut' || g === 'lose' || g === 'fat_loss' || g === 'weight_loss') return 'cut';
  if (g === 'bulk' || g === 'gain' || g === 'muscle') return 'bulk';
  if (g === 'maintain' || g === 'recomp') return 'maintain';
  return '';
}

function overeatRatio(avgCalories: number, calorieTarget: number): number {
  if (calorieTarget <= 0 || avgCalories <= 0) return 0;
  return avgCalories / calorieTarget;
}

function weeklyWeightPct(
  deltaKg: number | null,
  startKg: number | null,
  spanDays: number | null,
): number | null {
  if (deltaKg == null || startKg == null || startKg <= 0) return null;
  const span = spanDays ?? WEEKLY_REVIEW_WINDOW_DAYS;
  if (!Number.isFinite(span) || span < 1) return null;
  return (deltaKg / startKg) * 100 / (span / 7);
}

function bumpConfidence(prev: AthleteSignalConfidence | null, supported: boolean): AthleteSignalConfidence {
  if (!supported) return prev ?? 'low';
  if (!prev || prev === 'low') return prev ? 'medium' : 'low';
  if (prev === 'medium') return 'high';
  return 'high';
}

function findOpen(
  signals: AthleteSignal[],
  domain: AthleteSignalDomain,
  type: string,
): AthleteSignal | null {
  return signals.find((row) => (
    row.domain === domain
    && row.type === type
    && isOpenAthleteSignalStatus(row.status)
  )) ?? null;
}

function evidence(kind: string, summary: string): AthleteSignalEvidenceItem {
  return { kind, summary };
}

function evaluateQuality(
  tracking: WeeklyReviewTracking,
  agg: WeeklyReviewAggregates,
): WeeklyReviewDataQuality {
  const judged: Array<{ on: boolean; hasAny: boolean; sparse: boolean }> = [
    {
      on: tracking.nutrition,
      hasAny: agg.loggedNutritionDays > 0,
      sparse: agg.loggedNutritionDays > 0 && agg.loggedNutritionDays < MIN_NUTRITION_LOG_DAYS,
    },
    {
      on: tracking.workouts,
      hasAny: agg.workoutCount > 0,
      sparse: false,
    },
    {
      on: tracking.weight,
      hasAny: agg.weighIns > 0,
      sparse: agg.weighIns > 0 && agg.weighIns < MIN_WEIGH_INS,
    },
  ];
  const enabled = judged.filter((row) => row.on);
  if (enabled.length === 0) {
    return tracking.checkins && agg.checkinCount > 0 ? 'adequate' : 'insufficient';
  }
  if (enabled.every((row) => !row.hasAny)) return 'insufficient';
  if (enabled.some((row) => row.sparse || !row.hasAny)) return 'sparse';
  return 'adequate';
}

interface Candidate {
  domain: AthleteSignalDomain;
  type: string;
  hypothesis: string;
  for: AthleteSignalEvidenceItem[];
  against: AthleteSignalEvidenceItem[];
  supported: boolean;
  waiting: boolean;
  proposeWorthy: boolean;
}

function collectCandidates(input: WeeklyReviewInput): Candidate[] {
  const { tracking, aggregates: agg } = input;
  const out: Candidate[] = [];
  const goal = normalizeGoal(agg.goal);
  const span = agg.weightSpanDays ?? WEEKLY_REVIEW_WINDOW_DAYS;
  const pct = weeklyWeightPct(agg.weightDeltaKg, agg.weightStartKg, span);
  const ratio = overeatRatio(agg.avgCalories, agg.calorieTarget);

  if (tracking.nutrition && agg.loggedNutritionDays > 0 && agg.loggedNutritionDays < MIN_NUTRITION_LOG_DAYS) {
    out.push({
      domain: 'adherence',
      type: 'sparse_nutrition',
      hypothesis: 'Pas assez de jours nutrition loggés pour juger la semaine',
      for: [evidence('nutrition', `${agg.loggedNutritionDays} jour(s) loggés / ${MIN_NUTRITION_LOG_DAYS} requis`)],
      against: [],
      supported: true,
      waiting: true,
      proposeWorthy: false,
    });
  }

  if (
    tracking.nutrition
    && agg.loggedNutritionDays >= MIN_NUTRITION_LOG_DAYS
    && agg.calorieTarget > 0
    && (ratio >= OVEREAT_RATIO || (ratio > 0 && ratio <= UNDER_EAT_RATIO))
  ) {
    const side = ratio >= OVEREAT_RATIO ? 'au-dessus' : 'en-dessous';
    out.push({
      domain: 'nutrition',
      type: 'not_following',
      hypothesis: `Apports souvent ${side} de la cible effective`,
      for: [evidence('nutrition', `moyenne ${agg.avgCalories} kcal vs cible ${agg.calorieTarget}`)],
      against: [],
      supported: true,
      waiting: false,
      proposeWorthy: true,
    });
  }

  if (tracking.workouts && agg.expectedWorkouts > 0) {
    const missed = agg.workoutCount <= Math.max(0, Math.floor(agg.expectedWorkouts * 0.4));
    if (missed) {
      out.push({
        domain: 'training',
        type: 'missed_sessions',
        hypothesis: 'Moins de séances loggées que prévu sur la fenêtre',
        for: [evidence('workouts', `${agg.workoutCount} séance(s) / ${agg.expectedWorkouts} attendues`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    }
  }

  if (tracking.weight && agg.weighIns >= MIN_WEIGH_INS && agg.weightDeltaKg != null) {
    const tooFast = (goal === 'cut' && pct != null && pct <= -CUT_TOO_FAST_PCT_PER_WEEK)
      || (goal === 'bulk' && pct != null && pct >= BULK_TOO_FAST_PCT_PER_WEEK);
    const stall = (goal === 'cut' && agg.weightDeltaKg >= CUT_STALL_MIN_DELTA_KG)
      || (goal === 'bulk' && agg.weightDeltaKg <= 0.1)
      || (goal === 'maintain' && Math.abs(agg.weightDeltaKg) >= 1.5);
    if (tooFast) {
      out.push({
        domain: 'weight',
        type: 'too_fast',
        hypothesis: 'Trajectoire de poids trop rapide pour l’objectif',
        for: [evidence('weight', `delta ${agg.weightDeltaKg} kg`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    } else if (stall) {
      out.push({
        domain: 'weight',
        type: 'stall',
        hypothesis: 'Trajectoire de poids éloignée de l’objectif',
        for: [evidence('weight', `delta ${agg.weightDeltaKg} kg`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    }
  }

  if (tracking.checkins) {
    const fatigue = agg.avgFatigue != null && agg.avgFatigue >= FATIGUE_DECLARED_MIN;
    const lowEnergy = agg.avgEnergy != null && agg.avgEnergy <= ENERGY_DECLARED_MAX;
    if (fatigue || lowEnergy) {
      out.push({
        domain: 'recovery',
        type: 'fatigue',
        hypothesis: 'Fatigue ou énergie basse déclarée en check-in',
        for: [evidence('checkins', `fatigue ${agg.avgFatigue ?? 'n/a'} / énergie ${agg.avgEnergy ?? 'n/a'}`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    }
  }

  return out;
}

function summaryFor(
  authority: WeeklyReviewAuthority,
  decision: WeeklyReviewDecision,
  dataQuality: WeeklyReviewDataQuality,
): string {
  if (authority === 'coach') {
    if (decision === 'wait') {
      return dataQuality === 'adequate'
        ? 'Aucun changement à proposer pour l’athlète cette semaine.'
        : 'Signal trop faible : attendre davantage de données. Rien n’a été appliqué.';
    }
    if (decision === 'request_info') {
      return 'Demander plus de données suivies avant de proposer un changement.';
    }
    if (decision === 'propose') {
      return 'Une proposition est prête à valider. Rien n’a été appliqué.';
    }
    return 'Un signal du dossier n’est plus soutenu ; clôturé. Rien n’a été appliqué.';
  }
  if (decision === 'wait') {
    return dataQuality === 'adequate'
      ? 'Cette semaine, aucune modification n’est nécessaire.'
      : 'Le signal est encore trop faible : Prometheus attend. Rien n’a été appliqué.';
  }
  if (decision === 'request_info') {
    return 'Il manque encore des données suivies pour juger cette semaine.';
  }
  if (decision === 'propose') {
    return 'Une piste est prête à examiner. Rien n’a été appliqué.';
  }
  return 'Un signal n’est plus soutenu par les données de la semaine.';
}

export function weeklyReviewInputFromFleet(
  dossier: WeeklyReviewFleetLike,
  today: string,
  existingSignals: AthleteSignal[] = [],
): WeeklyReviewInput {
  const tracking = trackingOf(dossier.tracking);
  const target = dossier.avg_effective_target && dossier.avg_effective_target > 0
    ? Math.round(dossier.avg_effective_target)
    : Math.round(dossier.calorie_target);
  const freq = dossier.training_frequency > 0 ? dossier.training_frequency : 3;
  const expectedWorkouts = Math.round(freq * (WEEKLY_REVIEW_WINDOW_DAYS / 7));
  const hasWeightPair = dossier.weight_delta_kg != null
    || (dossier.weight_start_kg != null && (dossier.weight_end_kg != null || dossier.weight_kg > 0));
  return {
    athleteId: dossier.client_id,
    today,
    identity: 'coached',
    tracking,
    guarded: dossier.is_minor === true || dossier.has_medical_flags === true,
    existingSignals,
    aggregates: {
      windowStart: addUtcDays(today, -(WEEKLY_REVIEW_WINDOW_DAYS - 1)),
      windowEnd: today,
      loggedNutritionDays: dossier.logged_nutrition_days,
      avgCalories: Math.round(dossier.avg_calories),
      calorieTarget: target,
      workoutCount: dossier.workout_count,
      expectedWorkouts,
      weighIns: hasWeightPair ? MIN_WEIGH_INS : 0,
      weightDeltaKg: dossier.weight_delta_kg,
      weightStartKg: dossier.weight_start_kg ?? dossier.weight_kg,
      weightSpanDays: dossier.weight_span_days ?? WEEKLY_REVIEW_WINDOW_DAYS,
      checkinCount: dossier.checkin_count,
      avgFatigue: dossier.avg_fatigue ?? null,
      avgEnergy: dossier.avg_energy ?? null,
      goal: dossier.goal,
    },
  };
}

export function weeklyReviewInputFromSolo(
  inputs: WeeklyReviewSoloLike,
  evidence: WeeklyReviewSoloEvidenceLike,
  existingSignals: AthleteSignal[] = [],
  athleteId = 'self',
): WeeklyReviewInput {
  return {
    athleteId,
    today: inputs.today,
    identity: 'solo',
    tracking: trackingOf(inputs.tracking),
    guarded: inputs.isMinor === true || inputs.hasMedicalFlags === true,
    existingSignals,
    aggregates: {
      windowStart: evidence.windowStart,
      windowEnd: evidence.windowEnd,
      loggedNutritionDays: evidence.loggedDays,
      avgCalories: evidence.avgCalories,
      calorieTarget: evidence.targetAvg || inputs.calorieTarget,
      workoutCount: evidence.workouts,
      expectedWorkouts: evidence.expectedWorkouts,
      weighIns: evidence.weighIns,
      weightDeltaKg: evidence.deltaKg,
      weightStartKg: evidence.weightStart,
      weightSpanDays: evidence.weightSpanDays,
      checkinCount: 0,
      avgFatigue: evidence.avgFatigue,
      avgEnergy: evidence.avgEnergy,
      goal: inputs.goal,
    },
  };
}

export function runAthleteWeeklyReview(input: WeeklyReviewInput): WeeklyReviewResult {
  const tracking = trackingOf(input.tracking);
  const weekStart = isoWeekStart(input.today);
  const nextReviewAt = `${addUtcDays(weekStart, 7)}T00:00:00.000Z`;
  const authority: WeeklyReviewAuthority = input.identity === 'coached' ? 'coach' : 'athlete';
  const dataQuality = evaluateQuality(tracking, input.aggregates);
  const candidates = collectCandidates({ ...input, tracking });
  const watched = new Set(candidates.map((row) => `${row.domain}:${row.type}`));
  const actions: WeeklyReviewSignalAction[] = [];
  let closed = 0;
  let upsertedWaiting = 0;
  let upsertedOpen = 0;
  let proposeWorthyOpen = 0;

  for (const candidate of candidates) {
    const prev = findOpen(input.existingSignals, candidate.domain, candidate.type);
    const confidence = bumpConfidence(prev?.confidence ?? null, candidate.supported);
    const status: AthleteSignalOpenStatus = candidate.waiting ? 'waiting' : 'open';
    if (status === 'waiting') upsertedWaiting += 1;
    else upsertedOpen += 1;
    if (candidate.proposeWorthy && status === 'open' && (confidence === 'medium' || confidence === 'high')) {
      proposeWorthyOpen += 1;
    }
    actions.push({
      op: 'upsert',
      domain: candidate.domain,
      type: candidate.type,
      hypothesis: candidate.hypothesis,
      evidenceFor: candidate.for,
      evidenceAgainst: candidate.against,
      confidence,
      status,
      nextReviewAt,
    });
  }

  for (const signal of input.existingSignals) {
    if (!isOpenAthleteSignalStatus(signal.status)) continue;
    if (watched.has(`${signal.domain}:${signal.type}`)) continue;
    actions.push({
      op: 'resolve',
      id: signal.id,
      status: 'resolved',
      reason: 'Plus soutenu par les agrégats de la semaine',
    });
    closed += 1;
  }

  let decision: WeeklyReviewDecision;
  if (dataQuality === 'insufficient' || (dataQuality === 'sparse' && proposeWorthyOpen === 0)) {
    decision = 'request_info';
  } else if (input.guarded) {
    decision = closed > 0 && proposeWorthyOpen === 0 ? 'close' : 'wait';
  } else if (proposeWorthyOpen > 0) {
    decision = 'propose';
  } else if (closed > 0 && upsertedOpen === 0 && upsertedWaiting === 0) {
    decision = 'close';
  } else {
    decision = 'wait';
  }

  return {
    weekStart,
    authority,
    dataQuality,
    decision,
    summary: summaryFor(authority, decision, dataQuality),
    signalActions: actions,
    aggregates: input.aggregates,
    tracking,
  };
}

export function weeklyReviewActionsToRpcPayload(actions: WeeklyReviewSignalAction[]): unknown[] {
  return actions.map((action) => {
    if (action.op === 'resolve') {
      return {
        op: 'resolve',
        id: action.id,
        status: action.status,
        reason: action.reason ?? null,
      };
    }
    return {
      op: 'upsert',
      domain: action.domain,
      type: action.type,
      hypothesis: action.hypothesis,
      evidence_for: action.evidenceFor ?? [],
      evidence_against: action.evidenceAgainst ?? [],
      confidence: action.confidence ?? 'low',
      status: action.status ?? 'open',
      next_review_at: action.nextReviewAt ?? null,
    };
  });
}
