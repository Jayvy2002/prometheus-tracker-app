import { supabase } from '../../../lib/supabase';
import { localWorkoutTimestamp } from '../../../lib/utils';
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
  try {
    const sorted = [...opts.exercises].sort((a, b) => a.order_index - b.order_index);
    const { data, error } = await supabase.rpc('start_workout_from_template', {
      p_name: opts.name,
      p_date: localWorkoutTimestamp(),
      p_routine_id: opts.routineId || null,
      p_program_assignment_id: opts.programAssignmentId || null,
      p_program_day_id: opts.programDayId || null,
      p_exercises: sorted,
    });
    if (error) throw error;
    return typeof data === 'string' ? data : null;
  } catch (err) {
    console.error('startWorkoutFromTemplate failed:', err);
    return null;
  }
}
