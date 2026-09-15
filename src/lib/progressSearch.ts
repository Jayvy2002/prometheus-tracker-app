/** UX48 / UX49 — search lists every match; idle list may skip the already-shown top rows. */

export function listedProgressMatches<T>(matches: T[], query: string, idleSkip = 5): T[] {
  return query.trim() ? matches : matches.slice(idleSkip);
}

export type CalendarDayWorkout = {
  id: string;
  name: string;
  exerciseCount: number;
};

export function calendarDayWorkouts(
  rows: Array<{
    id: string;
    name?: string | null;
    workout_exercises?: Array<{ id: string }> | null;
  }>,
  unnamed: string,
): CalendarDayWorkout[] {
  return rows.map(row => ({
    id: row.id,
    name: row.name?.trim() || unnamed,
    exerciseCount: row.workout_exercises?.length ?? 0,
  }));
}

export function calendarDayWeights(rows: Array<{ weight_kg?: number | null }>): number[] {
  return rows
    .map(row => row.weight_kg)
    .filter((value): value is number => typeof value === 'number');
}

export function responsesHaveError(rows: Array<{ error?: { message?: string } | null }>): boolean {
  return rows.some(row => row.error != null);
}
