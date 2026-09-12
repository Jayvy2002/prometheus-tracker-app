import type { CoachingRole } from './types';

export type AccountWorkspace = 'personal' | 'coaching';
export type PersonalCoachingState = 'solo' | 'coached' | 'unresolved';

export interface AccountContext {
  ready: boolean;
  capabilities: { coach: boolean };
  personalCoaching: PersonalCoachingState;
  defaultWorkspace: AccountWorkspace;
  /** Compatibility gate until personal coach access is validated server-side. */
  personalToolsAvailable: boolean;
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
