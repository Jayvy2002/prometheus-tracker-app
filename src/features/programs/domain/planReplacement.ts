/** UX19 — session substitution vs assigned-plan proposal. */

export const PROPOSE_TO_PLAN_KIND = 'program_nl_edit' as const;

/** Athlete swap / substitution writes only the logged session. */
export const ATHLETE_SWAP_TABLE = 'workout_exercises' as const;

export const ASSIGNED_PLAN_TABLES = [
  'program_days',
  'program_day_exercises',
] as const;

export function proposeToPlanKind(): typeof PROPOSE_TO_PLAN_KIND {
  return PROPOSE_TO_PLAN_KIND;
}

export function athleteSwapTouchesAssignedPlan(): false {
  return false;
}
