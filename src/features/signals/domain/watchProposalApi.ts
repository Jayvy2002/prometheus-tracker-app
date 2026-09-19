import { supabase } from '../../../lib/supabase';
import {
  isWatchProposalDecision,
  isWatchProposalReviewId,
  isWatchProposalWeekStart,
  watchProposalIdempotencyKey,
  watchProposalReasonRequired,
  type WatchProposalDecision,
} from './watchProposal';
import type { WatchQueryResult } from './watchQuery';

export interface DecideAthleteWatchProposalInput {
  signalId: string;
  decision: WatchProposalDecision;
  humanReason: string;
  weekStart: string;
  reviewId: string;
  reviewUpdatedAt: string;
  proposal: Record<string, unknown>;
  evidence: Record<string, unknown>;
}

/** Journal only. Never fail-open: a missed write is an error. Never applies targets or programs. */
export async function decideAthleteWatchProposal(
  input: DecideAthleteWatchProposalInput,
): Promise<WatchQueryResult<{ id: string }>> {
  const reason = input.humanReason.trim();
  if (!input.signalId || !isWatchProposalDecision(input.decision)) {
    return { ok: false, message: 'invalid_decision' };
  }
  if (!isWatchProposalWeekStart(input.weekStart) || !isWatchProposalReviewId(input.reviewId)) {
    return { ok: false, message: 'invalid_decision' };
  }
  if (!input.reviewUpdatedAt.trim()) {
    return { ok: false, message: 'stale_proposal' };
  }
  if (watchProposalReasonRequired(input.decision) && !reason) {
    return { ok: false, message: 'invalid_reason' };
  }
  if (reason.length > 500) {
    return { ok: false, message: 'invalid_reason' };
  }
  const { data, error } = await supabase.rpc('decide_athlete_watch_proposal', {
    p_signal_id: input.signalId,
    p_decision: input.decision,
    p_human_reason: reason,
    p_idempotency_key: watchProposalIdempotencyKey(
      input.signalId,
      input.decision,
      input.weekStart,
    ),
    p_review_id: input.reviewId,
    p_seen_updated_at: input.reviewUpdatedAt,
    p_seen_proposal: input.proposal,
    p_seen_evidence: input.evidence,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  const id = data && typeof data === 'object' && 'id' in data
    ? String((data as { id: unknown }).id)
    : '';
  if (!id) return { ok: false, message: 'not_persisted' };
  return { ok: true, data: { id } };
}
