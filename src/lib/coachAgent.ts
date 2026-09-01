/**
 * In-app coach agent contract (sync OpenAI edge function).
 *
 * Coach drafts (onboarding_plan, ask_prometheus, program_nl_edit) finish in
 * the same request as analyze-product / verify-exercise. Never ping Second
 * (the Grok Bot webhook). Fleet SQL triage stays; if fleet calls an LLM it
 * uses this same OpenAI path.
 */

export const COACH_AGENT_FUNCTION = 'coach-agent';
export const COACH_AGENT_VENDOR = 'openai' as const;
export const COACH_AGENT_SOURCE = 'agent';
export const COACH_AGENT_LESSONS_LIMIT = 8;
export const AGENT_PING_KINDS = ['onboarding_plan', 'ask_prometheus', 'program_nl_edit', 'calorie_adjustment'] as const;
export type AgentPingKind = (typeof AGENT_PING_KINDS)[number];

const META_KEYS = [
  'drafting',
  'error',
  'agent_proposed',
  'initiated_by',
  'screen',
  'prompt',
  'context',
  'program_id',
  'source',
  'ai_off',
  'flag',
] as const;

export function isAgentPingKind(value: string): value is AgentPingKind {
  return (AGENT_PING_KINDS as readonly string[]).includes(value);
}

export function lessonSnapshot(kind: string, payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const snap: Record<string, unknown> = { kind };
  const pick = (key: string) => {
    if (root[key] !== undefined && root[key] !== null && root[key] !== '') snap[key] = root[key];
  };
  pick('title');
  pick('answer');
  pick('notes');
  pick('body');
  pick('suggestion');
  pick('observation');
  pick('cause');
  pick('program');
  pick('tracking');
  pick('patch');
  pick('nutrition');
  pick('calories');
  pick('protein');
  pick('carbs');
  pick('fat');
  return snap;
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}

export function shouldRecordLesson(
  proposed: Record<string, unknown> | null | undefined,
  accepted: Record<string, unknown> | null | undefined,
): boolean {
  const a = lessonSnapshot('', proposed);
  const b = lessonSnapshot('', accepted);
  delete a.kind;
  delete b.kind;
  if (Object.keys(a).length === 0 && Object.keys(b).length === 0) return false;
  return stableJson(a) !== stableJson(b);
}

export function lessonFromEdit(input: {
  kind: string;
  proposed: Record<string, unknown>;
  accepted: Record<string, unknown>;
  note?: string | null;
}): {
  kind: string;
  proposed: Record<string, unknown>;
  accepted: Record<string, unknown>;
  note: string | null;
} {
  return {
    kind: input.kind,
    proposed: lessonSnapshot(input.kind, input.proposed),
    accepted: lessonSnapshot(input.kind, input.accepted),
    note: input.note?.trim() || null,
  };
}

export function stripAgentMeta(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  for (const key of META_KEYS) delete next[key];
  return next;
}

export function proposedFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const stored = payload.agent_proposed;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    return stored as Record<string, unknown>;
  }
  return stripAgentMeta(payload);
}

export type CoachAgentClientOutcome =
  | { kind: 'ready'; id: string; intervention: Record<string, unknown> }
  | { kind: 'poll'; id: string | null }
  | { kind: 'error'; code: string };

export function parseCoachAgentResponse(
  body: Record<string, unknown>,
  httpStatus: number,
): CoachAgentClientOutcome {
  const errCode = typeof body.error === 'string' ? body.error : '';
  if (errCode === 'DAILY_LIMIT_REACHED' || httpStatus === 429) {
    return { kind: 'error', code: 'DAILY_LIMIT_REACHED' };
  }
  const raw = body.intervention && typeof body.intervention === 'object' && !Array.isArray(body.intervention)
    ? body.intervention as Record<string, unknown>
    : null;
  const id = typeof body.intervention_id === 'string'
    ? body.intervention_id
    : typeof raw?.id === 'string' ? raw.id : null;
  const payload = raw?.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
    ? raw.payload as Record<string, unknown>
    : null;
  const drafting = payload?.drafting === true;
  if (httpStatus === 200 && id && raw && !drafting && !errCode) {
    return { kind: 'ready', id, intervention: raw };
  }
  if (httpStatus === 202 || drafting) {
    return { kind: 'poll', id };
  }
  return { kind: 'error', code: errCode || 'ai_unavailable' };
}
