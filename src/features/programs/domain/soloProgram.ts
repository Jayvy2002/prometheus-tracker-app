import {
  outlineBeforeAfter,
  outlineFromEdited,
  patchBeforeAfter,
  type EditedProgramDraft,
} from '../../../lib/coachDraftSend';
import {
  parseProgramOutline,
  parseProgramPatch,
  parseTalkingPoints,
} from '../../../lib/coachInterventions';
import type { AiProgramDayDraft, CoachIntervention, Program, ProgramDay } from '../../../lib/types';

export function emptyProgramDraftDay(weekday: number | null = 1): AiProgramDayDraft {
  return { weekday, name: '', exercises: [] };
}

/** Assigned program days → the same draft shape the session editor / copilot outline use. */
export function programDaysToDraft(days: ProgramDay[] | undefined | null): AiProgramDayDraft[] {
  const sorted = [...(days ?? [])].sort((a, b) => a.order_index - b.order_index);
  if (sorted.length === 0) return [emptyProgramDraftDay()];
  return sorted.map(d => ({
    id: d.id,
    weekday: d.weekday,
    name: d.name,
    exercises: [...(d.exercises ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map(ex => ({
        name: ex.name,
        default_sets: ex.default_sets,
        default_reps: ex.default_reps,
        default_reps_min: ex.default_reps_min,
        default_rir: ex.default_rir,
        default_rest_seconds: ex.default_rest_seconds,
        default_weight_kg: ex.default_weight_kg,
      })),
  }));
}

export const SOLO_PROGRAM_KINDS = ['onboarding_plan', 'program_nl_edit'] as const;

export function isSoloProgramKind(kind: string): boolean {
  return (SOLO_PROGRAM_KINDS as readonly string[]).includes(kind);
}

/** Pending drafts the solo may accept or refuse — never a coached athlete's coach-inbox cards. */
export function pendingSoloProgramDraft(
  rows: CoachIntervention[],
  userId: string | null | undefined,
): CoachIntervention | null {
  if (!userId) return null;
  return rows.find(row =>
    row.status === 'pending'
    && row.coach_id === userId
    && row.client_id === userId
    && isSoloProgramKind(row.kind),
  ) ?? null;
}

export function soloDraftEdited(row: CoachIntervention): EditedProgramDraft {
  const outline = parseProgramOutline(row.payload);
  return {
    programName: outline?.name ?? '',
    programDesc: outline?.description ?? '',
    programWeeks: outline?.duration_weeks ?? 8,
    days: outline?.days ?? [],
    patch: parseProgramPatch(row.payload),
  };
}

export function soloDraftWhy(row: CoachIntervention): string {
  const notes = parseTalkingPoints(row.payload, row.rationale);
  return notes.trim() || row.rationale.trim();
}

export function soloDraftCompare(
  row: CoachIntervention,
  current: Program | null | undefined,
): { before: string; after: string; exercise?: string } | null {
  const edited = soloDraftEdited(row);
  if (edited.patch) {
    const preview = patchBeforeAfter(current, edited.patch);
    return preview;
  }
  if (!outlineFromEdited(edited)) return null;
  return outlineBeforeAfter(current, edited);
}
