/**
 * Which unfinished session the global « Reprendre » bar offers.
 * A session left open today or yesterday is still a session in progress;
 * an older unfinished row is history, not something to resume.
 */
export type ResumableWorkout = {
  id: string;
  completed: boolean;
  date: string;
};

export function pickResumableWorkout<T extends ResumableWorkout>(
  rows: readonly T[],
  current: T | null,
  today: string,
  yesterday: string,
): T | null {
  const recent = (row: T) => !row.completed && (row.date ?? '').slice(0, 10) >= yesterday
    && (row.date ?? '').slice(0, 10) <= today;
  if (current && recent(current)) return current;
  const open = rows.filter(recent);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** A session with no logged value is discarded on leave instead of kept open. */
export function workoutHasLoggedWork(
  exercises: ReadonlyArray<{ sets?: ReadonlyArray<{ weight_kg: number; reps: number; duration_seconds?: number | null }> | null }> | null | undefined,
): boolean {
  return (exercises ?? []).some(ex =>
    (ex.sets ?? []).some(s => s.weight_kg > 0 || s.reps > 0 || (s.duration_seconds ?? 0) > 0),
  );
}
