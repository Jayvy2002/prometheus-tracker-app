import type { ProgramExerciseDraft, SetType, WorkoutTemplateExercise } from './types';

export const PROGRAM_SET_TYPES: SetType[] = [
  'warmup',
  'working',
  'drop',
  'myo',
  'tempo',
  'isometric',
  'cluster',
];

export function normalizeProgramSetType(value: string | null | undefined): SetType {
  if (value && PROGRAM_SET_TYPES.includes(value as SetType)) return value as SetType;
  return 'working';
}

export interface DropSegment {
  weight_kg: number;
  reps: number;
}

export function parseDropSegments(raw: unknown): DropSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const rec = item as { weight_kg?: unknown; reps?: unknown };
      const weight = Number(rec.weight_kg);
      const reps = Number(rec.reps);
      return {
        weight_kg: Number.isFinite(weight) ? weight : 0,
        reps: Number.isFinite(reps) ? reps : 0,
      };
    })
    .filter((row): row is DropSegment => row != null);
}

export function emptyDropSegments(count: number): DropSegment[] {
  const n = Math.max(2, Math.min(6, count || 2));
  return Array.from({ length: n }, () => ({ weight_kg: 0, reps: 0 }));
}

export function programExerciseRpcFields(ex: ProgramExerciseDraft) {
  return {
    name: ex.name,
    default_sets: ex.default_sets,
    default_reps: ex.default_reps,
    default_reps_min: ex.default_reps_min ?? null,
    default_rir: ex.default_rir ?? null,
    default_rest_seconds: ex.default_rest_seconds ?? 90,
    default_weight_kg: ex.default_weight_kg ?? null,
    set_type: normalizeProgramSetType(ex.set_type),
    superset_group: ex.superset_group ?? null,
    drop_count: ex.drop_count ?? null,
    tempo: ex.tempo ?? null,
    isometric_seconds: ex.isometric_seconds ?? null,
    cluster_rest_seconds: ex.cluster_rest_seconds ?? null,
    cluster_reps_per_burst: ex.cluster_reps_per_burst ?? null,
    myo_activation: ex.myo_activation ?? false,
  };
}

export function toWorkoutTemplateExercise(
  ex: ProgramExerciseDraft & { order_index?: number },
  orderIndex: number,
): WorkoutTemplateExercise {
  return {
    ...programExerciseRpcFields(ex),
    order_index: ex.order_index ?? orderIndex,
  };
}
