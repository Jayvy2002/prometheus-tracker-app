import { useWorkoutStore } from '../stores/workoutStore';
import { localWorkoutTimestamp } from './utils';
import type { WorkoutTemplateExercise } from './types';

export interface StartWorkoutOptions {
  userId: string;
  name: string;
  routineId?: string | null;
  programAssignmentId?: string | null;
  programDayId?: string | null;
  exercises: WorkoutTemplateExercise[];
}

export async function startWorkoutFromTemplate(opts: StartWorkoutOptions): Promise<string | null> {
  const { createWorkout, addExercise, addSet, deleteWorkout } = useWorkoutStore.getState();
  let workoutId: string | null = null;
  try {
    workoutId = await createWorkout({
      user_id: opts.userId,
      name: opts.name,
      date: localWorkoutTimestamp(),
      routine_id: opts.routineId || undefined,
      program_assignment_id: opts.programAssignmentId || undefined,
      program_day_id: opts.programDayId || undefined,
    });
    if (!workoutId) return null;

    const sorted = [...opts.exercises].sort((a, b) => a.order_index - b.order_index);
    for (const ex of sorted) {
      const added = await addExercise(workoutId, ex.name, ex.order_index, {
        prescribed_sets: ex.default_sets,
        prescribed_reps: ex.default_reps,
      });
      if (added) {
        const setCount = Math.max(0, ex.default_sets || 0);
        for (let i = 0; i < setCount; i++) {
          await addSet(added.id, i);
        }
      }
    }
    return workoutId;
  } catch (err) {
    console.error('startWorkoutFromTemplate failed:', err);
    if (workoutId) await deleteWorkout(workoutId);
    return null;
  }
}
