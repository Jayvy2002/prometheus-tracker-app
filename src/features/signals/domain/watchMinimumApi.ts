import { supabase } from '../../../lib/supabase';
import { isWatchProposalReviewId, isWatchProposalWeekStart } from './watchProposal';
import { watchMinimumApplyIdempotencyKey } from './watchMinimum';
import type { WatchQueryResult } from './watchQuery';

export interface ApplyAthleteWatchMinimumInput {
  signalId: string;
  journalId: string;
  weekStart: string;
  proposal: Record<string, unknown>;
}

/** Applies the accepted complete calorie draft. Never fail-open. Never rewrites programs. */
export async function applyAthleteWatchMinimum(
  input: ApplyAthleteWatchMinimumInput,
): Promise<WatchQueryResult<{
  id: string;
  appliedEffect: Record<string, unknown>;
}>> {
  if (!input.signalId || !isWatchProposalReviewId(input.journalId)) {
    return { ok: false, message: 'invalid_decision' };
  }
  if (!isWatchProposalWeekStart(input.weekStart)) {
    return { ok: false, message: 'invalid_decision' };
  }
  const { data, error } = await supabase.rpc('apply_athlete_watch_minimum', {
    p_signal_id: input.signalId,
    p_journal_id: input.journalId,
    p_seen_proposal: input.proposal,
    p_idempotency_key: watchMinimumApplyIdempotencyKey(input.signalId, input.weekStart),
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  const row = data && typeof data === 'object' ? data as {
    id?: unknown;
    applied_effect?: unknown;
  } : null;
  const id = row && typeof row.id === 'string' ? row.id : '';
  if (!id) return { ok: false, message: 'not_persisted' };
  const appliedEffect = row?.applied_effect && typeof row.applied_effect === 'object'
    && !Array.isArray(row.applied_effect)
    ? row.applied_effect as Record<string, unknown>
    : {};
  return { ok: true, data: { id, appliedEffect } };
}
