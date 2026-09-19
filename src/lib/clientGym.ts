/** Client home = the gym. Next assigned day, not a calorie dump. */
import type { ProgramDay, SessionOrganization, Workout } from './types';
import { normalizeSessionOrganization } from '../features/programs/domain/sessionOrganization';

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
  sessionOrganization?: SessionOrganization | null;
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
    .sort((a, b) => a.order_index - b.order_index || (a.weekday ?? 7) - (b.weekday ?? 7));
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

/** Next session in program order, wrapping A→B→C. lastDayId is the last completed template. */
export function pickNextInOrder(
  days: ProgramDay[],
  lastDayId: string | null | undefined,
): ProgramDay | null {
  const pool = trainingDays(days);
  if (pool.length === 0) return null;
  if (!lastDayId) return pool[0];
  const idx = pool.findIndex(d => d.id === lastDayId);
  if (idx < 0) return pool[0];
  return pool[(idx + 1) % pool.length];
}

function matchingProgramLogs(
  workouts: ClientGymInput['workouts'],
  assignmentId?: string | null,
): ClientGymInput['workouts'] {
  return workouts.filter(w => {
    if (!w.program_day_id) return false;
    if (!assignmentId) return true;
    return !w.program_assignment_id || w.program_assignment_id === assignmentId;
  });
}

function lastCompletedProgramDayId(input: ClientGymInput): string | null {
  const logs = matchingProgramLogs(input.workouts, input.assignmentId)
    .filter(w => w.completed)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return logs[0]?.program_day_id ?? null;
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
  const inOrder = normalizeSessionOrganization(input.sessionOrganization) === 'in_order';

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

  const completedToday = matchingProgramLogs(input.workouts, input.assignmentId)
    .filter(w => w.completed && workoutOnDate(w.date, input.todayDate))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (completedToday.length > 0) {
    const doneId = completedToday[0]?.program_day_id ?? null;
    const doneDay = pool.find(d => d.id === doneId) ?? todayDay;
    return {
      kind: 'done_next',
      day: null,
      doneDay,
      nextDay: inOrder
        ? pickNextInOrder(pool, doneId)
        : pickNextTrainingDay(pool, input.todayWeekday, true),
      workoutId: completedToday[0]?.id ?? null,
      isToday: true,
    };
  }

  if (inOrder) {
    const next = pickNextInOrder(pool, lastCompletedProgramDayId(input));
    if (!next) return NONE;
    return {
      kind: 'start',
      day: next,
      nextDay: null,
      doneDay: null,
      workoutId: null,
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

/** Prescribed day is due now — continue an open log, or start today's assigned day. */
export function isProgramDayDue(card: Pick<ClientGymCard, 'kind' | 'isToday'>): boolean {
  return card.kind === 'continue' || (card.kind === 'start' && card.isToday);
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
