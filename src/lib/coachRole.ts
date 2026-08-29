import type { CoachingRole } from './types';

/** Athlete with a coach: no coach-mode toggle, program create/assign, or coach library tools. */
export function isCoachedAthlete(
  role: CoachingRole,
  myCoach: { id?: string } | null | undefined,
): boolean {
  return role === 'client' || (!!myCoach && role !== 'coach');
}
