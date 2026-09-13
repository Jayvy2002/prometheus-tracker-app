import type { CoachingRole } from './types';

export type AccountWorkspace = 'personal' | 'coaching';
export type PersonalCoachingState = 'solo' | 'coached' | 'unresolved';

export interface AccountSnapshot {
  userId: string;
  coachCapability: boolean;
  activeCoachId: string | null;
  legacyRole: CoachingRole;
}

/** Reject malformed, cross-account or inconsistent compatibility responses. */
export function parseAccountSnapshot(value: unknown, userId: string): AccountSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const role = row.legacy_coaching_role;
  if (row.error || row.user_id !== userId || !userId
    || typeof row.coach_capability !== 'boolean'
    || !['none', 'client', 'coach'].includes(String(role))
    || row.coach_capability !== (role === 'coach')
    || !(row.active_coach_id === null || (typeof row.active_coach_id === 'string' && row.active_coach_id.length > 0))
    || row.active_coach_id === userId) return null;
  return {
    userId,
    coachCapability: row.coach_capability,
    activeCoachId: row.active_coach_id as string | null,
    legacyRole: role as CoachingRole,
  };
}

/** Only the missing-function code permits rollout fallback, never a denied request. */
export function accountContextNotInstalled(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202';
}

type ContextReadError = { message: string; code?: string };

/** Keep rollout compatibility explicit and testable without an authenticated client. */
export async function readAccountRole(
  userId: string,
  readContext: () => PromiseLike<{ data: unknown; error: ContextReadError | null }>,
  readLegacy: () => PromiseLike<{ data: { coaching_role?: string | null } | null; error: ContextReadError | null }>,
): Promise<{
  data: { coaching_role?: string | null } | null;
  error: ContextReadError | null;
  snapshot: AccountSnapshot | null;
}> {
  const response = await readContext();
  if (accountContextNotInstalled(response.error)) return { ...await readLegacy(), snapshot: null };
  if (response.error) return { data: null, error: response.error, snapshot: null };
  const snapshot = parseAccountSnapshot(response.data, userId);
  if (!snapshot) return { data: null, error: { message: 'invalid_account_context' }, snapshot: null };
  return { data: { coaching_role: snapshot.legacyRole }, error: null, snapshot };
}

export interface AccountContext {
  ready: boolean;
  capabilities: { coach: boolean };
  personalCoaching: PersonalCoachingState;
  defaultWorkspace: AccountWorkspace;
  /** Compatibility gate until personal coach access is validated server-side. */
  personalToolsAvailable: boolean;
}

/** The snapshot resolves personal relationships without widening legacy permissions. */
export function resolveAccountContext(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
  ready: boolean,
  snapshot: AccountSnapshot | null,
): AccountContext {
  const legacy = resolveLegacyAccountContext(role, myCoach, ready);
  if (!ready || !snapshot || snapshot.legacyRole !== role) return legacy;
  return {
    ...legacy,
    personalCoaching: snapshot.activeCoachId ? 'coached'
      : role === 'client' ? 'unresolved' : 'solo',
  };
}

/**
 * Projection of the existing server-backed role, not an authorization source.
 * No UI preference grants capabilities. A legacy coach row does not tell us
 * whether that person's own athlete profile has a coach: keep it unresolved.
 * Replace this adapter with the future account-scoped server context only after
 * the permission migration. Do not manufacture a self coaching relationship.
 */
export function resolveLegacyAccountContext(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
  ready = true,
): AccountContext {
  if (!ready) {
    return {
      ready: false,
      capabilities: { coach: false },
      personalCoaching: 'unresolved',
      defaultWorkspace: 'personal',
      personalToolsAvailable: false,
    };
  }
  const coach = role === 'coach';
  return {
    ready: true,
    capabilities: { coach },
    personalCoaching: coach ? 'unresolved' : role === 'client' || !!myCoach ? 'coached' : 'solo',
    defaultWorkspace: coach ? 'coaching' : 'personal',
    personalToolsAvailable: !coach,
  };
}
