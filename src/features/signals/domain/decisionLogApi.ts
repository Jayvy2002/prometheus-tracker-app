import { supabase } from '../../../lib/supabase';
import type { AthleteDecisionLog } from '../types';
import { isMissingBackendContract } from './backendContract';
import type { WatchQueryResult } from './watchQuery';

export interface RecordAthleteDecisionInput {
  athleteId: string;
  domain: AthleteDecisionLog['domain'];
  type: string;
  decision: AthleteDecisionLog['decision'];
  proposal: Record<string, unknown>;
  why: string;
  dataUsed?: Record<string, unknown>;
  humanReason?: string | null;
  appliedEffect?: Record<string, unknown>;
  source?: string | null;
  sourceId?: string | null;
  idempotencyKey?: string | null;
}

export function decisionIdempotencyKey(input: RecordAthleteDecisionInput): string {
  if (input.idempotencyKey && input.idempotencyKey.trim()) {
    return input.idempotencyKey.trim().slice(0, 200);
  }
  return [
    input.athleteId,
    input.source ?? 'unknown',
    input.sourceId ?? '',
    input.decision,
    input.domain,
    input.type,
  ].join(':').slice(0, 200);
}

export async function drainAthleteDecisionOutbox(limit = 25) {
  return supabase.rpc('drain_athlete_decision_outbox', { p_limit: limit });
}

export async function drainAthleteDecisionOutboxBestEffort(limit = 25): Promise<number> {
  const { data, error } = await drainAthleteDecisionOutbox(limit);
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

export type DurableDecisionResult = { persisted: boolean; error: string | null };

/**
 * Hotfix B: the five P2 primitives are not Data API-callable.
 * Journal writes go through métier RPCs. The client only drains leftover outbox.
 * Missing-backend fallback remains fail-open.
 */
export async function recordAthleteDecisionDurable(
  input: RecordAthleteDecisionInput,
): Promise<DurableDecisionResult> {
  void input;
  await drainAthleteDecisionOutboxBestEffort();
  return { persisted: false, error: null };
}

/** @deprecated use recordAthleteDecisionDurable — kept as the awaited durable path. */
export async function recordAthleteDecisionBestEffort(input: RecordAthleteDecisionInput): Promise<void> {
  await recordAthleteDecisionDurable(input);
}

export async function listAthleteDecisionLog(athleteId: string) {
  return supabase
    .from('athlete_decision_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(50);
}

export async function listLatestAthleteDecisions(athleteId: string) {
  return supabase.rpc('list_latest_athlete_decisions', { p_athlete_id: athleteId });
}

export async function listLatestAthleteDecisionsForWatch(
  athleteId: string,
): Promise<WatchQueryResult<AthleteDecisionLog[]>> {
  const latest = await listLatestAthleteDecisions(athleteId);
  if (!latest.error && Array.isArray(latest.data)) {
    return { ok: true, data: latest.data as AthleteDecisionLog[] };
  }
  if (latest.error && !isMissingBackendContract(latest.error)) {
    return { ok: false, message: latest.error.message };
  }
  const { data, error } = await listAthleteDecisionLog(athleteId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: Array.isArray(data) ? data as AthleteDecisionLog[] : [] };
}

/** Latest decision per (domain, type). Table/RPC missing → fail-open for the engine. */
export async function listLatestAthleteDecisionsBestEffort(athleteId: string): Promise<AthleteDecisionLog[]> {
  const result = await listLatestAthleteDecisionsForWatch(athleteId);
  return result.ok ? result.data : [];
}

/** Table missing or offline: next review continues without journal context. */
export async function listAthleteDecisionLogBestEffort(athleteId: string): Promise<AthleteDecisionLog[]> {
  return listLatestAthleteDecisionsBestEffort(athleteId);
}

export { isMissingBackendContract };
