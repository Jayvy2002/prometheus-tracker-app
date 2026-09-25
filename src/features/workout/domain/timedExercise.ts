import { SET_TYPES } from '../../../lib/constants';
import type { SetType } from '../../../lib/types';

/**
 * A timed hold is known only from data: the set type « isometric », prescribed
 * by the plan (program set type), chosen by the athlete, or given to new sets
 * because the catalog measures the exercise in time. The exercise name is never
 * used to guess it: the same core exercise can be logged in reps by someone else.
 */
type SetLike = { set_type?: string | null; weight_kg?: number | null };

export function isTimedExercise(sets: SetLike[] | null | undefined): boolean {
  const rows = sets ?? [];
  return rows.length > 0 && rows.every(s => s.set_type === 'isometric');
}

/** What the reps column holds for this exercise. */
export function repsColumnKind(sets: SetLike[] | null | undefined): 'reps' | 'duration' | 'mixed' {
  const rows = sets ?? [];
  if (isTimedExercise(rows)) return 'duration';
  return rows.some(s => s.set_type === 'isometric') ? 'mixed' : 'reps';
}

/**
 * A timed exercise shows a load column only when a load is actually known
 * (prescribed, or already entered on a set). Otherwise the row is just time.
 */
export function timedExerciseShowsLoad(exercise: {
  prescribed_weight_kg?: number | null;
  sets?: SetLike[] | null;
}): boolean {
  if (!isTimedExercise(exercise.sets)) return true;
  if ((exercise.prescribed_weight_kg ?? 0) > 0) return true;
  return (exercise.sets ?? []).some(s => (s.weight_kg ?? 0) > 0);
}

const KNOWN_SET_TYPES = new Set<string>(SET_TYPES.map(s => s.value));

/**
 * The set type worth naming in a readout: nothing for a working set, nothing
 * for a value the app does not know (legacy « normal »…), the type otherwise.
 */
export function namedSetType(value: string | null | undefined): SetType | null {
  if (!value || value === 'working') return null;
  return KNOWN_SET_TYPES.has(value) ? (value as SetType) : null;
}

/**
 * The set type of a new set: a timed hold stays timed (every set already is,
 * or the catalog measures the exercise in time). Otherwise nothing is forced
 * and the database default applies.
 */
export function newSetTypeFor(
  sets: SetLike[] | null | undefined,
  catalogMeasurement?: string | null,
): 'isometric' | null {
  if ((sets ?? []).length > 0) return isTimedExercise(sets) ? 'isometric' : null;
  return catalogMeasurement === 'time' ? 'isometric' : null;
}
