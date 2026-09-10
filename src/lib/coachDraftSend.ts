import { formatPrescription } from './programNl';
import { resolvePatchTargets, type PatchTarget } from './programPatch';
import type {
  AiProgramDayDraft,
  CoachInterventionKind,
  Program,
  ProgramExerciseDraft,
  ProgramExercisePatch,
} from './types';

export const PROGRAM_SEND_KINDS: CoachInterventionKind[] = [
  'onboarding_plan',
  'ask_prometheus',
  'program_nl_edit',
  'program_adjustment',
];

export function isProgramSendKind(kind: CoachInterventionKind): boolean {
  return PROGRAM_SEND_KINDS.includes(kind);
}

export interface EditedProgramDraft {
  programName: string;
  programDesc: string;
  programWeeks: number;
  days: AiProgramDayDraft[];
  patch: ProgramExercisePatch | null;
}

export function outlineFromEdited(edited: EditedProgramDraft) {
  const name = edited.programName.trim();
  if (!name || edited.days.length === 0) return null;
  const hasLifts = edited.days.some(d => d.exercises.some(ex => ex.name.trim()));
  if (!hasLifts) return null;
  return {
    name,
    description: edited.programDesc,
    duration_weeks: edited.programWeeks,
    days: edited.days,
  };
}

/** Payload written on send — always the edited screen values, never the raw agent blob. */
export function editedProgramPayload(
  raw: Record<string, unknown>,
  edited: EditedProgramDraft,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  delete next.drafting;
  const outline = outlineFromEdited(edited);
  if (outline) {
    next.program = outline;
    next.name = outline.name;
    next.description = outline.description;
    next.duration_weeks = outline.duration_weeks;
    next.days = outline.days;
  }
  if (edited.patch) {
    next.patch = { ...edited.patch };
  }
  return next;
}

export function findCurrentExercise(
  program: Program | null | undefined,
  patch: ProgramExercisePatch | null,
): ProgramExerciseDraft | null {
  // I02 : l'aperçu utilise le MÊME résolveur que l'application.
  const resolution = resolvePatchTargets(program, patch);
  if (resolution.status !== 'ok') return null;
  const ex = resolution.targets[0].exercise;
  return {
    name: ex.name,
    default_sets: ex.default_sets,
    default_reps: ex.default_reps,
    default_reps_min: ex.default_reps_min,
    default_rir: ex.default_rir,
    default_rest_seconds: ex.default_rest_seconds,
  };
}

export interface PatchPreviewTarget {
  target: PatchTarget;
  before: string;
  after: string;
  afterName: string;
}

/**
 * I02 : TOUTES les cibles du patch, pas seulement la première — l'action
 * affichée est exactement l'action appliquée (ou l'ambiguïté est déclarée).
 */
export function patchPreviewTargets(
  program: Program | null | undefined,
  patch: ProgramExercisePatch | null,
): { status: 'ok' | 'ambiguous' | 'not_found'; previews: PatchPreviewTarget[] } {
  if (!patch?.exercise) return { status: 'not_found', previews: [] };
  const resolution = resolvePatchTargets(program, patch);
  if (resolution.status === 'not_found') return { status: 'not_found', previews: [] };
  const previews = resolution.targets.map(target => {
    const current: ProgramExerciseDraft = {
      name: target.exercise.name,
      default_sets: target.exercise.default_sets,
      default_reps: target.exercise.default_reps,
      default_reps_min: target.exercise.default_reps_min,
      default_rir: target.exercise.default_rir,
      default_rest_seconds: target.exercise.default_rest_seconds,
    };
    const after = draftFromPatch(current, patch);
    return {
      target,
      before: formatPrescription(current),
      after: formatPrescription(after),
      afterName: after.name,
    };
  });
  return { status: resolution.status, previews };
}

