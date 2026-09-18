import type { CoachingRole } from '../../../lib/types';

/** Personal relationship only; professional capability is an independent axis. */
export function isCoachedAthlete(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
): boolean {
  return role === 'client' || !!myCoach;
}

/** A professional coach can also train Solo. */
export function isSoloAthlete(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
): boolean {
  return role !== 'client' && !myCoach;
}
