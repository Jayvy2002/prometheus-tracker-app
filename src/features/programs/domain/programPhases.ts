/** P3.2 — optional phases on the shared program engine. No mesocycle tree. */

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

export function civilDaysBetween(start: string, today: string): number | null {
  const from = Date.parse(`${start.slice(0, 10)}T12:00:00`);
  const to = Date.parse(`${today.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86_400_000);
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

/** Version activation date wins over assignment.start_date so Phase 1 restarts. */
export function phaseAnchorDate(
  assignmentStartDate?: string | null,
  phaseAnchorOn?: string | null,
): string | null {
  const anchor = phaseAnchorOn?.slice(0, 10) || '';
  if (anchor) return anchor;
  const start = assignmentStartDate?.slice(0, 10) || '';
  return start || null;
}

/** Same clock as phase: version activation date wins over assignment.start_date. */
export function effectiveVersionStart(
  assignmentStartDate?: string | null,
  phaseAnchorOn?: string | null,
): string | null {
  return phaseAnchorDate(assignmentStartDate, phaseAnchorOn);
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
  return (phases ?? []).some(phase => phase.duration_weeks != null && phase.duration_weeks > 0);
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

  const timed = phases.filter(phase => phase.duration_weeks != null && phase.duration_weeks > 0);
  const start = input.startDate?.slice(0, 10) ?? '';
  const today = input.today?.slice(0, 10) ?? '';
  if (timed.length > 0 && start && today) {
    const elapsed = civilDaysBetween(start, today);
    if (elapsed == null) return phases[0] ?? null;
    if (elapsed < 0) return phases[0] ?? null;
    const weekIndex = Math.floor(elapsed / 7);
    let cursor = 0;
    for (const phase of phases) {
      const span = phase.duration_weeks != null && phase.duration_weeks > 0
        ? phase.duration_weeks
        : 1;
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
