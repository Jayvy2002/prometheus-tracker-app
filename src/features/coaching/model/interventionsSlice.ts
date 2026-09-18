import {
  supabase,
} from '../../../lib/supabase';
import type { CoachIntervention } from '../../../lib/types';
import {
  mapInterventionRow,
} from '../../../lib/coachInterventions';
import {
  functionsErrorBody,
  functionsHttpStatus,
} from '../../../lib/supabaseFunctions';
import {
  isInterventionDrafting,
  mergeInterventionRealtime,
} from '../../../lib/coachSecond';
import {
  COACH_AGENT_FUNCTION,
  parseCoachAgentResponse,
} from '../../../lib/coachAgent';
import i18n from '../../../i18n';
import {
  track,
} from '../../../lib/telemetryClient';
import {
  loadOrCreateInterventionKeys,
} from '../../../lib/idempotencyKeys';
import {
  effectsToJson,
  type InterventionEffects,
} from '../../../lib/interventionEffects';
import {
  recordAthleteDecisionBestEffort,
} from '../../signals/domain/decisionLogApi';
import {
  evidenceFromProposalPayload,
  mapInterventionDecision,
  mapInterventionKind,
} from '../../signals/domain/decisionLog';
import {
  CoachingGet,
  CoachingSet,
  CoachingState,
  saveQueueDismissed,
} from './coachingShared';

function journalInterventionDecision(
  row: CoachIntervention | undefined,
  status: 'sent' | 'kept' | 'dismissed',
  edited: boolean,
  effects?: InterventionEffects,
) {
  if (!row?.client_id) return;
  const human = mapInterventionDecision(status, edited);
  const target = mapInterventionKind(row.kind);
  recordAthleteDecisionBestEffort({
    athleteId: row.client_id,
    domain: target.domain,
    type: target.type,
    decision: human,
    proposal: {
      kind: row.kind,
      title: row.title,
      rationale: row.rationale,
      payload: row.payload,
    },
    why: row.rationale || row.kind,
    dataUsed: evidenceFromProposalPayload(row.payload),
    appliedEffect: human === 'refused' || human === 'ignored' ? {} : effectsToJson(effects ?? {}),
    source: 'coach_interventions',
    sourceId: row.id,
  });
}

