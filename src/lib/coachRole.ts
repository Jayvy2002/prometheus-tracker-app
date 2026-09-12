import type { CoachingRole } from './types';
import { resolveLegacyAccountContext } from './accountContext';

/** Compatibility helpers: preserve current gates during the capability migration. */
export function isCoachedAthlete(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
): boolean {
  return resolveLegacyAccountContext(role, myCoach).personalCoaching === 'coached';
}

/** Personal copilot remains unavailable to legacy coaches until server migration. */
export function isSoloAthlete(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
): boolean {
  return resolveLegacyAccountContext(role, myCoach).personalCoaching === 'solo';
}
