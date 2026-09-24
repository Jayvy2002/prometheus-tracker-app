import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  isProgramDayDue,
  isProgramTrainingDay,
  pickNextTrainingDay,
  resolveAssignmentGymCard,
  resolveClientGymCard,
  showLoggingRir,
  trainingDays,
  workoutOnDate,
} from './clientGym';
import type { ProgramDay } from './types';
import { i18nLocaleSource } from './i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function day(partial: Partial<ProgramDay> & Pick<ProgramDay, 'id' | 'weekday' | 'name'>): ProgramDay {
  return {
    program_id: 'prog',
    routine_id: null,
    order_index: typeof partial.weekday === 'number' ? partial.weekday : 0,
    exercises: partial.exercises ?? [{ id: `${partial.id}-ex`, program_day_id: partial.id, name: 'Squat', default_sets: 3, default_reps: 8, default_rest_seconds: 90, order_index: 0, created_at: '' }],
    created_at: '',
    ...partial,
  };
}

const hugoDays = [
  day({ id: 'mon', weekday: 1, name: 'Push' }),
  day({ id: 'wed', weekday: 3, name: 'Pull' }),
  day({ id: 'fri', weekday: 5, name: 'Legs' }),
];

test('training days ignore empty rest placeholders', () => {
  const mixed = [
    day({ id: 'mon', weekday: 1, name: 'Push' }),
    day({ id: 'tue', weekday: 2, name: '', exercises: [] }),
  ];
  assert.equal(isProgramTrainingDay(mixed[1]), false);
  assert.deepEqual(trainingDays(mixed).map(d => d.id), ['mon']);
});

test('Hugo Sunday rest → next is Monday Push, not an empty dashboard', () => {
  const card = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    workouts: [],
    todayWeekday: 0,
    todayDate: '2026-08-30',
  });
  assert.equal(card.kind, 'start');
  assert.equal(card.day?.name, 'Push');
  assert.equal(card.isToday, false);
});

test('Hugo Monday not trained → today’s Push is the primary start', () => {
  const card = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    workouts: [],
    todayWeekday: 1,
    todayDate: '2026-08-31',
  });
  assert.equal(card.kind, 'start');
  assert.equal(card.day?.id, 'mon');
  assert.equal(card.isToday, true);
});

test('incomplete log today → continue, do not spawn a second séance', () => {
  const card = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    assignmentId: 'asg',
    workouts: [{
      id: 'w1',
      date: '2026-08-31T12:00:00',
      completed: false,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
    }],
    todayWeekday: 1,
    todayDate: '2026-08-31',
  });
  assert.equal(card.kind, 'continue');
  assert.equal(card.workoutId, 'w1');
  assert.equal(card.day?.name, 'Push');
});

test('séance faite today → short done + next weekday, wrap the week', () => {
  const mondayDone = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    workouts: [{
      id: 'w1',
      date: '2026-08-31T12:00:00',
      completed: true,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
    }],
    todayWeekday: 1,
    todayDate: '2026-08-31',
  });
  assert.equal(mondayDone.kind, 'done_next');
  assert.equal(mondayDone.doneDay?.name, 'Push');
  assert.equal(mondayDone.nextDay?.name, 'Pull');

  const fridayDone = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    workouts: [{
      id: 'w2',
      date: '2026-09-04T12:00:00',
      completed: true,
      program_day_id: 'fri',
      program_assignment_id: 'asg',
    }],
    todayWeekday: 5,
    todayDate: '2026-09-04',
  });
  assert.equal(fridayDone.nextDay?.name, 'Push');
});

test('no program → no gym card (PR 34 first-run empty stays)', () => {
  const card = resolveClientGymCard({
    hasActiveProgram: false,
    days: hugoDays,
    workouts: [],
    todayWeekday: 1,
    todayDate: '2026-08-31',
  });
  assert.equal(card.kind, 'none');
});

test('program day is due only for continue or today’s start, not a future weekday', () => {
  const monday = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    workouts: [],
    todayWeekday: 1,
    todayDate: '2026-08-31',
  });
  const sunday = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    workouts: [],
    todayWeekday: 0,
    todayDate: '2026-08-30',
  });
  const continueCard = resolveClientGymCard({
    hasActiveProgram: true,
    days: hugoDays,
    assignmentId: 'asg',
    workouts: [{
      id: 'w1',
      date: '2026-08-31T12:00:00',
      completed: false,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
    }],
    todayWeekday: 1,
    todayDate: '2026-08-31',
  });
  assert.equal(isProgramDayDue(monday), true);
  assert.equal(isProgramDayDue(sunday), false);
  assert.equal(isProgramDayDue(continueCard), true);
  assert.equal(isProgramDayDue({ kind: 'done_next', isToday: true }), false);
  assert.equal(isProgramDayDue({ kind: 'none', isToday: false }), false);
});