function draftFromPatch(
  current: ProgramExerciseDraft | null,
  patch: ProgramExercisePatch,
): ProgramExerciseDraft {
  return {
    name: patch.replace_with?.trim() || current?.name || patch.exercise,
    default_sets: patch.default_sets ?? current?.default_sets ?? 3,
    default_reps: patch.default_reps ?? current?.default_reps ?? 10,
    default_reps_min: patch.default_reps_min === undefined ? current?.default_reps_min ?? null : patch.default_reps_min,
    default_rir: patch.default_rir === undefined ? current?.default_rir ?? null : patch.default_rir,
    default_rest_seconds: patch.default_rest_seconds ?? current?.default_rest_seconds ?? 90,
  };
}

export function patchBeforeAfter(
  program: Program | null | undefined,
  patch: ProgramExercisePatch | null,
): { exercise: string; before: string; after: string } | null {
  if (!patch?.exercise) return null;
  const current = findCurrentExercise(program, patch);
  const after = draftFromPatch(current, patch);
  return {
    exercise: after.name,
    before: current ? formatPrescription(current) : '—',
    after: formatPrescription(after),
  };
}

export function outlineBeforeAfter(
  current: Program | null | undefined,
  edited: EditedProgramDraft,
): { before: string; after: string } {
  const outline = outlineFromEdited(edited);
  const afterLifts = outline ? outline.days.reduce((n, d) => n + d.exercises.length, 0) : 0;
  const currentDays = current?.days?.length ?? 0;
  return {
    before: current?.name ? `${current.name} · ${currentDays}j` : '—',
    after: outline ? `${outline.name} · ${outline.days.length}j · ${afterLifts} ex` : '—',
  };
}

export function canSendProgramToClient(edited: EditedProgramDraft): boolean {
  if (edited.patch && edited.patch.exercise.trim()) return true;
  return outlineFromEdited(edited) != null;
}

export function clientWillSeeSummary(
  edited: EditedProgramDraft,
  currentProgram: Program | null | undefined,
): string {
  if (edited.patch) {
    const preview = patchBeforeAfter(currentProgram, edited.patch);
    return preview ? `${preview.exercise} ${preview.after}` : edited.patch.exercise;
  }
  return outlineFromEdited(edited)?.name ?? '';
}

export type CalorieTargetsLine = {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
};

export function formatCalorieLine(targets: CalorieTargetsLine | null | undefined): string {
  const kcal = targets?.calories;
  if (kcal == null || !Number.isFinite(kcal) || kcal <= 0) return '—';
  const parts = [`${Math.round(kcal)} kcal`];
  const protein = targets?.protein;
  const carbs = targets?.carbs;
  const fat = targets?.fat;
  const macros: string[] = [];
  if (protein != null && Number.isFinite(protein) && protein > 0) macros.push(`P${Math.round(protein)}`);
  if (carbs != null && Number.isFinite(carbs) && carbs > 0) macros.push(`C${Math.round(carbs)}`);
  if (fat != null && Number.isFinite(fat) && fat > 0) macros.push(`F${Math.round(fat)}`);
  if (macros.length) parts.push(macros.join(' '));
  return parts.join(' · ');
}

export function calorieBeforeAfter(
  current: CalorieTargetsLine | null | undefined,
  draft: CalorieTargetsLine,
): { before: string; after: string } {
  return {
    before: formatCalorieLine(current),
    after: formatCalorieLine(draft),
  };
}

/** Relancer: observation (pourquoi) vs message préparé (ce que le client verra). */
export function relanceBeforeAfter(
  observation: string,
  preparedMessage: string,
): { before: string; after: string } {
  return {
    before: observation.trim() || '—',
    after: preparedMessage.trim() || '—',
  };
}

export function outlineFromProgram(program: Program): {
  name: string;
  description: string;
  duration_weeks: number;
  days: AiProgramDayDraft[];
} {
  return {
    name: program.name,
    description: program.description ?? '',
    duration_weeks: program.duration_weeks ?? 8,
    days: [...(program.days ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map(d => ({
        weekday: d.weekday,
        name: d.name,
        exercises: (d.exercises ?? []).map(ex => ({
          name: ex.name,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_reps_min: ex.default_reps_min,
          default_rir: ex.default_rir,
          default_rest_seconds: ex.default_rest_seconds,
          default_weight_kg: ex.default_weight_kg,
        })),
      })),
  };
}
