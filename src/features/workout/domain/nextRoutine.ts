/**
 * The routine a Solo is offered next — same rule as the Dashboard hero: the one
 * scheduled today, otherwise the first; nothing once today's session is done.
 */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function weekdayKey(weekday: number): string {
  return WEEKDAYS[((weekday % 7) + 7) % 7];
}

export function pickNextRoutine<T extends { scheduled_days?: string[] | null }>(
  routines: readonly T[],
  todayWeekday: number,
  alreadyTrainedToday: boolean,
): { routine: T; scheduledToday: boolean } | null {
  if (alreadyTrainedToday || routines.length === 0) return null;
  const today = weekdayKey(todayWeekday);
  const scheduled = routines.find(r => r.scheduled_days?.includes(today));
  if (scheduled) return { routine: scheduled, scheduledToday: true };
  return { routine: routines[0], scheduledToday: false };
}

/** Routine rows → session template, as the Dashboard and Routines page start them. */
export function routineTemplateExercises(
  exercises: ReadonlyArray<{ name: string; default_sets: number; default_reps: number; order_index: number }> | null | undefined,
): Array<{ name: string; default_sets: number; default_reps: number; order_index: number }> {
  return (exercises ?? []).map(ex => ({
    name: ex.name,
    default_sets: ex.default_sets,
    default_reps: ex.default_reps,
    order_index: ex.order_index,
  }));
}
