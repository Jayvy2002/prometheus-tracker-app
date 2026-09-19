import { supabase } from '../../../lib/supabase';
import {
  isWatchContextCorrectionAction,
  watchContextCorrectionIdempotencyKey,
  type WatchContextCorrectionAction,
} from './watchContext';
import type { WatchQueryResult } from './watchQuery';

export interface CorrectAthleteWatchContextInput {
  signalId: string;
  action: WatchContextCorrectionAction;
  humanReason: string;
}

/** Atomic resolve + journal. Never fail-open: a missed write is an error. */
export async function correctAthleteWatchContext(
  input: CorrectAthleteWatchContextInput,
): Promise<WatchQueryResult<{ id: string }>> {
  const reason = input.humanReason.trim();
  if (!input.signalId || !isWatchContextCorrectionAction(input.action) || !reason) {
    return { ok: false, message: 'invalid_reason' };
  }
  if (reason.length > 500) {
    return { ok: false, message: 'invalid_reason' };
  }
  const { data, error } = await supabase.rpc('correct_athlete_watch_context', {
    p_signal_id: input.signalId,
    p_action: input.action,
    p_human_reason: reason,
    p_idempotency_key: watchContextCorrectionIdempotencyKey(input.signalId, input.action),
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
