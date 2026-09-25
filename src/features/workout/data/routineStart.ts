import { useExerciseStore } from '../../../stores/exerciseStore';
import { routineTemplateExercises, type RoutineTemplateExercise } from '../domain/nextRoutine';

type RoutineRows = Parameters<typeof routineTemplateExercises>[0];

/**
 * Session template of a routine, with the catalog's measurement: a timed
 * catalog exercise (plank) starts as timed sets. The catalog is loaded once and
 * cached; if it cannot be read (offline), exercises start in reps as before.
 */
export async function routineStartExercises(exercises: RoutineRows): Promise<RoutineTemplateExercise[]> {
  const needsCatalog = (exercises ?? []).some(ex => ex.catalog_exercise_id);
  if (needsCatalog) {
    try {
      await useExerciseStore.getState().fetchExercises();
    } catch {
      // Start anyway: the measurement only picks a default set type.
    }
  }
  const measurement = new Map(useExerciseStore.getState().exercises.map(ex => [ex.id, ex.measurement]));
  return routineTemplateExercises(exercises, id => measurement.get(id));
}