export function createInterventionsSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'fetchPendingInterventions' | 'dismissQueueItem' | 'dismissQueueItems' | 'restoreQueueItems' | 'fetchIntervention' | 'resolveIntervention' | 'claimIntervention' | 'applyIntervention' | 'releaseIntervention' | 'finalizeIntervention' | 'askCoachAgent' | 'runFleetRound' | 'createIntervention' > {
  return {
  fetchPendingInterventions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ pendingInterventions: [] });
      return;
    }
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('coach_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) {
      set({ pendingInterventions: [] });
      return;
    }
    const rows = data
      .map(row => mapInterventionRow(row as Record<string, unknown>))
      .filter((row): row is CoachIntervention => !!row);
    set({ pendingInterventions: rows });
  },

  dismissQueueItem: (id) => {
    get().dismissQueueItems([id]);
  },

  dismissQueueItems: (ids) => {
    if (ids.length === 0) return;
    set(s => {
      const next = [...s.queueDismissedIds];
      const seen = new Set(next);
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
      saveQueueDismissed(next);
      return { queueDismissedIds: next };
    });
  },

  restoreQueueItems: (ids) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    set(s => {
      const next = s.queueDismissedIds.filter(id => !drop.has(id));
      saveQueueDismissed(next);
      return { queueDismissedIds: next };
    });
  },

  fetchIntervention: async (id) => {
    const { data, error } = await supabase
      .from('coach_interventions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapInterventionRow(data as Record<string, unknown>);
  },

  resolveIntervention: async (id, status, payload) => {
    // Chemin sans effets externes (dismiss pur) : un seul UPDATE conditionnel,
    // atomique par nature. Avec effets → claim/finalize ci-dessous.
    const updates: Record<string, unknown> = {
      status,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (payload) updates.payload = payload;
    const { data, error } = await supabase
      .from('coach_interventions')
      .update(updates)
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'already_resolved' };
    const resolved = get().pendingInterventions.find(row => row.id === id);
    track('intervention_resolved', {
      kind: resolved?.kind ?? null,
      source: resolved?.source ?? null,
      status,
      edited: !!payload,
    });
    if (status === 'sent' || status === 'kept' || status === 'dismissed') {
      journalInterventionDecision(resolved, status, !!payload);
    }
    set(s => ({
      pendingInterventions: s.pendingInterventions.filter(row => row.id !== id),
    }));
    return { error: null };
  },

  claimIntervention: async (id) => {
    const keys = loadOrCreateInterventionKeys(id);
    const { data, error } = await supabase.rpc('claim_intervention', {
      p_id: id,
      p_claim_key: keys.claimKey,
    });
    if (error) return { error: error.message };
    const outcome = data as { ok: boolean; reason?: string; already_done?: boolean } | null;
    if (!outcome?.ok) return { error: outcome?.reason ?? 'already_resolved' };
    return { claimKey: keys.claimKey };
  },

  applyIntervention: async (id, status, payload, effects) => {
    const persistId = id ?? `setup:${effects.assign_client_id ?? 'self'}`;
    const keys = loadOrCreateInterventionKeys(persistId);
    const { data, error } = await supabase.rpc('apply_intervention', {
      p_id: id,
      p_idempotency_key: keys.idempotencyKey,
      p_claim_key: keys.claimKey,
      p_status: status,
      p_payload: (payload ?? null) as unknown as Record<string, never> | null,
      p_effects: effectsToJson(effects) as unknown as Record<string, never>,
      p_client_msg_id: effects.message ? keys.clientMsgId : null,
    });
    if (error) return { error: error.message };
    const outcome = data as { ok: boolean; reason?: string; replayed?: boolean } | null;
    if (!outcome?.ok) return { error: outcome?.reason ?? 'already_resolved' };
    if (id) {
      const resolved = get().pendingInterventions.find(row => row.id === id);
      if (!outcome.replayed) {
        track('intervention_resolved', {
          kind: resolved?.kind ?? null,
          source: resolved?.source ?? null,
          status,
          edited: !!payload,
        });
        if (status === 'sent' || status === 'kept' || status === 'dismissed') {
          journalInterventionDecision(resolved, status, !!payload, effects);
        }
      }
      set(s => ({
        pendingInterventions: s.pendingInterventions.filter(row => row.id !== id),
      }));
    }
    return { error: null, replayed: !!outcome.replayed };
  },

  releaseIntervention: async (id, claimKey) => {
    await supabase.rpc('release_intervention_claim', {
      p_id: id,
      p_claim_key: claimKey,
    });
  },

  finalizeIntervention: async (id, claimKey, status, payload) => {
    const { data, error } = await supabase.rpc('finalize_intervention', {
      p_id: id,
      p_claim_key: claimKey,
      p_status: status,
      p_payload: (payload ?? null) as unknown as Record<string, never> | null,
    });
    if (error) return { error: error.message };
    const outcome = data as { ok: boolean; reason?: string } | null;
    if (!outcome?.ok) return { error: outcome?.reason ?? 'already_resolved' };
    const resolved = get().pendingInterventions.find(row => row.id === id);
    track('intervention_resolved', {
      kind: resolved?.kind ?? null,
      source: resolved?.source ?? null,
      status,
      edited: !!payload,
    });
    set(s => ({
      pendingInterventions: s.pendingInterventions.filter(row => row.id !== id),
    }));
    return { error: null };
  },

  askCoachAgent: async (input) => {
    const { data, error } = await supabase.functions.invoke(COACH_AGENT_FUNCTION, {
      body: {
        kind: input.kind,
        client_id: input.clientId ?? null,
        program_id: input.programId ?? null,
        prompt: input.prompt,
        screen: input.screen,
        context: input.context ?? {},
        locale: i18n.language,
      },
    });
    const bodyFromData = (data && typeof data === 'object' && !Array.isArray(data))
      ? data as Record<string, unknown>
      : {};
    const bodyFromError = error ? await functionsErrorBody(error) : {};
    const body = Object.keys(bodyFromData).length > 0 ? bodyFromData : bodyFromError;
    const outcome = parseCoachAgentResponse(body, error ? functionsHttpStatus(error) || 502 : 200);
    if (outcome.kind === 'error') {
      return { error: outcome.code };
    }
    const rawIntervention = body.intervention && typeof body.intervention === 'object'
      ? mapInterventionRow(body.intervention as Record<string, unknown>)
      : null;
    const id = outcome.kind === 'ready' || outcome.kind === 'poll'
      ? (outcome.id ?? rawIntervention?.id)
      : rawIntervention?.id;
    let row = rawIntervention;
    if (!row && id) row = await get().fetchIntervention(id);
    track('agent_asked', { kind: input.kind, screen: input.screen, landed: !!row });
    if (row) {
      set(s => ({
        pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, 'INSERT', row),
      }));
      if (isInterventionDrafting(row)) void get().startCoachRealtime();
    }
    if (!row) {
      const errCode = typeof body.error === 'string' ? body.error : '';
      if (functionsHttpStatus(error) === 429 || errCode === 'DAILY_LIMIT_REACHED') {
        return { error: 'DAILY_LIMIT_REACHED' };
      }
      return { error: errCode || 'ai_unavailable' };
    }
    return { id: row.id };
  },

  runFleetRound: async () => {
    if (get().fleetRunning) return { error: null };
    set({ fleetRunning: true });
    const { data, error } = await supabase.functions.invoke('coach-fleet-round', {
      body: { trigger: 'on_demand' },
    });
    const bodyFromData = (data && typeof data === 'object' && !Array.isArray(data))
      ? data as Record<string, unknown>
      : {};
    const bodyFromError = error ? await functionsErrorBody(error) : {};
    const body = Object.keys(bodyFromData).length > 0 ? bodyFromData : bodyFromError;
    const errCode = typeof body.error === 'string' ? body.error : '';
    const stats = {
      clients_seen: Number(body.clients_seen) || 0,
      clients_flagged: Number(body.clients_flagged) || 0,
      clients_skipped: Number(body.clients_skipped) || 0,
      model_used: typeof body.model_used === 'string' ? body.model_used : null,
    };
    set({
      fleetRunning: false,
      lastFleetRound: stats,
    });
    track('fleet_round_run', {
      trigger: 'on_demand',
      seen: stats.clients_seen,
      flagged: stats.clients_flagged,
      skipped: stats.clients_skipped,
      failed: !!error,
    });
    await get().fetchPendingInterventions();
    if (error && errCode) return { error: errCode, ...stats };
    if (error && !body.cards) return { error: errCode || 'fleet_failed', ...stats };
    return { error: null, ...stats };
  },

  createIntervention: async (input) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const row = {
      coach_id: user.id,
      client_id: input.clientId,
      kind: input.kind,
      title: input.title,
      rationale: input.rationale,
      payload: { ...input.payload, source: input.source ?? 'prometheus_local' },
      status: 'pending' as const,
      source: input.source ?? 'prometheus_local',
    };
    const inserted = await supabase.from('coach_interventions').insert(row).select().maybeSingle();
    if (inserted.error || !inserted.data) {
      const { data, error } = await supabase.rpc('upsert_coach_intervention', {
        p_coach_id: user.id,
        p_client_id: input.clientId,
        p_kind: input.kind,
        p_rationale: input.rationale,
        p_payload: row.payload,
        p_title: input.title,
      });
      if (error || !data) return { error: error?.message ?? inserted.error?.message ?? 'Failed to create draft' };
      await get().fetchPendingInterventions();
      return { id: data as string };
    }
    const mapped = mapInterventionRow(inserted.data as Record<string, unknown>);
    if (mapped) {
      set(s => ({ pendingInterventions: [mapped, ...s.pendingInterventions] }));
    }
    return { id: inserted.data.id as string };
  },
  };
}
