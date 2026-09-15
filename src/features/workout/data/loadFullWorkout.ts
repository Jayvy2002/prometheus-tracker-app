import { supabase } from '../../../lib/supabase';
import type { Workout, WorkoutExercise, WorkoutSet } from '../../../lib/types';

interface PreviousSet {
  weight_kg: number;
  reps: number;
  rir: number;
  set_type: string;
  order_index: number;
}

export interface ExerciseSession {
  date: string;
  sets: PreviousSet[];
}

export type { PreviousSet };

export async function loadFullWorkout(workoutId: string): Promise<Workout | null> {
  const { data: workout } = await supabase
    .from('workouts')
    .select('*')
    .eq('id', workoutId)
    .maybeSingle();
  if (!workout) return null;

  const { data: exercises } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_id', workoutId)
    .order('order_index');

  const exIds = (exercises ?? []).map(e => e.id);
  let sets: WorkoutSet[] = [];
  if (exIds.length > 0) {
    const { data: setsData } = await supabase
      .from('workout_sets')
      .select('*')
      .in('exercise_id', exIds)
      .order('order_index');
    sets = (setsData ?? []) as WorkoutSet[];
  }

  const fullExercises = (exercises ?? []).map(ex => ({
    ...ex,
    sets: sets.filter(s => s.exercise_id === ex.id),
  })) as WorkoutExercise[];

  return { ...workout, exercises: fullExercises } as Workout;
}
