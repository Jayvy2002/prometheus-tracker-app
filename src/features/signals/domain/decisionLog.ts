/**
 * P2.3 — human decision journal (docs/VISION.md §8.6).
 * Stores proposal, why, data used, who decided, accepted/modified/refused/ignored.
 * A refusal/ignored suppresses the same (domain, type) until evidence moves.
 * Never auto-applies programs or targets.
 */

import {
  ATHLETE_DECISION_ACTOR_ROLES,
  ATHLETE_HUMAN_DECISIONS,
  ATHLETE_SIGNAL_DOMAINS,
  type AthleteDecisionLog,
  type AthleteHumanDecision,
  type AthleteSignalDomain,
  type WeeklyReviewAggregates,
} from '../types';
import { canMutateAthleteSignal } from './athleteSignals';

export {
  ATHLETE_DECISION_ACTOR_ROLES,
  ATHLETE_HUMAN_DECISIONS,
};

/** Same movement thresholds as the fleet snapshot (`fleetEvidenceChanged`). */
export const DECISION_EVIDENCE_KCAL_DELTA = 150;
export const DECISION_EVIDENCE_WORKOUT_DELTA = 2;
export const DECISION_EVIDENCE_LOG_DAYS_DELTA = 3;
export const DECISION_EVIDENCE_WEIGHT_DELTA_KG = 0.4;

export function isAthleteHumanDecision(value: string): value is AthleteHumanDecision {
  return (ATHLETE_HUMAN_DECISIONS as readonly string[]).includes(value);
}

export function canRecordAthleteDecision(input: {
  actorId: string | null | undefined;
  athleteId: string;
  isCoachOfAthlete: boolean;
}): boolean {
  return canMutateAthleteSignal(input);
}

export function canReadAthleteDecisionLog(input: {
  actorId: string | null | undefined;
  athleteId: string;
  isCoachOfAthlete: boolean;
}): boolean {
  return canRecordAthleteDecision(input);
}

export function mapSoloReviewDecision(decision: 'accepted' | 'kept' | 'dismissed'): AthleteHumanDecision {
  if (decision === 'accepted') return 'accepted';
  if (decision === 'kept') return 'ignored';
  return 'refused';
}

export function mapInterventionDecision(
  status: 'sent' | 'kept' | 'dismissed',
  edited: boolean,
): AthleteHumanDecision {
  if (status === 'kept') return 'ignored';
  if (status === 'dismissed') return 'refused';
  return edited ? 'modified' : 'accepted';
}

export function mapSoloProposalTarget(
  action: string,
  reason: string,
): { domain: AthleteSignalDomain; type: string } {
  if (action === 'relance') return { domain: 'adherence', type: 'sparse_nutrition' };
  if (reason === 'not_following') return { domain: 'nutrition', type: 'not_following' };
  if (reason === 'cut_stall' || reason === 'cut_gain' || reason === 'bulk_stall') {
    return { domain: 'weight', type: 'stall' };
  }
  if (reason === 'too_fast_cut' || reason === 'bulk_too_fast') {
    return { domain: 'weight', type: 'too_fast' };
  }
  if (reason === 'carb_support') return { domain: 'recovery', type: 'fatigue' };
  if (action === 'calorie_adjustment') return { domain: 'nutrition', type: 'not_following' };
  return { domain: 'nutrition', type: 'keep' };
}

export function mapInterventionKind(kind: string): { domain: AthleteSignalDomain; type: string } {
  if (kind === 'calorie_adjustment' || kind === 'adherence_nutrition') {
    return { domain: 'nutrition', type: 'not_following' };
  }
  if (kind === 'adherence_training' || kind === 'program_adjustment') {
    return { domain: 'training', type: 'missed_sessions' };
  }
  if (kind === 'keep_in_touch') return { domain: 'adherence', type: 'keep_in_touch' };
  if (kind === 'onboarding_plan') return { domain: 'goal', type: 'onboarding' };
  if ((ATHLETE_SIGNAL_DOMAINS as readonly string[]).includes(kind)) {
    return { domain: kind as AthleteSignalDomain, type: kind };
  }
  return { domain: 'goal', type: kind || 'other' };
}

