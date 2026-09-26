import type { SetType, WorkoutTemplateExercise } from '../../../lib/types';
import type { Workout, WorkoutExercise, WorkoutSet } from '../types';
import { offlineTempId } from '../data/offlineIds';

/**
 * Vision §26 — a session started offline. The server command
 * `start_workout_from_template_op` is replayed later; it creates the same
 * exercises and sets in the same order, so each temporary id below maps to
 * exactly one server id (see `mapOfflineStartShape`).
 */

export function offlineStartExerciseId(opId: string, index: number): string {
  return offlineTempId(`${opId}.e${index}`);
}

export function offlineStartSetId(opId: string, exerciseIndex: number, setIndex: number): string {
  return offlineTempId(`${opId}.e${exerciseIndex}.s${setIndex}`);
}

/** Same set count rule as the server: default 3, bounded 1–20. */
export function templateSetCount(exercise: Pick<WorkoutTemplateExercise, 'default_sets'>): number {
  const n = Number(exercise.default_sets ?? 3);
  if (!Number.isFinite(n)) return 3;
  return Math.min(20, Math.max(1, Math.round(n)));
}

/** Same ordering as the server: order_index, then template position. */
export function orderedTemplate(exercises: WorkoutTemplateExercise[]): WorkoutTemplateExercise[] {
  return exercises
    .map((exercise, position) => ({ exercise, position }))
    .sort((a, b) => (a.exercise.order_index ?? a.position) - (b.exercise.order_index ?? b.position) || a.position - b.position)
    .map(({ exercise }) => exercise);
}

export interface OfflineStartInput {
  opId: string;
  userId: string;
  name: string;
  date: string;
  routineId?: string | null;
  programAssignmentId?: string | null;
  programDayId?: string | null;
  exercises: WorkoutTemplateExercise[];
}

/** The local session the athlete logs into while offline. */
export function buildOfflineStartedWorkout(input: OfflineStartInput): Workout {
  const now = new Date().toISOString();
  const workoutId = offlineTempId(input.opId);
  const exercises: WorkoutExercise[] = orderedTemplate(input.exercises).map((template, i) => {
    const exerciseId = offlineStartExerciseId(input.opId, i);
    const setType = (template.set_type && template.set_type !== 'superset' ? template.set_type : 'working') as SetType;
    const sets: WorkoutSet[] = Array.from({ length: templateSetCount(template) }, (_, j) => ({
      id: offlineStartSetId(input.opId, i, j),
      exercise_id: exerciseId,
      set_type: setType,
      weight_kg: 0,
      reps: 0,
      rir: 0,
      completed: false,
      order_index: j,
      duration_seconds: null,
      tempo: null,
      cluster_rest_seconds: null,
      cluster_reps_per_burst: null,
      myo_is_activation: false,
      drop_percentage: null,
      created_at: now,
    }));
    return {
      id: exerciseId,
      workout_id: workoutId,
      name: template.name.trim(),
      order_index: template.order_index ?? i,
      notes: '',
      superset_group_id: template.superset_group ?? null,
      prescribed_sets: templateSetCount(template),
      prescribed_reps: template.default_reps ?? 0,
      prescribed_reps_min: template.default_reps_min ?? null,
      prescribed_rir: template.default_rir ?? null,
      prescribed_rest_seconds: template.default_rest_seconds ?? null,
      prescribed_weight_kg: template.default_weight_kg ?? null,
      prescription_source: input.programDayId ? 'program' : 'user',
      catalog_exercise_id: template.catalog_exercise_id ?? null,
      sets,
      created_at: now,
    };
  });
  return {
    id: workoutId,
    user_id: input.userId,
    name: input.name.trim(),
    date: input.date,
    duration_seconds: 0,
    notes: '',
    completed: false,
    routine_id: input.routineId ?? null,
    program_assignment_id: input.programAssignmentId ?? null,
    program_day_id: input.programDayId ?? null,
    exercises,
    created_at: now,
    updated_at: now,
  };
}

export interface OfflineStartShape {
  workout_id: string;
  exercises: Array<{ id: string; order_index: number; sets: string[] }>;
}

/**
 * Temporary → server ids after the replay. A temporary exercise or set with no
 * server twin (the plan changed while offline) is left unmapped: its later
 * edits fail loudly into the dead-letter queue instead of landing elsewhere.
 */
export function mapOfflineStartShape(opId: string, shape: OfflineStartShape): Array<[string, string]> {
  const pairs: Array<[string, string]> = [[offlineTempId(opId), shape.workout_id]];
  (shape.exercises ?? []).forEach((exercise, i) => {
    pairs.push([offlineStartExerciseId(opId, i), exercise.id]);
    (exercise.sets ?? []).forEach((setId, j) => {
      pairs.push([offlineStartSetId(opId, i, j), setId]);
    });
  });
  return pairs;
}