test('timed phases pick the current phase session, not the next letter in the whole program', () => {
  const phases = [
    { id: 'p1', name: 'Accumulation', order_index: 0, duration_weeks: 4 },
    { id: 'p2', name: 'Intensification', order_index: 1, duration_weeks: 4 },
    { id: 'p3', name: 'Deload', order_index: 2, duration_weeks: 1 },
  ];
  const days = [
    day({ id: 'a', weekday: 1, name: 'A', phase_id: 'p1', order_index: 0 }),
    day({ id: 'b', weekday: 3, name: 'B', phase_id: 'p1', order_index: 1 }),
    day({ id: 'a2', weekday: 1, name: 'A2', phase_id: 'p2', order_index: 2 }),
    day({ id: 'b2', weekday: 3, name: 'B2', phase_id: 'p2', order_index: 3 }),
    day({ id: 'd', weekday: 1, name: 'D', phase_id: 'p3', order_index: 4 }),
  ];
  const inOrderWeek1 = resolveClientGymCard({
    hasActiveProgram: true,
    days,
    workouts: [],
    todayWeekday: 1,
    todayDate: '2026-09-01',
    sessionOrganization: 'in_order',
    phases,
    phaseAnchorDate: '2026-09-01',
  });
  assert.equal(inOrderWeek1.day?.name, 'A');
  assert.equal(inOrderWeek1.phase?.name, 'Accumulation');

  const afterTwo = resolveClientGymCard({
    hasActiveProgram: true,
    days,
    workouts: [
      { id: 'w1', date: '2026-09-01T12:00:00', completed: true, program_day_id: 'a', program_assignment_id: 'asg' },
      { id: 'w2', date: '2026-09-03T12:00:00', completed: true, program_day_id: 'b', program_assignment_id: 'asg' },
    ],
    assignmentId: 'asg',
    todayWeekday: 5,
    todayDate: '2026-09-05',
    sessionOrganization: 'in_order',
    phases,
    phaseAnchorDate: '2026-09-01',
  });
  assert.equal(afterTwo.day?.name, 'A');
  assert.notEqual(afterTwo.day?.name, 'A2');

  const week5 = resolveClientGymCard({
    hasActiveProgram: true,
    days,
    workouts: [],
    todayWeekday: 1,
    todayDate: '2026-09-29',
    sessionOrganization: 'in_order',
    phases,
    phaseAnchorDate: '2026-09-01',
  });
  assert.equal(week5.day?.name, 'A2');
  assert.equal(week5.phase?.name, 'Intensification');

  const mondayAccum = resolveClientGymCard({
    hasActiveProgram: true,
    days,
    workouts: [],
    todayWeekday: 1,
    todayDate: '2026-09-07',
    sessionOrganization: 'fixed_days',
    phases,
    phaseAnchorDate: '2026-09-01',
  });
  assert.equal(mondayAccum.day?.name, 'A');
  const mondayIntens = resolveClientGymCard({
    hasActiveProgram: true,
    days,
    workouts: [],
    todayWeekday: 1,
    todayDate: '2026-09-29',
    sessionOrganization: 'fixed_days',
    phases,
    phaseAnchorDate: '2026-09-01',
  });
  assert.equal(mondayIntens.day?.name, 'A2');
});

test('assignment before effective start has no program session', () => {
  const assignment = {
    id: 'asg',
    program_id: 'prog',
    client_id: 'c',
    assigned_by: 'c',
    start_date: '2026-09-21',
    status: 'active' as const,
    created_at: '',
    updated_at: '',
    program: {
      id: 'prog',
      owner_id: 'c',
      name: 'P',
      description: '',
      duration_weeks: 8,
      days: hugoDays,
      phase_anchor_on: '2026-09-01',
      created_at: '',
      updated_at: '',
    },
  };
  const before = resolveAssignmentGymCard({
    assignment,
    workouts: [],
    todayDate: '2026-09-20',
    todayWeekday: 0,
  });
  assert.equal(before.kind, 'none');
  const onStart = resolveAssignmentGymCard({
    assignment,
    workouts: [],
    todayDate: '2026-09-21',
    todayWeekday: 1,
  });
  assert.equal(onStart.kind, 'start');
  assert.equal(onStart.day?.id, 'mon');
});

test('pickNext wraps; workoutOnDate matches local timestamps', () => {
  assert.equal(pickNextTrainingDay(hugoDays, 6, false)?.name, 'Push');
  assert.equal(workoutOnDate('2026-08-30T12:00:00', '2026-08-30'), true);
  assert.equal(workoutOnDate('2026-08-29T12:00:00', '2026-08-30'), false);
});

test('coach RIR flag wins over local pref; disabled vars stay hidden', () => {
  assert.equal(showLoggingRir(true, false, true), true);
  assert.equal(showLoggingRir(true, false, false), false);
  assert.equal(showLoggingRir(false, true, true), false);
  assert.equal(showLoggingRir(true, true, false), true);
});

