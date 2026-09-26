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

type RoutineRow = {
  name: string;
  default_sets: number;
  default_reps: number;
  order_index: number;
  catalog_exercise_id?: string | null;
};

export type RoutineTemplateExercise = {
  name: string;
  default_sets: number;
  default_reps: number;
  order_index: number;
  set_type?: 'isometric';
  catalog_exercise_id?: string | null;
};

/**
 * Routine rows → session template, as the Dashboard, Workout and Routines pages
 * start them. An exercise the catalog measures in time starts as timed sets.
 */
export function routineTemplateExercises(
  exercises: ReadonlyArray<RoutineRow> | null | undefined,
  measurementOf: (catalogExerciseId: string) => string | null | undefined = () => null,
): RoutineTemplateExercise[] {
  return (exercises ?? []).map(ex => {
    const timed = ex.catalog_exercise_id ? measurementOf(ex.catalog_exercise_id) === 'time' : false;
    return {
      name: ex.name,
      default_sets: ex.default_sets,
      default_reps: ex.default_reps,
      order_index: ex.order_index,
      ...(timed ? { set_type: 'isometric' as const } : {}),
      // The session keeps the routine's catalog link (name in the app language, history).
      ...(ex.catalog_exercise_id ? { catalog_exercise_id: ex.catalog_exercise_id } : {}),
    };
  });
}
