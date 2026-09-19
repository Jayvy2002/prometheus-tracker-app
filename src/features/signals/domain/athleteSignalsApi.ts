import { supabase } from '../../../lib/supabase';
import type { AthleteSignal, AthleteSignalClosedStatus, AthleteSignalOpenStatus } from '../types';
import { isMissingBackendContract } from './backendContract';

export interface UpsertAthleteSignalInput {
  athleteId: string;
  domain: AthleteSignal['domain'];
  type: string;
  hypothesis: string;
  evidenceFor?: unknown[];
  evidenceAgainst?: unknown[];
  confidence?: AthleteSignal['confidence'];
  status?: AthleteSignalOpenStatus;
  nextReviewAt?: string | null;
}

/** Writes go through SECURITY DEFINER RPCs. Direct table inserts are revoked. */
export async function upsertAthleteSignal(input: UpsertAthleteSignalInput) {
  return supabase.rpc('upsert_athlete_signal', {
    p_athlete_id: input.athleteId,
    p_domain: input.domain,
    p_type: input.type,
    p_hypothesis: input.hypothesis,
    p_evidence_for: input.evidenceFor ?? [],
    p_evidence_against: input.evidenceAgainst ?? [],
    p_confidence: input.confidence ?? 'low',
    p_status: input.status ?? 'open',
    p_next_review_at: input.nextReviewAt ?? null,
  });
}

export async function resolveAthleteSignal(input: {
  id: string;
  status: AthleteSignalClosedStatus;
  reason?: string | null;
}) {
  return supabase.rpc('resolve_athlete_signal', {
    p_id: input.id,
    p_status: input.status,
    p_reason: input.reason ?? null,
  });
}

export async function listOpenAthleteSignalsBestEffort(athleteId: string): Promise<AthleteSignal[]> {
  const { data, error } = await supabase
    .from('athlete_signals')
    .select('*')
    .eq('athlete_id', athleteId)
    .in('status', ['open', 'waiting']);
  if (error || !Array.isArray(data)) return [];
  return data as AthleteSignal[];
}

export { isMissingBackendContract };
