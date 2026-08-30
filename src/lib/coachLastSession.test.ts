import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  isTodayOrYesterday,
  lastSessionFromLifts,
  loggedSessionForQueue,
  readableSets,
  sessionContextPayload,
  sessionExerciseLines,
  sessionLoggedPriority,
  sessionReviewRows,
} from './coachLastSession';
import { buildCoachPriorities } from './coachPriorities';
import { groupQueueByClient, relanceThreadHref, resolveQueueAction } from './coachQueue';
import { foldText } from './coachText';
import {
  isTrainingHref,
  parseWorkoutQuery,
  trainingSessionHref,
  workoutIdFromHref,
} from './coachTraining';
import type {
  ClientLiftProgress,
  ClientOpsRow,
  CoachClientSummary,
  CoachRosterSignals,
  DailyCheckin,
  LiftSessionSnapshot,
} from './types';

const TODAY = '2026-08-29';
const LEA_UPPER = 'lea-upper-0827';
const CAMILLE_LOWER = 'camille-lower-0828';

function session(
  date: string,
  kg: number,
  reps = 5,
  extras: Partial<LiftSessionSnapshot> = {},
): LiftSessionSnapshot {
  return {
    date,
    workoutId: extras.workoutId ?? `${date}-${kg}`,
    workoutName: extras.workoutName ?? 'Upper',
    maxWeight: kg,
    bestSet: `${kg}kg × ${reps}`,
    avgRir: extras.avgRir ?? 2,
    volume: kg * reps * 3,
    sets: extras.sets ?? [{ weight_kg: kg, reps, rir: 2, completed: true }],
    ...extras,
  };
}

function lift(
  clientId: string,
  displayName: string,
  sessions: LiftSessionSnapshot[],
  stalled = false,
): ClientLiftProgress {
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  return {
    clientId,
    exerciseName: foldText(displayName),
    displayName,
    sessions: sorted,
    stalled,
  };
}

function client(id: string, name: string): CoachClientSummary {
  return {
    id,
    full_name: name,
    email: `${id}@example.com`,
    avatar_url: '',
    linked_at: '2026-07-01T00:00:00Z',
    onboarding_completed: true,
    goal: 'gain',
    training_frequency: 4,
    target_weight_kg: 0,
    weight_kg: 0,
    last_visited_at: null,
    last_nudged_at: null,
  };
}

function ops(row: CoachClientSummary, alerts: ClientOpsRow['alerts'] = []): ClientOpsRow {
  return {
    client: row,
    alerts,
    hasScheduledTrainingToday: true,
    hasProgram: true,
    setupCompleted: true,
  };
}

function emptySignals(partial: Partial<CoachRosterSignals> = {}): CoachRosterSignals {
  return {
    checkins: [] as DailyCheckin[],
    weights: [],
    lifts: [],
    nutritionLogs: [],
    calorieTargets: {},
    lastNoteAt: {},
    lastInterventionAt: {},
    assignmentStart: {},
    assignmentWeeks: {},
    assignmentName: {},
    scheduledDays: {},
    ...partial,
  };
}

const leaBench = lift('lea-id', 'Développé couché', [
  session('2026-08-06', 50, 5, { workoutId: 'lea-upper-0806' }),
  session('2026-08-13', 52.5, 5, { workoutId: 'lea-upper-0813' }),
  session('2026-08-27', 55, 5, {
    workoutId: LEA_UPPER,
    workoutName: 'Upper',
    sets: [
      { weight_kg: 50, reps: 5, rir: 2, completed: true },
      { weight_kg: 55, reps: 5, rir: 1, completed: true },
    ],
  }),
]);

const leaRow = lift('lea-id', 'Row barre', [
  session('2026-08-20', 40, 5, { workoutId: 'lea-upper-0820' }),
  session('2026-08-27', 40, 8, {
    workoutId: LEA_UPPER,
    workoutName: 'Upper',
    sets: [{ weight_kg: 40, reps: 8, rir: 2, completed: true }],
  }),
]);

const camilleSquat = lift('camille-id', 'Squat', [
  session('2026-08-08', 80, 5, { workoutId: 'camille-lower-0808', workoutName: 'Lower' }),
  session('2026-08-15', 82.5, 5, { workoutId: 'camille-lower-0815', workoutName: 'Lower' }),
  session('2026-08-22', 85, 5, { workoutId: 'camille-lower-0822', workoutName: 'Lower' }),
  session('2026-08-28', 87.5, 5, {
    workoutId: CAMILLE_LOWER,
    workoutName: 'Lower',
    sets: [
      { weight_kg: 80, reps: 5, rir: 2, completed: true },
      { weight_kg: 87.5, reps: 5, rir: 1, completed: true },
    ],
  }),
]);

