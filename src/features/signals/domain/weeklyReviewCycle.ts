/**
 * P2.2 orchestration: load authorized memory → run engine → persist review + signals.
 * Duplicate protection is UNIQUE (athlete_id, week_start). Wait weeks are stored.
 * Current Solo card and Coach inbox are not replaced.
 */

import type { AthleteDecisionLog, AthleteSignal } from '../types';
import { listOpenAthleteSignalsBestEffort } from './athleteSignalsApi';
import { drainAthleteDecisionOutboxBestEffort, isMissingBackendContract, listLatestAthleteDecisionsBestEffort } from './decisionLogApi';
import { runAthleteWeeklyReview, type WeeklyReviewInput, type WeeklyReviewResult } from './weeklyReview';
import { saveAthleteWeeklyReview } from './weeklyReviewApi';

export async function loadWeeklyReviewMemory(athleteId: string): Promise<{
  existingSignals: AthleteSignal[];
  recentDecisions: AthleteDecisionLog[];
}> {
  const [existingSignals, recentDecisions] = await Promise.all([
    listOpenAthleteSignalsBestEffort(athleteId),
    listLatestAthleteDecisionsBestEffort(athleteId),
  ]);
  return { existingSignals, recentDecisions };
}

export async function persistAthleteWeeklyReviewCycle(input: WeeklyReviewInput): Promise<{
  review: WeeklyReviewResult;
  persisted: boolean;
  error: string | null;
}> {
  const review = runAthleteWeeklyReview(input);
  const { error } = await saveAthleteWeeklyReview({ athleteId: input.athleteId, review });
  if (!error) {
    await drainAthleteDecisionOutboxBestEffort();
    return { review, persisted: true, error: null };
  }
  if (isMissingBackendContract(error)) return { review, persisted: false, error: null };
  return { review, persisted: false, error: error.message };
}
