import type { ProgramExerciseDraft, SetType, WorkoutExercise, WorkoutTemplateExercise } from '../../../lib/types';

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

/** Séance libre → jour de plan : les types du logger (lot 14) suivent. */
export function workoutExerciseToPlanDraft(ex: WorkoutExercise): ProgramExerciseDraft {
  const sets = ex.sets ?? [];
  const sample = sets.find(s => s.set_type && s.set_type !== 'warmup') ?? sets[0];
  const drop = sets.find(s => s.set_type === 'drop');
  const dropSegs = drop ? parseDropSegments(drop.drop_segments) : [];
  return {
    name: ex.name,
    default_sets: Math.max(1, ex.prescribed_sets ?? (sets.length || 3)),
    default_reps: ex.prescribed_reps ?? (sample && sample.reps > 0 ? sample.reps : 8),
    default_rir: ex.prescribed_rir ?? sample?.rir ?? null,
    default_rest_seconds: ex.prescribed_rest_seconds ?? 90,
    default_weight_kg: ex.prescribed_weight_kg ?? (sample && sample.weight_kg > 0 ? sample.weight_kg : null),
    set_type: normalizeProgramSetType(sample?.set_type),
    superset_group: ex.superset_group_id,
    drop_count: drop ? Math.max(2, dropSegs.length || 2) : null,
    tempo: sample?.tempo ?? null,
    isometric_seconds: sample?.set_type === 'isometric' ? (sample.duration_seconds ?? null) : null,
    cluster_rest_seconds: sample?.cluster_rest_seconds ?? null,
    cluster_reps_per_burst: sample?.cluster_reps_per_burst ?? null,
    myo_activation: sets.some(s => s.myo_is_activation),
  };
}
