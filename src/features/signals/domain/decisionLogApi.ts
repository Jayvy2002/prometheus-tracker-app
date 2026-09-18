import { supabase } from '../../../lib/supabase';
import type { AthleteDecisionLog, AthleteHumanDecision, AthleteSignalDomain } from '../types';
import { isMissingBackendContract } from './backendContract';

export interface RecordAthleteDecisionInput {
  athleteId: string;
  domain: AthleteSignalDomain;
  type: string;
  decision: AthleteHumanDecision;
  proposal: Record<string, unknown>;
  why: string;
  dataUsed?: Record<string, unknown>;
  humanReason?: string | null;
  appliedEffect?: Record<string, unknown>;
  source?: string | null;
  sourceId?: string | null;
  idempotencyKey?: string | null;
}

function journalRpcArgs(input: RecordAthleteDecisionInput) {
  return {
    p_athlete_id: input.athleteId,
    p_domain: input.domain,
    p_type: input.type,
    p_decision: input.decision,
    p_proposal: input.proposal,
    p_why: input.why,
    p_data_used: input.dataUsed ?? {},
    p_human_reason: input.humanReason ?? null,
    p_applied_effect: input.appliedEffect ?? {},
    p_source: input.source ?? null,
    p_source_id: input.sourceId ?? null,
  };
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

/** Writes go through SECURITY DEFINER RPC. Direct table inserts are revoked. */
export async function recordAthleteDecision(input: RecordAthleteDecisionInput) {
  return supabase.rpc('record_athlete_decision', {
    ...journalRpcArgs(input),
    p_idempotency_key: decisionIdempotencyKey(input),
  });
}

export async function enqueueAthleteDecisionOutbox(input: RecordAthleteDecisionInput) {
  return supabase.rpc('enqueue_athlete_decision_outbox', {
    p_idempotency_key: decisionIdempotencyKey(input),
    ...journalRpcArgs(input),
  });
}

export async function queueAndRecordAthleteDecision(input: RecordAthleteDecisionInput) {
  return supabase.rpc('queue_and_record_athlete_decision', {
    p_idempotency_key: decisionIdempotencyKey(input),
    ...journalRpcArgs(input),
  });
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
 * Durable journal write: enqueue the intent and record in one RPC.
 * Missing candidate → fail-open. Other errors are returned, not swallowed.
 */
export async function recordAthleteDecisionDurable(
  input: RecordAthleteDecisionInput,
): Promise<DurableDecisionResult> {
  const queued = await queueAndRecordAthleteDecision(input);
  if (!queued.error) {
    await drainAthleteDecisionOutboxBestEffort();
    return { persisted: true, error: null };
  }
  if (isMissingBackendContract(queued.error)) {
    const recorded = await supabase.rpc('record_athlete_decision', journalRpcArgs(input));
    if (!recorded.error) return { persisted: true, error: null };
    if (isMissingBackendContract(recorded.error)) return { persisted: false, error: null };
    const boxed = await enqueueAthleteDecisionOutbox(input);
    if (boxed.error && !isMissingBackendContract(boxed.error)) {
      return { persisted: false, error: boxed.error.message };
    }
    return { persisted: false, error: recorded.error.message };
  }
  return { persisted: false, error: queued.error.message };
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

/** Latest decision per (domain, type). Table/RPC missing → fail-open. */
export async function listLatestAthleteDecisionsBestEffort(athleteId: string): Promise<AthleteDecisionLog[]> {
  const latest = await listLatestAthleteDecisions(athleteId);
  if (!latest.error && Array.isArray(latest.data)) {
    return latest.data as AthleteDecisionLog[];
  }
  if (latest.error && !isMissingBackendContract(latest.error)) return [];
  const { data, error } = await listAthleteDecisionLog(athleteId);
  if (error || !Array.isArray(data)) return [];
  return data as AthleteDecisionLog[];
}

/** Table missing or offline: next review continues without journal context. */
export async function listAthleteDecisionLogBestEffort(athleteId: string): Promise<AthleteDecisionLog[]> {
  return listLatestAthleteDecisionsBestEffort(athleteId);
}

export { isMissingBackendContract };
