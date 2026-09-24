import { supabase } from '../../../lib/supabase';
import { localWorkoutTimestamp } from '../../../lib/utils';
import { isTransportError } from '../../../lib/offlineQueue';
import type { WorkoutTemplateExercise } from '../../../lib/types';

export interface StartWorkoutOptions {
  userId: string;
  name: string;
  routineId?: string | null;
  programAssignmentId?: string | null;
  programDayId?: string | null;
  exercises: WorkoutTemplateExercise[];
}

export async function startWorkoutFromTemplate(opts: StartWorkoutOptions): Promise<string | null> {
  const startedAt = localWorkoutTimestamp();
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
    const sorted = [...opts.exercises].sort((a, b) => a.order_index - b.order_index);
    const { data, error } = await supabase.rpc('start_workout_from_template', {
      p_name: opts.name,
      p_date: startedAt,
      p_routine_id: opts.routineId || null,
      p_program_assignment_id: opts.programAssignmentId || null,
      p_program_day_id: opts.programDayId || null,
      p_exercises: sorted,
    });
    if (error) throw error;
    return typeof data === 'string' ? data : null;
  } catch (err) {
    // Vision §26: no network is not a failure. The session starts locally and
    // the queue replays the server command later (idempotent on its op id).
    if (isTransportError(err)) {
      const { useWorkoutStore } = await import('../../../stores/workoutStore');
      return useWorkoutStore.getState().startTemplateOffline({
        name: opts.name,
        date: startedAt,
        routineId: opts.routineId ?? null,
        programAssignmentId: opts.programAssignmentId ?? null,
        programDayId: opts.programDayId ?? null,
        exercises: opts.exercises,
      });
    }
    console.error('startWorkoutFromTemplate failed:', err);
    return null;
  }
}
