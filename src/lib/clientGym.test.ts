import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  isProgramTrainingDay,
  pickNextTrainingDay,
  resolveClientGymCard,
  showLoggingRir,
  trainingDays,
  workoutOnDate,
} from './clientGym';
import type { ProgramDay } from './types';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function day(partial: Partial<ProgramDay> & Pick<ProgramDay, 'id' | 'weekday' | 'name'>): ProgramDay {
  return {
    program_id: 'prog',
    routine_id: null,
    order_index: partial.weekday,
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
  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.match(dash, /resolveClientGymCard/);
  assert.match(dash, /ClientGymCard/);
  const gymIdx = dash.indexOf('<ClientGymCard');
  const ringsIdx = dash.indexOf("t('dashboard.todaySummary')");
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

  const gymUi = src('src/components/dashboard/ClientGymCard.tsx');
  assert.match(gymUi, /dashboard\.gym\.done/);
  assert.match(gymUi, /dashboard\.gym\.startCta/);
  assert.match(gymUi, /dashboard\.gym\.continueCta/);
  assert.match(gymUi, /dashboard\.gym\.previewHint/);
  assert.match(gymUi, /dashboard\.gym\.editPlan/);
  assert.match(gymUi, /default_sets/);
  assert.doesNotMatch(gymUi, /<button[\s\S]{0,80}onClick=\{onStart\}/);

  const workoutPage = src('src/components/workout/WorkoutPage.tsx');
  assert.match(workoutPage, /ClientGymCard/);
  assert.match(workoutPage, /startProgramDay/);
  assert.match(workoutPage, /to="\/programs"/);
  assert.doesNotMatch(workoutPage, /ProgramEditorPage/);
  assert.doesNotMatch(workoutPage, /workout\.myRoutines/);

  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /showLoggingRir/);
  assert.match(card, /hevySimple/);
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

  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /done: 'Séance faite'/);
  assert.match(fr, /startCta: 'Démarrer'/);
  assert.match(fr, /continueCta: 'Continuer'/);
  assert.match(fr, /waitingProgram: 'Ton coach va t’envoyer un programme'/);

  const auth = src('src/components/auth/AuthPage.tsx');
  assert.match(auth, /pressOnly/);

  const layout = src('src/components/layout/AppLayout.tsx');
  assert.match(layout, /hideFab/);
  assert.match(layout, /startsWith\('\/messages'\)/);
  assert.match(layout, /startsWith\('\/checkin'\)/);
});
