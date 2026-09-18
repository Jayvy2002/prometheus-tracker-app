/** UX47 — états de jour de plan au calendrier. Pas un nouveau calendrier ; le passé dû reste visible. */

import { isProgramTrainingDay, trainingDays, workoutOnDate } from '../../../lib/clientGym';

export type PlanCalendarStatus = 'scheduled' | 'started' | 'done';

export type PlanAssignmentStatus = 'active' | 'completed' | 'paused';

export type PlanCalendarMark = {
  status: PlanCalendarStatus;
  dayName: string;
  dayId: string | null;
  workoutId: string | null;
};

export type PlanCalendarWorkout = {
  id: string;
  date: string;
  completed?: boolean | null;
  program_day_id?: string | null;
  program_assignment_id?: string | null;
  name?: string | null;
};

export type PlanCalendarDay = {
  id: string;
  weekday: number;
  name?: string | null;
  exercises?: unknown[] | null;
};

export function weekdayFromDateStr(date: string): number {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
}

/** YYYY-MM-DD stays civil. Timestamps use the local calendar day. */
export function civilDay(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : '';
}

export function addCivilDays(date: string, days: number): string {
  const start = civilDay(date);
  if (!start) return '';
  const parsed = new Date(`${start}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setDate(parsed.getDate() + days);
  return civilDay(
    `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
  );
}

/** First civil day after the last prescribed week (start + duration_weeks * 7). */
export function planExclusiveEndDate(
  startDate: string | null | undefined,
  durationWeeks: number | null | undefined,
): string | null {
  const start = civilDay(startDate);
  const weeks = Math.floor(Number(durationWeeks));
  if (!start || !Number.isFinite(weeks) || weeks < 1) return null;
  const end = addCivilDays(start, weeks * 7);
  return end || null;
}

export function planCanInventScheduled(input: {
  date: string;
  startDate?: string | null;
  durationWeeks?: number | null;
  assignmentStatus?: PlanAssignmentStatus | null;
  endedAt?: string | null;
}): boolean {
  const date = civilDay(input.date);
  const start = civilDay(input.startDate);
  if (!date || !start || date < start) return false;
  const exclusiveEnd = planExclusiveEndDate(start, input.durationWeeks);
  if (!exclusiveEnd || date >= exclusiveEnd) return false;
  const status = input.assignmentStatus ?? 'active';
  if (status === 'paused' || status === 'completed') {
    const ended = civilDay(input.endedAt);
    if (!ended || date > ended) return false;
  }
  return true;
}

function onCivilDate(workouts: PlanCalendarWorkout[], date: string): PlanCalendarWorkout[] {
  return workouts.filter(w => workoutOnDate(w.date, date));
}

function forAssignment(
  workouts: PlanCalendarWorkout[],
  assignmentId?: string | null,
): PlanCalendarWorkout[] {
  if (!assignmentId) {
    return workouts.filter(w => !!w.program_day_id);
  }
  return workouts.filter(w =>
    !!w.program_day_id && (!w.program_assignment_id || w.program_assignment_id === assignmentId),
  );
}

function markFromWorkout(
  workout: PlanCalendarWorkout,
  day: PlanCalendarDay | null,
  unnamed: string,
): PlanCalendarMark {
  const dayName = (day?.name?.trim() || workout.name?.trim() || unnamed);
  return {
    status: workout.completed ? 'done' : 'started',
    dayName,
    dayId: day?.id ?? workout.program_day_id ?? null,
    workoutId: workout.id,
  };
}

export function planMarkForDate(input: {
  date: string;
  days: PlanCalendarDay[] | null | undefined;
  workouts: PlanCalendarWorkout[];
  assignmentId?: string | null;
  startDate?: string | null;
  durationWeeks?: number | null;
  assignmentStatus?: PlanAssignmentStatus | null;
  endedAt?: string | null;
  unnamed?: string;
}): PlanCalendarMark | null {
  const date = civilDay(input.date);
  if (!date) return null;
  if (input.startDate && date < civilDay(input.startDate)) return null;

  const unnamed = input.unnamed?.trim() || '—';
  const weekday = weekdayFromDateStr(date);
  const pool = trainingDays((input.days ?? []) as Parameters<typeof trainingDays>[0]);
  const template = weekday >= 0 ? pool.find(d => d.weekday === weekday) ?? null : null;
  const programLogs = forAssignment(onCivilDate(input.workouts, date), input.assignmentId);

  const linked = template
    ? programLogs.filter(w => w.program_day_id === template.id)
    : [];
  const recaled = programLogs.filter(w => !template || w.program_day_id !== template.id);
  const chosen = linked[0] ?? recaled[0] ?? null;

  if (chosen) {
    const day = pool.find(d => d.id === chosen.program_day_id) ?? template;
    return markFromWorkout(chosen, day, unnamed);
  }

  if (template && isProgramTrainingDay(template) && planCanInventScheduled({
    date,
    startDate: input.startDate,
    durationWeeks: input.durationWeeks,
    assignmentStatus: input.assignmentStatus,
    endedAt: input.endedAt,
  })) {
    return {
      status: 'scheduled',
      dayName: template.name?.trim() || unnamed,
      dayId: template.id,
      workoutId: null,
    };
  }
  return null;
}
