/** Client home = the gym. Next assigned day, not a calorie dump. */
import type { ProgramDay, Workout } from './types';

export type ClientGymCardKind = 'start' | 'continue' | 'done_next' | 'none';

export interface ClientGymCard {
  kind: ClientGymCardKind;
  day: ProgramDay | null;
  nextDay: ProgramDay | null;
  doneDay: ProgramDay | null;
  workoutId: string | null;
  isToday: boolean;
}

export interface ClientGymInput {
  hasActiveProgram: boolean;
  days: ProgramDay[] | null | undefined;
  workouts: Array<Pick<Workout, 'id' | 'date' | 'completed' | 'program_day_id' | 'program_assignment_id'>>;
  todayWeekday: number;
  todayDate: string;
  assignmentId?: string | null;
}

const NONE: ClientGymCard = {
  kind: 'none',
  day: null,
  nextDay: null,
  doneDay: null,
  workoutId: null,
  isToday: false,
};

export function isProgramTrainingDay(day: Pick<ProgramDay, 'name' | 'exercises'>): boolean {
  return !!(day.name?.trim() || (day.exercises && day.exercises.length > 0));
}

export function workoutOnDate(
  date: string | null | undefined,
  todayDate: string,
): boolean {
  if (!date || !todayDate) return false;
  return date.startsWith(todayDate);
}

export function trainingDays(days: ProgramDay[] | null | undefined): ProgramDay[] {
  return (days ?? [])
    .filter(isProgramTrainingDay)
    .slice()
    .sort((a, b) => a.weekday - b.weekday || a.order_index - b.order_index);
}

/** Next assigned day, wrapping the week. skipCurrent omits today's weekday (after a completed session). */
export function pickNextTrainingDay(
  days: ProgramDay[],
  fromWeekday: number,
  skipCurrent = false,
): ProgramDay | null {
  const pool = trainingDays(days);
  if (pool.length === 0) return null;
  const start = skipCurrent ? 1 : 0;
  for (let i = start; i < start + 7; i++) {
    const wd = (fromWeekday + i) % 7;
    const found = pool.find(d => d.weekday === wd);
    if (found) return found;
  }
  return pool[0] ?? null;
}

function inProgressWorkout(
  input: ClientGymInput,
): ClientGymInput['workouts'][number] | null {
  const open = input.workouts.filter(w => !w.completed);
  const forProgram = input.assignmentId
    ? open.filter(w => !w.program_assignment_id || w.program_assignment_id === input.assignmentId)
    : open;
  const today = forProgram.find(w => workoutOnDate(w.date, input.todayDate));
  return today ?? null;
}

export function resolveClientGymCard(input: ClientGymInput): ClientGymCard {
  if (!input.hasActiveProgram) return NONE;
  const pool = trainingDays(input.days);
  if (pool.length === 0) return NONE;

  const todayDay = pool.find(d => d.weekday === input.todayWeekday) ?? null;
  const inProgress = inProgressWorkout(input);
  if (inProgress) {
    const day = pool.find(d => d.id === inProgress.program_day_id) ?? todayDay ?? pool[0];
    return {
      kind: 'continue',
      day,
      nextDay: null,
      doneDay: null,
      workoutId: inProgress.id,
      isToday: true,
    };
  }

  const completedToday = input.workouts.filter(
    w => w.completed && workoutOnDate(w.date, input.todayDate),
  );
  if (completedToday.length > 0) {
    const doneDay = pool.find(d => completedToday.some(w => w.program_day_id === d.id)) ?? todayDay;
    return {
      kind: 'done_next',
      day: null,
      doneDay,
      nextDay: pickNextTrainingDay(pool, input.todayWeekday, true),
      workoutId: completedToday[0]?.id ?? null,
      isToday: true,
    };
  }

  const next = pickNextTrainingDay(pool, input.todayWeekday, false);
  if (!next) return NONE;
  return {
    kind: 'start',
    day: next,
    nextDay: null,
    doneDay: null,
    workoutId: null,
    isToday: next.weekday === input.todayWeekday,
  };
}

/** Coach tracking vars win for coached athletes; solo still honors the local RIR pref. */
export function showLoggingRir(
  rirEnabled: boolean,
  prefRir: boolean,
  hasCoach: boolean,
): boolean {
  if (!rirEnabled) return false;
  if (hasCoach) return true;
  return prefRir;
}