const camilleBench = lift('camille-id', 'Développé couché', [
  session('2026-08-04', 45, 5, { workoutId: 'camille-upper-0804' }),
  session('2026-08-11', 45, 5, { workoutId: 'camille-upper-0811' }),
  session('2026-08-18', 47.5, 5, { workoutId: 'camille-upper-0818' }),
]);

test('last session view is THAT workout (sets, kg, reps, RIR) — not a dump of history', () => {
  const lifts = [leaRow, leaBench];
  const view = lastSessionFromLifts(lifts, 'lea-id', { today: TODAY });
  assert.ok(view);
  assert.equal(view?.workoutId, LEA_UPPER);
  assert.equal(view?.date, '2026-08-27');
  assert.equal(view?.name, 'Upper');
  assert.deepEqual(view?.exercises.map(e => e.name).sort(), ['Développé couché', 'Row barre']);

  const bench = view?.exercises.find(e => e.name === 'Développé couché');
  assert.deepEqual(readableSets(bench?.sets ?? []).map(s => `${s.weight_kg}x${s.reps}@${s.rir}`), [
    '50x5@2',
    '55x5@1',
  ]);
  const lines = sessionExerciseLines(view!);
  assert.ok(lines.some(l => l.includes('55kg × 5 @ RIR 1')));
  assert.ok(lines.some(l => l.includes('40kg × 8 @ RIR 2')));
  assert.equal(lines.some(l => l.includes('52.5')), false);

  const ctx = sessionContextPayload(view!);
  assert.equal(ctx.workout_id, LEA_UPPER);
  assert.equal((ctx.exercises as unknown[]).length, 2);
});

test('Camille yesterday session is the last view with real squat sets', () => {
  const view = lastSessionFromLifts([camilleSquat, camilleBench], 'camille-id', { today: TODAY });
  assert.equal(view?.workoutId, CAMILLE_LOWER);
  assert.equal(view?.date, '2026-08-28');
  assert.equal(view?.name, 'Lower');
  assert.deepEqual(view?.exercises.map(e => e.name), ['Squat']);
  assert.equal(view?.exercises[0]?.sets[1]?.weight_kg, 87.5);
  assert.equal(loggedSessionForQueue([camilleSquat], 'camille-id', TODAY)?.workoutId, CAMILLE_LOWER);
});

test('empty last session: Sofia stale / Alex none — Relancer, no invented session', () => {
  assert.equal(lastSessionFromLifts([], 'sofia-id', { today: TODAY }), null);
  assert.equal(loggedSessionForQueue([], 'sofia-id', TODAY), null);

  const stale = lift('sofia-id', 'Squat', [
    session('2026-07-20', 60),
    session('2026-08-13', 60),
  ]);
  assert.equal(lastSessionFromLifts([stale], 'sofia-id', { today: TODAY }), null);
  assert.equal(sessionLoggedPriority(ops(client('sofia-id', 'Sofia Martin'), ['missing_workout_week']), [stale], TODAY), null);

  const alex = client('alex-id', 'Alex Gagnon');
  const priorities = buildCoachPriorities(
    [ops(alex, ['missing_workout_week'])],
    emptySignals(),
  );
  assert.equal(priorities.some(p => p.kind === 'session_logged'), false);
  const missed = priorities.find(p => p.kind === 'missed_workout');
  assert.ok(missed);
  const action = resolveQueueAction(missed!, []);
  assert.equal(action.kind, 'compose');
  assert.equal(action.href, relanceThreadHref('alex-id', 'missed_training'));
});

