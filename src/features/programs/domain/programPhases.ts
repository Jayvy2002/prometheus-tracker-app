import { civilDaysBetween, laterCivilDate } from '../../../lib/utils';

/** P3.2 — optional phases on the shared program engine. No mesocycle tree. */

export const PROGRAM_EXERCISE_MAX_SETS = 20;

export { civilDaysBetween, laterCivilDate };

export interface ProgramPhase {
  id: string;
  program_id?: string;
  name: string;
  description?: string;
  order_index: number;
  duration_weeks: number | null;
  created_at?: string;
}

export type ProgramPhaseDraft = {
  id?: string;
  name: string;
  description?: string;
  duration_weeks: number | null;
};

function sortedPhases(phases: ProgramPhase[] | null | undefined): ProgramPhase[] {
  return [...(phases ?? [])].sort((a, b) => a.order_index - b.order_index);
}

export function phaseNameForDay(
  phases: ProgramPhase[] | null | undefined,
  day: { phase_id?: string | null } | null | undefined,
): string | null {
  const id = day?.phase_id;
  if (!id) return null;
  const found = (phases ?? []).find(phase => phase.id === id);
  const name = found?.name.trim();
  return name || null;
}

/**
 * Week 1 starts on the later of assignment.start_date and the version's
 * own civil start (version_start_on / phase_anchor_on). A client assigned
 * after activation does not jump into a later phase.
 */
export function phaseAnchorDate(
  assignmentStartDate?: string | null,
  phaseAnchorOn?: string | null,
): string | null {
  return laterCivilDate(assignmentStartDate, phaseAnchorOn);
}

/** Same clock as phase, calendar, and the server logger. */
export function effectiveVersionStart(
  assignmentStartDate?: string | null,
  phaseAnchorOn?: string | null,
): string | null {
  return laterCivilDate(assignmentStartDate, phaseAnchorOn);
}

/**
 * Real multi-phase programs that reuse weekdays across phases need explicit
 * durations so the timed engine can pick one active phase. Descriptive
 * untimed phases remain allowed when weekdays do not collide.
 */
export function multiPhaseSharedWeekdaysNeedDuration(
  organization: string | null | undefined,
  phases: Array<{ duration_weeks: number | null | undefined }> | null | undefined,
  days: Array<{ weekday?: number | null; phase_id?: string | null }> | null | undefined,
): boolean {
  if (organization !== 'fixed_days') return false;
  const list = phases ?? [];
  if (list.length < 2) return false;
  const byWeekday = new Map<number, Set<string>>();
  for (const day of days ?? []) {
    if (day.weekday == null) continue;
    const set = byWeekday.get(day.weekday) ?? new Set<string>();
    set.add(day.phase_id?.trim() ? day.phase_id : '-');
    byWeekday.set(day.weekday, set);
  }
  const shares = [...byWeekday.values()].some(set => set.size >= 2);
  if (!shares) return false;
  return list.some(phase => phase.duration_weeks == null || phase.duration_weeks < 1);
}

export function phasesAreTimed(phases: ProgramPhase[] | null | undefined): boolean {
  const list = phases ?? [];
  if (list.length === 0) return false;
  return list.every(phase => phase.duration_weeks != null && phase.duration_weeks > 0);
}

export function phasesHaveMixedDurations(
  phases: Array<{ duration_weeks: number | null | undefined }> | null | undefined,
): boolean {
  const list = phases ?? [];
  if (list.length === 0) return false;
  const timed = list.some(phase => phase.duration_weeks != null && phase.duration_weeks > 0);
  const untimed = list.some(phase => phase.duration_weeks == null || phase.duration_weeks < 1);
  return timed && untimed;
}

export function daysForCurrentPhase<T extends { phase_id?: string | null }>(
  days: T[] | null | undefined,
  phase: ProgramPhase | null,
): T[] {
  const pool = [...(days ?? [])];
  if (!phase) return pool;
  return pool.filter(day => day.phase_id === phase.id);
}

/**
 * Current phase:
 * - no phases → simple program (null)
 * - durations + assignment start → walk weeks; last phase sticks
 * - otherwise → phase of the next session template
 */
export function resolveCurrentPhase(input: {
  phases: ProgramPhase[] | null | undefined;
  startDate?: string | null;
  today?: string | null;
  nextDay?: { phase_id?: string | null } | null;
}): ProgramPhase | null {
  const phases = sortedPhases(input.phases);
  if (phases.length === 0) return null;
  if (phasesHaveMixedDurations(phases)) {
    const fromNext = phases.find(phase => phase.id === input.nextDay?.phase_id);
    return fromNext ?? phases[0] ?? null;
  }

  const start = input.startDate?.slice(0, 10) ?? '';
  const today = input.today?.slice(0, 10) ?? '';
  if (phasesAreTimed(phases) && start && today) {
    const elapsed = civilDaysBetween(start, today);
    if (elapsed == null) return phases[0] ?? null;
    if (elapsed < 0) return phases[0] ?? null;
    const weekIndex = Math.floor(elapsed / 7);
    let cursor = 0;
    for (const phase of phases) {
      const span = phase.duration_weeks ?? 0;
      if (weekIndex < cursor + span) return phase;
      cursor += span;
    }
    return phases[phases.length - 1] ?? null;
  }

  const fromNext = phases.find(phase => phase.id === input.nextDay?.phase_id);
  return fromNext ?? phases[0] ?? null;
}

export function newPhaseDraft(name = ''): ProgramPhaseDraft {
  const id = globalThis.crypto?.randomUUID?.() ?? `phase-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, name, description: '', duration_weeks: null };
}
