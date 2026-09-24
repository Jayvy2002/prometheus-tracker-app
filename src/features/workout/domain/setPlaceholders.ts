/**
 * What an empty set row proposes before the athlete types. The value is the one
 * a single tap on « Valider » records (`applySetPlaceholders`), so it must be a
 * real number the athlete can expect: never a 0 made up for an unknown value.
 */

/** A positive, finite number — anything else is « not known ». */
function known(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The prescription describes working sets. A warm-up or a myo-rep mini-set is
 * never pre-filled with it: one tap would log the working target on it.
 */
export function prescriptionAppliesToSet(set: {
  set_type?: string | null;
  myo_is_activation?: boolean | null;
}): boolean {
  if (set.set_type === 'warmup') return false;
  if (set.set_type === 'myo' && !set.myo_is_activation) return false;
  return true;
}

/**
 * Reps: the matching set of the last session first, then the prescription
 * (the top of a « 8–10 » range). Nothing known → null.
 */
export function placeholderReps(input: {
  previousReps?: number | null;
  prescribedReps?: number | null;
  prescribedRepsMin?: number | null;
  usePrescription?: boolean;
}): number | null {
  const previous = known(input.previousReps);
  if (previous != null) return Math.round(previous);
  if (input.usePrescription === false) return null;
  const top = Math.max(known(input.prescribedReps) ?? 0, known(input.prescribedRepsMin) ?? 0);
  return top > 0 ? Math.round(top) : null;
}

/**
 * Load in kg: the suggestion drawn from history, then the matching set of the
 * last session, then the prescribed load. Nothing known → null.
 */
export function placeholderLoadKg(input: {
  suggestedKg?: number | null;
  previousKg?: number | null;
  prescribedKg?: number | null;
  usePrescription?: boolean;
}): number | null {
  const fromHistory = known(input.suggestedKg) ?? known(input.previousKg);
  if (fromHistory != null) return fromHistory;
  if (input.usePrescription === false) return null;
  return known(input.prescribedKg);
}