test('Aujourd’hui séance faite deep-links to ?tab=training&workout= — missed stays Relancer', () => {
  const camille = client('camille-id', 'Camille Roux');
  const lea = client('lea-id', 'Léa Martin');
  const sofia = client('sofia-id', 'Sofia Martin');
  const lifts = [camilleSquat, camilleBench, leaBench, leaRow];
  const priorities = buildCoachPriorities(
    [
      ops(camille),
      ops(lea, ['missing_workout_today']),
      ops(sofia, ['missing_workout_week']),
    ],
    emptySignals({ lifts }),
  );

  const done = priorities.find(p => p.clientId === 'camille-id' && p.kind === 'session_logged');
  assert.ok(done);
  assert.equal(done?.workoutId, CAMILLE_LOWER);
  assert.equal(done?.href, trainingSessionHref('camille-id', CAMILLE_LOWER));
  assert.equal(isTrainingHref(done!.href), true);
  assert.equal(workoutIdFromHref(done!.href), CAMILLE_LOWER);
  assert.equal(parseWorkoutQuery(new URLSearchParams(done!.href.split('?')[1]).get('workout')), CAMILLE_LOWER);

  const doneAction = resolveQueueAction(done!, []);
  assert.equal(doneAction.kind, 'open_360');
  assert.equal(doneAction.href, done?.href);
  assert.equal(doneAction.ctaKey, 'coaching.queue.openSession');

  assert.equal(priorities.some(p => p.clientId === 'lea-id' && p.kind === 'session_logged'), false);
  const leaMissed = priorities.find(p => p.clientId === 'lea-id' && p.kind === 'missed_workout');
  assert.ok(leaMissed);
  assert.equal(resolveQueueAction(leaMissed!, []).kind, 'compose');
  assert.equal(resolveQueueAction(leaMissed!, []).href, relanceThreadHref('lea-id', 'missed_training'));

  const sofiaMissed = priorities.find(p => p.clientId === 'sofia-id' && p.kind === 'missed_workout');
  assert.ok(sofiaMissed);
  assert.equal(sofiaMissed?.kind, 'missed_workout');
  assert.equal(priorities.some(p => p.clientId === 'sofia-id' && p.kind === 'session_logged'), false);
  assert.equal(resolveQueueAction(sofiaMissed!, []).kind, 'compose');

  const rows = sessionReviewRows(
    [ops(camille), ops(lea), ops(sofia)],
    lifts,
    TODAY,
  );
  assert.deepEqual(rows.map(r => r.clientId), ['camille-id']);
  assert.equal(rows[0]?.href, trainingSessionHref('camille-id', CAMILLE_LOWER));

  const groups = groupQueueByClient(priorities.filter(p => p.kind === 'session_logged' || p.kind === 'missed_workout'));
  const camilleGroup = groups.find(g => g.clientId === 'camille-id');
  assert.equal(camilleGroup?.items[0]?.href, trainingSessionHref('camille-id', CAMILLE_LOWER));
});

test('Aujourd’hui has no Séances à relire / Cuts qui stagnent lists — sessions live in File du jour', () => {
  const dash = readFileSync(resolve(process.cwd(), 'src/components/coaching/CoachDashboard.tsx'), 'utf8');
  const queue = readFileSync(resolve(process.cwd(), 'src/components/coaching/CoachTodayQueue.tsx'), 'utf8');
  assert.doesNotMatch(dash, /sessionReview\.title/);
  assert.doesNotMatch(dash, /nutritionStall\.title/);
  assert.doesNotMatch(dash, /seances-a-relire/);
  assert.doesNotMatch(dash, /stalls-nutrition/);
  assert.match(dash, /CoachTodayQueue/);
  assert.match(queue, /session_logged/);
  assert.match(queue, /groups\.map/);
});

test('explicit workout query opens that session even when it is not the newest', () => {
  const older = lastSessionFromLifts([leaBench, leaRow], 'lea-id', { workoutId: 'lea-upper-0813' });
  assert.equal(older?.workoutId, 'lea-upper-0813');
  assert.equal(older?.date, '2026-08-13');
  assert.equal(older?.exercises.length, 1);
  assert.equal(older?.exercises[0]?.sets[0]?.weight_kg, 52.5);
});

test('trainingSessionHref is ?tab=training&workout= and empty query stays empty', () => {
  assert.equal(trainingSessionHref('camille-id', CAMILLE_LOWER), `/clients/camille-id?tab=training&workout=${CAMILLE_LOWER}`);
  assert.equal(isTrainingHref(trainingSessionHref('camille-id', CAMILLE_LOWER)), true);
  assert.equal(parseWorkoutQuery(null), '');
  assert.equal(parseWorkoutQuery('  not an id because spaces  '), '');
  assert.equal(parseWorkoutQuery(CAMILLE_LOWER), CAMILLE_LOWER);
  assert.equal(isTodayOrYesterday('2026-08-29', TODAY), true);
  assert.equal(isTodayOrYesterday('2026-08-28', TODAY), true);
  assert.equal(isTodayOrYesterday('2026-08-27', TODAY), false);
});
