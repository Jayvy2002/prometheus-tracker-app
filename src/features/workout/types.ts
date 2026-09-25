/** Contrats séance / exo / routine — lot 22a. */
import type { SetType } from '../../shared/types';

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  date: string;
  duration_seconds: number;
  notes: string;
  completed: boolean;
  routine_id?: string | null;
  session_started_at?: string | null;
  program_assignment_id?: string | null;
  program_day_id?: string | null;
  program_phase_id?: string | null;
  prescribed_phase_name?: string | null;
  program_revision_no?: number | null;
  program_id?: string | null;
  exercises?: WorkoutExercise[];
  created_at: string;
  updated_at: string;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  name: string;
  order_index: number;
  notes: string;
  superset_group_id: string | null;
  prescribed_sets?: number | null;
  prescribed_reps?: number | null;
  prescribed_reps_min?: number | null;
  prescribed_rir?: number | null;
  prescribed_rest_seconds?: number | null;
  prescribed_weight_kg?: number | null;
  prescription_source?: 'program' | 'user';
  catalog_exercise_id?: string | null;
  sets?: WorkoutSet[];
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_type: SetType;
  weight_kg: number;
  reps: number;
  rir: number;
  completed: boolean;
  order_index: number;
  duration_seconds: number | null;
  tempo: string | null;
  cluster_rest_seconds: number | null;
  cluster_reps_per_burst: number | null;
  myo_is_activation: boolean;
  drop_percentage: number | null;
  drop_segments?: Array<{ weight_kg: number; reps: number }> | null;
  created_at: string;
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description: string;
  scheduled_days?: string[] | null;
  exercises?: RoutineExercise[];
  created_at: string;
  updated_at: string;
}

export interface RoutineExercise {
  id: string;
  routine_id: string;
  name: string;
  default_sets: number;
  default_reps: number;
  default_rest_seconds: number;
  order_index: number;
  notes: string;
  catalog_exercise_id?: string | null;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  name_fr: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  category: string;
  equipment: string;
  instructions: string;
  tips: string;
  difficulty: string;
  verified: boolean;
  created_by: string | null;
  created_at: string;
  video_url: string | null;
  aliases?: string[];
  merged_into_id?: string | null;
  /** How the catalog measures it: reps (default) or time (a hold in seconds). */
  measurement?: ExerciseMeasurement;
}

export type ExerciseMeasurement = 'reps' | 'time';

export type ExerciseRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected';

export interface ExerciseRequest {
  id: string;
  user_id: string;
  name: string;
  muscles: string;
  description: string;
  status: ExerciseRequestStatus;
  result_exercise_id: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
}
