/** A prescribed row waiting for numbers — not a finished set. */
export function isBlankWorkoutSet(set: {
  completed?: boolean | null;
  weight_kg?: number | null;
  reps?: number | null;
}): boolean {
  if (set.completed) return false;
  return (set.weight_kg ?? 0) <= 0 && (set.reps ?? 0) <= 0;
}

/**
 * Next empty row after the source. Reusing values fills that row.
 * Only when every later row is already used do we append a set.
 */
export function nextBlankSetId(
  sets: Array<{ id: string; completed?: boolean | null; weight_kg?: number | null; reps?: number | null }>,
  sourceId: string,
): string | null {
  const i = sets.findIndex(s => s.id === sourceId);
  const later = i >= 0 ? sets.slice(i + 1) : sets;
  return later.find(isBlankWorkoutSet)?.id ?? null;
}

/**
 * Fill empty gym-floor fields from last / suggested / prescribed placeholders
 * when the athlete checks the set. Only a positive number is ever copied: a
 * hint such as « kg » or an unknown « 0 » leaves the field empty.
 */
export function applySetPlaceholders(input: {
  weight: string;
  reps: string;
  duration: string;
  isIsometric: boolean;
  showLoad: boolean;
  showReps: boolean;
  weightPlaceholder: string;
  repsPlaceholder: string;
}): { weight: string; reps: string; duration: string } {
  const usable = (value: string) => parseDecimalInput(value) > 0;
  return {
    weight: input.showLoad && !usable(input.weight) && usable(input.weightPlaceholder)
      ? input.weightPlaceholder
      : input.weight,
    reps: !input.isIsometric && input.showReps && !usable(input.reps) && usable(input.repsPlaceholder)
      ? input.repsPlaceholder
      : input.reps,
    duration: input.duration,
  };
}

/** « 82,5 » and « 82.5 » are the same load. Empty or invalid is NaN. */
export function parseDecimalInput(value: string | null | undefined): number {
  const text = (value ?? '').trim().replace(',', '.');
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(text)) return Number.NaN;
  return Number.parseFloat(text);
}

/** Set drafts hold the load as typed, in the profile unit. Storage is kg. */
export function draftLoadToKg(value: string | null | undefined, unit: 'kg' | 'lbs'): number {
  const n = parseDecimalInput(value);
  if (!Number.isFinite(n)) return 0;
  return unit === 'lbs' ? Math.round((n / 2.20462) * 10) / 10 : n;
}
