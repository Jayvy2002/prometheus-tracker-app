import type { CoachingRole } from '../../../lib/types';

/** Athlete with a coach: no coach-mode toggle, program create/assign, or coach library tools. */
export function isCoachedAthlete(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
): boolean {
  return role === 'client' || (!!myCoach && role !== 'coach');
}

/** Solo athlete: own copilot, no live coach. Coaches and coached athletes are out. */
export function isSoloAthlete(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
): boolean {
  return role === 'none' && !myCoach;
}
