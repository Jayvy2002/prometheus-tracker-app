import type { AiProgramDayDraft, ProgramExerciseDraft, ProgramExercisePatch } from './types';

/** Structured before/after helper. Not a copilot: coach-agent drafts NL edits; this only applies a confirmed proposal in the editor. */

export interface ProgramNlProposal {
  raw: string;
  patch: ProgramExercisePatch;
  before: ProgramExerciseDraft | null;
  after: ProgramExerciseDraft;
  dayIndex: number;
  exerciseIndex: number;
  weekday: number;
  summaryKey: string;
  summaryParams: Record<string, string | number>;
}


export function applyProgramProposal(days: AiProgramDayDraft[], proposal: ProgramNlProposal): AiProgramDayDraft[] {
  return days.map((d, di) => {
    if (di !== proposal.dayIndex) return d;
    return {
      ...d,
      exercises: d.exercises.map((ex, ei) => (ei === proposal.exerciseIndex ? proposal.after : ex)),
    };
  });
}

export function formatPrescription(ex: ProgramExerciseDraft): string {
  const reps = ex.default_reps_min && ex.default_reps_min !== ex.default_reps
    ? `${ex.default_reps_min}–${ex.default_reps}`
    : String(ex.default_reps);
  const rir = ex.default_rir != null ? ` RIR${ex.default_rir}` : '';
  return `${ex.default_sets}×${reps}${rir}`;
}
