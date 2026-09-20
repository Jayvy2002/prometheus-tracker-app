/** Client home = the gym. Next assigned day, not a calorie dump. */
import type { ProgramAssignment, ProgramDay, SessionOrganization, Workout } from './types';
import { normalizeSessionOrganization } from '../features/programs/domain/sessionOrganization';
import {
  daysForCurrentPhase,
  phaseAnchorDate,
  phasesAreTimed,
  resolveCurrentPhase,
  type ProgramPhase,
} from '../features/programs/domain/programPhases';

export type ClientGymCardKind = 'start' | 'continue' | 'done_next' | 'none';

export interface ClientGymCard {
  kind: ClientGymCardKind;
  day: ProgramDay | null;
  nextDay: ProgramDay | null;
  doneDay: ProgramDay | null;
  workoutId: string | null;
  isToday: boolean;
  phase: ProgramPhase | null;
}

export interface ClientGymInput {
  hasActiveProgram: boolean;
  days: ProgramDay[] | null | undefined;
  workouts: Array<Pick<Workout, 'id' | 'date' | 'completed' | 'program_day_id' | 'program_assignment_id'>>;
  todayWeekday: number;
  todayDate: string;
  assignmentId?: string | null;
  sessionOrganization?: SessionOrganization | null;
  phases?: ProgramPhase[] | null;
  phaseAnchorDate?: string | null;
}

const NONE: ClientGymCard = {
  kind: 'none',
  day: null,
  nextDay: null,
  doneDay: null,
  workoutId: null,
  isToday: false,
  phase: null,
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

function withPhase(card: Omit<ClientGymCard, 'phase'>, phase: ProgramPhase | null): ClientGymCard {
  return { ...card, phase };
}

export function resolveClientGymCard(input: ClientGymInput): ClientGymCard {
  if (!input.hasActiveProgram) return NONE;
  const all = trainingDays(input.days);
  if (all.length === 0) return NONE;
  const timed = phasesAreTimed(input.phases);
  const phase = timed
    ? resolveCurrentPhase({
      phases: input.phases,
      startDate: input.phaseAnchorDate,
      today: input.todayDate,
    })
    : null;
  const pool = timed ? daysForCurrentPhase(all, phase) : all;
  if (pool.length === 0) return withPhase(NONE, phase);
  const inOrder = normalizeSessionOrganization(input.sessionOrganization) === 'in_order';

  const todayDay = pool.find(d => d.weekday === input.todayWeekday) ?? null;
  const inProgress = inProgressWorkout(input);
  if (inProgress) {
    const day = all.find(d => d.id === inProgress.program_day_id) ?? todayDay ?? pool[0];
    return withPhase({
      kind: 'continue',
      day,
      nextDay: null,
      doneDay: null,
      workoutId: inProgress.id,
      isToday: true,
    }, phase ?? resolveCurrentPhase({
      phases: input.phases,
      startDate: input.phaseAnchorDate,
      today: input.todayDate,
      nextDay: day,
    }));
  }

  const completedToday = matchingProgramLogs(input.workouts, input.assignmentId)
    .filter(w => w.completed && workoutOnDate(w.date, input.todayDate))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (completedToday.length > 0) {
    const doneId = completedToday[0]?.program_day_id ?? null;
    const doneDay = pool.find(d => d.id === doneId) ?? all.find(d => d.id === doneId) ?? todayDay;
    const nextDay = inOrder
      ? pickNextInOrder(pool, pool.some(d => d.id === doneId) ? doneId : lastCompletedInPool(input, pool))
      : pickNextTrainingDay(pool, input.todayWeekday, true);
    return withPhase({
      kind: 'done_next',
      day: null,
      doneDay,
      nextDay,
      workoutId: completedToday[0]?.id ?? null,
      isToday: true,
    }, phase);
  }

  if (inOrder) {
    const next = pickNextInOrder(pool, lastCompletedInPool(input, pool));
    if (!next) return withPhase(NONE, phase);
    return withPhase({
      kind: 'start',
      day: next,
      nextDay: null,
      doneDay: null,
      workoutId: null,
      isToday: true,
    }, phase);
  }

  const next = pickNextTrainingDay(pool, input.todayWeekday, false);
  if (!next) return withPhase(NONE, phase);
  return withPhase({
    kind: 'start',
    day: next,
    nextDay: null,
    doneDay: null,
    workoutId: null,
    isToday: next.weekday === input.todayWeekday,
  }, phase);
}

function lastCompletedInPool(
  input: ClientGymInput,
  pool: ProgramDay[],
): string | null {
  const ids = new Set(pool.map(d => d.id));
  const logs = matchingProgramLogs(input.workouts, input.assignmentId)
    .filter(w => w.completed && w.program_day_id && ids.has(w.program_day_id))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return logs[0]?.program_day_id ?? null;
}

export function resolveAssignmentGymCard(input: {
  assignment: ProgramAssignment | null | undefined;
  workouts: ClientGymInput['workouts'];
  todayDate: string;
  todayWeekday: number;
}): ClientGymCard {
  const assignment = input.assignment;
  const program = assignment?.program;
  return resolveClientGymCard({
    hasActiveProgram: assignment?.status === 'active' && !!program,
    days: program?.days,
    workouts: input.workouts,
    todayWeekday: input.todayWeekday,
    todayDate: input.todayDate,
    assignmentId: assignment?.id ?? null,
    sessionOrganization: program?.session_organization,
    phases: program?.phases,
    phaseAnchorDate: phaseAnchorDate(assignment?.start_date, program?.phase_anchor_on),
  });
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
