import { repsInputMode, showTrainingField, type ResolvedTrackingConfig } from '../../../lib/clientTracking';
import { normalizeProgramSetType } from './programSetPrescription';
import type { ProgramExerciseDraft } from '../types';

/**
 * The one-line reading of an exercise in the program editor
 * (« 4 × 10 · repos 90 s · RIR 2 »). Only the fields the client's tracking
 * shows; translated by the caller (`programs.summary.*`, `options.setTypes.*`).
 */
export interface SummaryPart {
  key: string;
  params?: Record<string, string | number>;
}

export function exerciseSummaryParts(
  ex: ProgramExerciseDraft,
  tracking: ResolvedTrackingConfig,
): SummaryPart[] {
  const parts: SummaryPart[] = [];
  const mode = repsInputMode(tracking);
  const setsOn = showTrainingField(tracking, 'sets');
  const reps = mode === 'hidden'
    ? ''
    : (mode !== 'single' && ex.default_reps_min && ex.default_reps_min !== ex.default_reps
      ? `${ex.default_reps_min}–${ex.default_reps}`
      : String(ex.default_reps));
  if (setsOn && reps) parts.push({ key: 'programs.summary.setsReps', params: { sets: ex.default_sets, reps } });
  else if (setsOn) parts.push({ key: 'programs.summary.sets', params: { count: ex.default_sets } });
  else if (reps) parts.push({ key: 'programs.summary.reps', params: { reps } });
  if (showTrainingField(tracking, 'load') && ex.default_weight_kg != null && ex.default_weight_kg > 0) {
    parts.push({ key: 'programs.summary.load', params: { kg: ex.default_weight_kg } });
  }
  if (showTrainingField(tracking, 'rest') && ex.default_rest_seconds != null) {
    parts.push({ key: 'programs.summary.rest', params: { n: ex.default_rest_seconds } });
  }
  if (showTrainingField(tracking, 'rir') && ex.default_rir != null) {
    parts.push({ key: 'programs.summary.rir', params: { n: ex.default_rir } });
  }
  const setType = normalizeProgramSetType(ex.set_type);
  // Same labels as the « Type » select (options.setTypes.*).
  if (setType !== 'working') parts.push({ key: `options.setTypes.${setType}` });
  return parts;
}
