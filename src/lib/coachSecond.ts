import type { CoachIntervention, CoachInterventionKind } from './types';
import {
  isCoachOnlyKind,
  isCompleteCalorieDraft,
  parseCalorieDraft,
  parseOnboardingPlanDraft,
  parseProgramOutline,
  parseProgramPatch,
  payloadSummary,
} from './coachInterventions';

/** Route coach copilot text to an in-app agent kind (not Second). */
export const SECOND_PING_KINDS = ['onboarding_plan', 'ask_prometheus', 'program_nl_edit', 'calorie_adjustment'] as const;
export type SecondPingKind = (typeof SECOND_PING_KINDS)[number];

export type CoachSecondRouteKind = SecondPingKind | 'roster';

const CREATE_PROGRAM_RE = /(cr[eé]er?|create|g[eé]n[eè]re|draft|fais|fait[es]?|make|build|propose|r[eé]dige).{0,48}(programme|program)|(programme|program).{0,20}(ia|ai)|un programme (pour|d['’e]|ia|ai)|un program (for|ia|ai)/i;
const NL_EDIT_RE = /(\d+\s*[x×]\s*\d+|passe|change|met |set |rir\s*\d|rep range|volume)/i;

export interface CoachSecondRoute {
  kind: CoachSecondRouteKind;
  reason: 'roster_filter' | 'first_program' | 'nl_edit' | 'freeform';
}

export function isSecondPingKind(value: string): value is SecondPingKind {
  return (SECOND_PING_KINDS as readonly string[]).includes(value);
}

export function looksLikeCreateProgram(raw: string): boolean {
  return CREATE_PROGRAM_RE.test(raw.trim());
}

export function looksLikeProgramNlEdit(raw: string): boolean {
  return NL_EDIT_RE.test(raw.trim());
}

export function routeCoachSecondRequest(
  raw: string,
  opts?: { hasProgram?: boolean; onboarded?: boolean },
): CoachSecondRoute {
  const q = raw.trim();
  if (!q) return { kind: 'ask_prometheus', reason: 'freeform' };
  if (looksLikeCreateProgram(q) && opts?.onboarded !== false) {
    return { kind: 'onboarding_plan', reason: 'first_program' };
  }
  if (opts?.hasProgram && looksLikeProgramNlEdit(q)) {
    return { kind: 'program_nl_edit', reason: 'nl_edit' };
  }
  return { kind: 'ask_prometheus', reason: 'freeform' };
}

export function draftingPayload(input: {
  prompt: string;
  screen: string;
  programId?: string | null;
  context?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    drafting: true,
    prompt: input.prompt,
    screen: input.screen,
    program_id: input.programId ?? null,
    initiated_by: 'coach',
    ...(input.context ? { context: input.context } : {}),
  };
}

export function isInterventionDrafting(row: Pick<CoachIntervention, 'status' | 'payload'>): boolean {
  if (row.status !== 'pending') return false;
  const payload = row.payload ?? {};
  return payload.drafting === true;
}

export function interventionDraftError(row: Pick<CoachIntervention, 'payload'>): string | null {
  const err = row.payload?.error;
  return typeof err === 'string' && err.trim() ? err : null;
}

export function isInterventionReady(row: Pick<CoachIntervention, 'status' | 'kind' | 'payload'>): boolean {
  if (row.status !== 'pending') return false;
  if (isInterventionDrafting(row)) return false;
  if (interventionDraftError(row)) return false;
  if (parseOnboardingPlanDraft(row.payload) || parseProgramOutline(row.payload) || parseProgramPatch(row.payload)) {
    return true;
  }
  if (isCompleteCalorieDraft(parseCalorieDraft(row.payload))) return true;
  const answer = row.payload?.answer ?? row.payload?.notes ?? row.payload?.body ?? row.payload?.proposal ?? row.payload?.suggestion;
  return typeof answer === 'string' && answer.trim().length > 0;
}

export function mergeInterventionRealtime(
  current: CoachIntervention[],
  event: 'INSERT' | 'UPDATE' | 'DELETE' | string,
  row: CoachIntervention | null,
): CoachIntervention[] {
  if (!row) return current;
  if (event === 'DELETE' || row.status !== 'pending') {
    return current.filter(item => item.id !== row.id);
  }
  const index = current.findIndex(item => item.id === row.id);
  if (index < 0) return [row, ...current];
  const next = [...current];
  next[index] = row;
  return next;
}

export function pendingForClient(
  rows: CoachIntervention[],
  clientId: string,
  kind?: CoachInterventionKind,
): CoachIntervention | null {
  return rows.find(row => (
    !!row.client_id
    && row.client_id === clientId
    && !isCoachOnlyKind(row.kind)
    && (!kind || row.kind === kind)
  )) ?? null;
}

export function interventionLiveLabel(item: CoachIntervention, t: (key: string) => string): string {
  if (isInterventionDrafting(item)) return t('coaching.second.drafting');
  if (interventionDraftError(item)) return t('coaching.second.failed');
  return payloadSummary(item);
}

export const COACH_REALTIME_POLL_MS = 8_000;
export const COACH_REALTIME_POLL_MAX_MS = 90_000;
