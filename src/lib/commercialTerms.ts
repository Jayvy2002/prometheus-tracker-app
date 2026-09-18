/**
 * Commercial durations (docs/VISION.md §28, P1.5).
 * Unique TypeScript source for Solo trial and Coach grace.
 * Final prices are undecided — do not invent them. Billing wall / entitlements are P6.
 */

export const SOLO_TRIAL_DAYS = 14;
export const COACH_GRACE_DAYS = 7;

/** Explicit product decision: no invented price, quota, or billed amount. */
export const COMMERCIAL_PRICES = { status: 'undecided' } as const;

const MS_PER_DAY = 86_400_000;

export function addCalendarDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

export function soloTrialEndsAt(from: Date = new Date()): Date {
  return addCalendarDays(from, SOLO_TRIAL_DAYS);
}

export function coachGraceEndsAt(from: Date = new Date()): Date {
  return addCalendarDays(from, COACH_GRACE_DAYS);
}