export function latestAthleteDecision(
  rows: AthleteDecisionLog[],
  domain: string,
  type: string,
): AthleteDecisionLog | null {
  let best: AthleteDecisionLog | null = null;
  for (const row of rows) {
    if (row.domain !== domain || row.type !== type) continue;
    if (!best || row.created_at > best.created_at) best = row;
  }
  return best;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function compactEvidence(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

export function evidenceFromProposalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.evidence && typeof payload.evidence === 'object' && !Array.isArray(payload.evidence)
    ? payload.evidence as Record<string, unknown>
    : {};
  return compactEvidence({
    avg_calories: payload.avg_calories ?? nested.avg_calories,
    calorie_target: payload.target_avg_kcal ?? payload.calorie_target ?? nested.target_avg_kcal ?? nested.calorie_target,
    workout_count: payload.workout_count ?? nested.workout_count,
    logged_nutrition_days: payload.logged_nutrition_days ?? nested.logged_nutrition_days,
    weight_delta_kg: payload.weight_delta_kg ?? nested.weight_delta_kg,
  });
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = asNumber(row[key]);
    if (n != null) return n;
  }
  return null;
}

export function decisionEvidenceChanged(
  prev: Record<string, unknown> | null | undefined,
  next: WeeklyReviewAggregates,
): boolean {
  if (!prev) return false;
  const prevCal = firstNumber(prev, ['avg_calories', 'avgCalories']);
  if (prevCal != null && Math.abs(next.avgCalories - prevCal) >= DECISION_EVIDENCE_KCAL_DELTA) return true;
  const prevTarget = firstNumber(prev, ['calorie_target', 'calorieTarget', 'target_avg_kcal']);
  if (prevTarget != null && Math.abs(next.calorieTarget - prevTarget) >= DECISION_EVIDENCE_KCAL_DELTA) return true;
  const prevWorkouts = firstNumber(prev, ['workout_count', 'workoutCount']);
  if (prevWorkouts != null && Math.abs(next.workoutCount - prevWorkouts) >= DECISION_EVIDENCE_WORKOUT_DELTA) {
    return true;
  }
  const prevLogs = firstNumber(prev, ['logged_nutrition_days', 'loggedNutritionDays']);
  if (prevLogs != null && next.loggedNutritionDays - prevLogs >= DECISION_EVIDENCE_LOG_DAYS_DELTA) return true;
  const prevDelta = firstNumber(prev, ['weight_delta_kg', 'weightDeltaKg']);
  if (
    prevDelta != null
    && next.weightDeltaKg != null
    && Math.abs(next.weightDeltaKg - prevDelta) >= DECISION_EVIDENCE_WEIGHT_DELTA_KG
  ) {
    return true;
  }
  return false;
}

/** Last refused/ignored (domain, type) stays suppressed until evidence moves. */
export function isProposalSuppressed(
  recentDecisions: AthleteDecisionLog[],
  domain: string,
  type: string,
  aggregates: WeeklyReviewAggregates,
): boolean {
  const last = latestAthleteDecision(recentDecisions, domain, type);
  if (!last) return false;
  if (last.decision !== 'refused' && last.decision !== 'ignored') return false;
  return !decisionEvidenceChanged(last.data_used, aggregates);
}

export function snapshotReviewAggregates(agg: WeeklyReviewAggregates): Record<string, unknown> {
  return compactEvidence({
    avg_calories: agg.avgCalories,
    calorie_target: agg.calorieTarget,
    workout_count: agg.workoutCount,
    logged_nutrition_days: agg.loggedNutritionDays,
    weight_delta_kg: agg.weightDeltaKg,
  });
}

export function weeklyReviewAggregatesFromCounts(input: {
  avgCalories: number;
  calorieTarget: number;
  workoutCount: number;
  loggedNutritionDays: number;
  weightDeltaKg: number | null;
}): WeeklyReviewAggregates {
  return {
    windowStart: '',
    windowEnd: '',
    loggedNutritionDays: input.loggedNutritionDays,
    avgCalories: input.avgCalories,
    calorieTarget: input.calorieTarget,
    workoutCount: input.workoutCount,
    expectedWorkouts: 0,
    weighIns: 0,
    weightDeltaKg: input.weightDeltaKg,
    weightStartKg: null,
    weightSpanDays: null,
    checkinCount: 0,
    avgFatigue: null,
    avgEnergy: null,
    goal: '',
  };
}
