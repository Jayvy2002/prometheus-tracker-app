/**
 * P2.1 — persistent signal model (docs/VISION.md §8.4–8.5).
 * Pure: ownership + qualitative confidence. Never auto-applies a program or target.
 */

import {
  ATHLETE_SIGNAL_CLOSED_STATUSES,
  ATHLETE_SIGNAL_CONFIDENCE,
  ATHLETE_SIGNAL_DOMAINS,
  ATHLETE_SIGNAL_OPEN_STATUSES,
  type AthleteSignalClosedStatus,
  type AthleteSignalConfidence,
  type AthleteSignalDomain,
  type AthleteSignalOpenStatus,
} from '../types';

export {
  ATHLETE_SIGNAL_CLOSED_STATUSES,
  ATHLETE_SIGNAL_CONFIDENCE,
  ATHLETE_SIGNAL_DOMAINS,
  ATHLETE_SIGNAL_OPEN_STATUSES,
};

export function isAthleteSignalDomain(value: string): value is AthleteSignalDomain {
  return (ATHLETE_SIGNAL_DOMAINS as readonly string[]).includes(value);
}

export function isAthleteSignalConfidence(value: string): value is AthleteSignalConfidence {
  return (ATHLETE_SIGNAL_CONFIDENCE as readonly string[]).includes(value);
}

export function isOpenAthleteSignalStatus(value: string): value is AthleteSignalOpenStatus {
  return (ATHLETE_SIGNAL_OPEN_STATUSES as readonly string[]).includes(value);
}

export function isClosedAthleteSignalStatus(value: string): value is AthleteSignalClosedStatus {
  return (ATHLETE_SIGNAL_CLOSED_STATUSES as readonly string[]).includes(value);
}

/** Permissions = owner or active Coach of the athlete. Workspace never grants this. */
export function canMutateAthleteSignal(input: {
  actorId: string | null | undefined;
  athleteId: string;
  isCoachOfAthlete: boolean;
}): boolean {
  if (!input.actorId) return false;
  if (input.actorId === input.athleteId) return true;
  return input.isCoachOfAthlete;
}

export function canReadAthleteSignal(input: {
  actorId: string | null | undefined;
  athleteId: string;
  isCoachOfAthlete: boolean;
}): boolean {
  return canMutateAthleteSignal(input);
}
