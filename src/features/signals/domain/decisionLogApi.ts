import { supabase } from '../../../lib/supabase';
import type { AthleteDecisionLog, AthleteHumanDecision, AthleteSignalDomain } from '../types';

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
}

/** Writes go through SECURITY DEFINER RPC. Direct table inserts are revoked. */
export async function recordAthleteDecision(input: RecordAthleteDecisionInput) {
  return supabase.rpc('record_athlete_decision', {
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
  });
}

/** Human write already succeeded. Journal failure must not roll it back (candidate not in prod). */
export function recordAthleteDecisionBestEffort(input: RecordAthleteDecisionInput): void {
  void recordAthleteDecision(input).then(() => undefined, () => undefined);
}

export async function listAthleteDecisionLog(athleteId: string) {
  return supabase
    .from('athlete_decision_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(50);
}

/** Table missing or offline: next review continues without journal context. */
export async function listAthleteDecisionLogBestEffort(athleteId: string): Promise<AthleteDecisionLog[]> {
  const { data, error } = await listAthleteDecisionLog(athleteId);
  if (error || !Array.isArray(data)) return [];
  return data as AthleteDecisionLog[];
}
