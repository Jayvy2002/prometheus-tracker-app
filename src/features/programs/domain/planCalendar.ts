/** UX47 — états de jour de plan au calendrier. Pas un nouveau calendrier ; le passé dû reste visible. */

import { isProgramTrainingDay, trainingDays, workoutOnDate } from '../../../lib/clientGym';

export type PlanCalendarStatus = 'scheduled' | 'started' | 'done';

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
  unnamed?: string;
}): PlanCalendarMark | null {
  const date = input.date.slice(0, 10);
  if (!date) return null;
  if (input.startDate && date < input.startDate.slice(0, 10)) return null;

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

  if (template && isProgramTrainingDay(template)) {
    return {
      status: 'scheduled',
      dayName: template.name?.trim() || unnamed,
      dayId: template.id,
      workoutId: null,
    };
  }
  return null;
}
