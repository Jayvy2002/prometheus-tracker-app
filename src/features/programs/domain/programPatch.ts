import { foldText } from '../../../lib/coachText';
import type { Program, ProgramDay, ProgramDayExercise, ProgramExercisePatch } from '../../../lib/types';

export interface PatchTarget {
  dayId: string;
  dayWeekday: number | null;
  dayName: string;
  exerciseId: string;
  exercise: ProgramDayExercise;
}

export type PatchResolution =
  | { status: 'ok'; targets: [PatchTarget] }
  | { status: 'not_found'; targets: [] }
  | { status: 'ambiguous'; targets: PatchTarget[] };

/**
 * I02 — résolveur UNIQUE de patch (aperçu ET application partagent cette fonction).
 * Priorité : IDs exacts > jour explicite + nom > nom seul.
 * Un nom seul qui matche plusieurs exercices/jours est AMBIGU : on refuse de
 * deviner (pas de modification multi-jours silencieuse), le coach précise.
 */
export function resolvePatchTargets(
  program: Program | null | undefined,
  patch: ProgramExercisePatch | null,
): PatchResolution {
  if (!program || !patch?.exercise?.trim()) return { status: 'not_found', targets: [] };
  const days = program.days ?? [];
  const want = foldText(patch.exercise);

  // 1. IDs exacts (émis par l'agent quand le programme courant les expose).
  if (patch.exercise_id) {
    for (const day of days) {
      if (patch.program_day_id && day.id !== patch.program_day_id) continue;
      const ex = (day.exercises ?? []).find(e => e.id === patch.exercise_id);
      if (ex) return { status: 'ok', targets: [toTarget(day, ex)] };
    }
    return { status: 'not_found', targets: [] };
  }

  // 2. Jour explicite (ID ou weekday) + nom.
  const scoped = patch.program_day_id
    ? days.filter(d => d.id === patch.program_day_id)
    : patch.weekday != null
      ? days.filter(d => d.weekday === patch.weekday)
      : days;
  const pool = scoped.length > 0 || patch.program_day_id || patch.weekday != null ? scoped : days;
  const matches: PatchTarget[] = [];
  const exact: PatchTarget[] = [];
  for (const day of pool) {
    for (const ex of day.exercises ?? []) {
      const name = foldText(ex.name);
      if (!name || !want) continue;
      if (name === want) exact.push(toTarget(day, ex));
      else if (name.includes(want) || want.includes(name)) matches.push(toTarget(day, ex));
    }
  }
  const candidates = exact.length > 0 ? exact : matches;
  // Jour explicite : le premier match du jour gagne (périmètre annoncé).
  if ((patch.program_day_id || patch.weekday != null) && candidates.length > 0) {
    return { status: 'ok', targets: [candidates[0]] };
  }
  if (candidates.length === 1) return { status: 'ok', targets: [candidates[0]] };
  if (candidates.length === 0) return { status: 'not_found', targets: [] };
  return { status: 'ambiguous', targets: candidates };
}

function toTarget(day: ProgramDay, ex: ProgramDayExercise): PatchTarget {
  return {
    dayId: day.id,
    dayWeekday: day.weekday,
    dayName: day.name,
    exerciseId: ex.id,
    exercise: ex,
  };
}