test('Dashboard leads with the gym card; logging uses tracking vars; PR 34/35 stay', () => {
  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /resolveAssignmentGymCard/);
  assert.match(dash, /ClientGymCard/);
  assert.match(dash, /DashboardWeightCard/);
  const gymIdx = dash.indexOf('<ClientGymCard');
  const ringsIdx = dash.indexOf('<NutritionRings');
  const proposalIdx = dash.indexOf('<SoloProgramProposal');
  assert.ok(gymIdx > 0 && ringsIdx > 0 && gymIdx < ringsIdx, 'séance card must render before calorie rings');
  assert.ok(gymIdx < proposalIdx, 'séance card must render before the solo program proposal');
  assert.doesNotMatch(dash, /navigate\('\/profile'\)/);
  assert.match(dash, /assignmentReady/);
  assert.match(dash, /isClientFirstRun/);
  assert.match(dash, /clientHomeNextAction/);
  assert.doesNotMatch(dash, /\/recipes/);
  assert.doesNotMatch(dash, /navigate\('\/routines'\)/);
  assert.doesNotMatch(dash, /navigate\('\/programs\/new'\)/);
  assert.match(dash, /navigate\('\/programs'\)/);
  assert.match(dash, /data-testid="dashboard-program"/);
  assert.match(dash, /to="\/programs"/);

  const gymUi = src('src/components/dashboard/ClientGymCard.tsx');
  assert.match(gymUi, /dashboard\.gym\.done/);
  assert.match(gymUi, /dashboard\.gym\.startCta/);
  assert.match(gymUi, /dashboard\.gym\.continueCta/);
  assert.match(gymUi, /dashboard\.gym\.showList/);
  assert.doesNotMatch(gymUi, /dashboard\.gym\.previewHint/);
  assert.match(gymUi, /dashboard\.gym\.editPlan/);
  assert.match(gymUi, /default_sets/);
  assert.doesNotMatch(gymUi, /<button[\s\S]{0,80}onClick=\{onStart\}/);

  const workoutPage = src('src/components/workout/WorkoutPage.tsx');
  assert.match(workoutPage, /ClientGymCard/);
  assert.match(workoutPage, /startProgramDay/);
  assert.match(workoutPage, /nav\.routines/);
  assert.doesNotMatch(workoutPage, /data-testid="workout-program"/);
  assert.doesNotMatch(workoutPage, /coached \|\| !assignment\?\.program/);
  assert.doesNotMatch(workoutPage, /to="\/exercise-progress"/);
  assert.match(workoutPage, /isProgramDayDue/);
  assert.match(workoutPage, /nav\.addWorkoutOffPlan/);
  assert.doesNotMatch(workoutPage, /ProgramEditorPage/);
  assert.doesNotMatch(workoutPage, /workout\.myRoutines/);

  const card = src('src/components/workout/ExerciseCard.tsx') + src('src/components/workout/SetRow.tsx') + src('src/features/workout/domain/overloadSuggestion.ts') + src('src/features/workout/hooks/useExerciseHistory.ts');
  assert.match(card, /showLoggingRir/);
  assert.doesNotMatch(card, /hevySimple/);
  assert.match(card, /planLocked/);
  assert.match(card, /data-drop-segments/);
  assert.match(card, /showTrainingField\(tracking, 'sets'\)/);
  assert.match(card, /showTrainingField\(tracking, 'load'\)/);
  assert.match(card, /showTrainingField\(tracking, 'rest'\)/);
  assert.match(card, /applySetPlaceholders/);
  assert.match(card, /resolveRestSeconds/);
  assert.match(card, /workout\.exerciseCard\.completeSet/);
  assert.match(card, /s\.completed/);

  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /isProgramSession/);
  assert.match(form, /showTrainingField\(tracking, 'rest'\)/);
  assert.match(form, /autoStart=\{restAutoStart\}/);
  assert.match(form, /initialSeconds=\{restDuration\}/);
  assert.match(form, /workout\.emptySession/);
  assert.match(form, /offPlan/);
  assert.match(form, /nav\.addWorkoutOffPlan/);
  assert.match(form, /workout\.offPlanNotice/);
  assert.match(form, /data-testid="workout-off-plan-notice"/);

  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /done: 'Séance faite'/);
  assert.match(fr, /startCta: 'Démarrer'/);
  assert.match(fr, /continueCta: 'Continuer'/);
  assert.match(fr, /waitingProgram: 'Ton coach va t’envoyer un programme'/);

  const auth = src('src/components/auth/AuthPage.tsx');
  assert.match(auth, /pressOnly/);

  const layout = src('src/app/layout/AppLayout.tsx');
  assert.match(layout, /hideFab/);
  assert.match(layout, /startsWith\('\/messages'\)/);
  assert.match(layout, /startsWith\('\/checkin'\)/);

  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /quickAddActions\(tracking\)/);
  assert.match(src('src/app/navigation/navConfig.ts'), /id: 'session', path: '\/workout'/);
});
