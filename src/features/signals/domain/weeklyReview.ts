/**
 * P2.2 — universal weekly review (docs/VISION.md §8.2–8.4).
 * Engine lives in `supabase/functions/_shared/weeklyReviewEngine.ts` so Solo and
 * Deno `coach-fleet-round` run the same loop. Cards are not replaced.
 */

import type { AthleteDecisionLog, AthleteSignal } from '../types';
import type {
  WeeklyReviewAggregates,
  WeeklyReviewInput,
} from '../../../../supabase/functions/_shared/weeklyReviewEngine.ts';

export {
  WEEKLY_REVIEW_WINDOW_DAYS,
  addUtcDays,
  evidenceFingerprint,
  fingerprintFromEvidence,
  isoWeekStart,
  nextSignalConfidence,
  normalizeFingerprint,
  runAthleteWeeklyReview,
  weeklyReviewActionsToRpcPayload,
  weeklyReviewInputFromFleet,
  weeklyReviewSaveArgs,
  type WeeklyReviewAggregates,
  type WeeklyReviewFleetLike,
  type WeeklyReviewInput,
  type WeeklyReviewResult,
  type WeeklyReviewSignalAction,
  type WeeklyReviewTracking,
  type WatchProposalSnapshot,
} from '../../../../supabase/functions/_shared/weeklyReviewEngine.ts';

export interface WeeklyReviewSoloLike {
  today: string;
  goal: string;
  calorieTarget: number;
  proteinTarget?: number;
  carbsTarget?: number;
  fatTarget?: number;
  weightKg?: number;
  trainingFrequency: number;
  isMinor?: boolean;
  hasMedicalFlags?: boolean;
  tracking?: {
    nutrition: boolean;
    workouts: boolean;
    weight: boolean;
    checkins: boolean;
  };
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
  weightEnd?: number | null;
  weightSpanDays: number | null;
  workouts: number;
  expectedWorkouts: number;
  avgFatigue: number | null;
  avgEnergy: number | null;
  checkinCount?: number;
}

export function weeklyReviewInputFromSolo(
  inputs: WeeklyReviewSoloLike,
  evidence: WeeklyReviewSoloEvidenceLike,
  existingSignals: AthleteSignal[] = [],
  athleteId = 'self',
  recentDecisions: AthleteDecisionLog[] = [],
): WeeklyReviewInput {
  return {
    athleteId,
    today: inputs.today,
    identity: 'solo',
    tracking: {
      nutrition: inputs.tracking?.nutrition !== false,
      workouts: inputs.tracking?.workouts !== false,
      weight: inputs.tracking?.weight !== false,
      checkins: inputs.tracking?.checkins !== false,
    },
    guarded: inputs.isMinor === true || inputs.hasMedicalFlags === true,
    existingSignals,
    recentDecisions,
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
      checkinCount: evidence.checkinCount ?? 0,
      avgFatigue: evidence.avgFatigue,
      avgEnergy: evidence.avgEnergy,
      goal: inputs.goal,
      proteinTarget: inputs.proteinTarget ?? 0,
      carbsTarget: inputs.carbsTarget ?? 0,
      fatTarget: inputs.fatTarget ?? 0,
      weightKg: evidence.weightEnd ?? inputs.weightKg,
      weightEndKg: evidence.weightEnd,
      avgEffectiveTarget: evidence.targetAvg,
    } satisfies WeeklyReviewAggregates,
  };
}
