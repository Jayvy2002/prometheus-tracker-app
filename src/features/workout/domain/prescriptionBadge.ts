/**
 * The prescription under an exercise name, as parts the screen translates:
 * « 4 × 10 · repos 1 min 30 · RIR 0 ». Only what is known and visible shows.
 */

export interface PrescriptionFields {
  sets?: number | null;
  reps?: number | null;
  repsMin?: number | null;
  rir?: number | null;
  restSeconds?: number | null;
  weightKg?: number | null;
  /** A timed hold: its reps are not a target (the duration is on each set). */
  timed?: boolean;
}

export interface PrescriptionVisibility {
  sets: boolean;
  /** Same modes as the tracking config (`repsInputMode`). */
  reps: 'hidden' | 'single' | 'range' | 'either';
  load: boolean;
  rir: boolean;
  rest: boolean;
}

export type PrescriptionPart =
  | { key: 'setsReps'; params: { sets: number; reps: string } }
  | { key: 'setsOnly'; params: { count: number } }
  | { key: 'repsOnly'; params: { reps: string } }
  | { key: 'load'; params: { kg: number } }
  | { key: 'restMinSec'; params: { min: number; sec: string } }
  | { key: 'restMin'; params: { min: number } }
  | { key: 'restSec'; params: { sec: number } }
  | { key: 'rir'; params: { rir: number } };

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** 90 → { min: 1, sec: '30' } ; 120 → { min: 2 } ; 45 → { sec: 45 }. */
export function restPart(seconds: number | null | undefined): PrescriptionPart | null {
  const total = positive(seconds);
  if (total == null) return null;
  const rounded = Math.round(total);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  if (min === 0) return { key: 'restSec', params: { sec } };
  if (sec === 0) return { key: 'restMin', params: { min } };
  return { key: 'restMinSec', params: { min, sec: String(sec).padStart(2, '0') } };
}

export function prescriptionBadgeParts(
  fields: PrescriptionFields,
  visible: PrescriptionVisibility,
): PrescriptionPart[] {
  const parts: PrescriptionPart[] = [];
  const sets = visible.sets ? positive(fields.sets) : null;
  const top = positive(fields.reps);
  const min = positive(fields.repsMin);
  let reps: string | null = null;
  if (visible.reps !== 'hidden' && !fields.timed && top != null) {
    reps = visible.reps !== 'single' && min != null && min < top ? `${min}–${top}` : String(top);
  }
  if (sets != null && reps != null) parts.push({ key: 'setsReps', params: { sets, reps } });
  else if (sets != null) parts.push({ key: 'setsOnly', params: { count: sets } });
  else if (reps != null) parts.push({ key: 'repsOnly', params: { reps } });

  const load = visible.load ? positive(fields.weightKg) : null;
  if (load != null) parts.push({ key: 'load', params: { kg: load } });

  const rest = visible.rest ? restPart(fields.restSeconds) : null;
  if (rest) parts.push(rest);

  // RIR 0 is a real target (to failure); only an absent RIR is skipped.
  const rir = fields.rir;
  if (visible.rir && typeof rir === 'number' && Number.isFinite(rir) && rir >= 0) {
    parts.push({ key: 'rir', params: { rir } });
  }
  return parts;
}
