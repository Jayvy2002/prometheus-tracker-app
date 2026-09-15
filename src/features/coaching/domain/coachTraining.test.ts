import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoachPriorities } from './coachPriorities';
import { groupQueueByClient, relanceThreadHref, resolveQueueAction } from './coachQueue';
import {
  defaultLiftForClient,
  hasRecentPr,
  isTrainingHref,
  liftChartKind,
  loggedExerciseOptions,
  parseExerciseQuery,
  pickDefaultLift,
  prLiftFromNotes,
  trainingFocusHref,
  weekMovedLift,
} from './coachTraining';
import { foldText } from './coachText';
import type {
  ClientLiftProgress,
  ClientOpsRow,
  CoachClientSummary,
  CoachRosterSignals,
  DailyCheckin,
  LiftSessionSnapshot,
} from '../../../lib/types';

const TODAY = '2026-08-29';

function session(
  date: string,
  kg: number,
  reps = 5,
  extras: Partial<LiftSessionSnapshot> = {},
): LiftSessionSnapshot {
  return {
    date,
    workoutId: `${date}-${kg}`,
    workoutName: 'Upper',
    maxWeight: kg,
    bestSet: `${kg}kg × ${reps}`,
    avgRir: 2,
    volume: kg * reps * 3,
    sets: [{ weight_kg: kg, reps, rir: 2, completed: true }],
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
  session('2026-08-06', 50),
  session('2026-08-13', 52.5),
  session('2026-08-27', 55),
]);

const leaRow = lift('lea-id', 'Row barre', [
  session('2026-08-20', 40),
  session('2026-08-27', 40),
]);

const camilleSquat = lift('camille-id', 'Squat', [
  session('2026-08-08', 80),
  session('2026-08-15', 82.5),
  session('2026-08-22', 85),
  session('2026-08-28', 87.5),
]);

const camilleBench = lift('camille-id', 'Développé couché', [
  session('2026-08-04', 45),
  session('2026-08-11', 45),
  session('2026-08-18', 47.5),
]);

test('exercise picker: URL hint wins, then PR, then most recently logged — never a dump', () => {
  const lifts = [leaRow, leaBench];
  assert.equal(loggedExerciseOptions(lifts).map(l => l.displayName).length, 2);

  const fromHint = pickDefaultLift(lifts, { hint: 'Développé couché' });
  assert.equal(fromHint?.displayName, 'Développé couché');

  const fromPr = pickDefaultLift(lifts, { today: TODAY });
  assert.equal(hasRecentPr(leaBench), true);
  assert.equal(hasRecentPr(leaRow), false);
  assert.equal(fromPr?.displayName, 'Développé couché');

  const camille = pickDefaultLift([camilleSquat, camilleBench], { today: TODAY });
  assert.equal(camille?.displayName, 'Squat');
});

test('Léa bench PR note defaults the picker to bench, not the last accessory', () => {
  const lifts = [leaRow, leaBench];
  const notes = [{ body: 'Léa — bench PR 55kg ce matin, on garde le plan.' }];
  assert.equal(prLiftFromNotes(lifts, notes)?.displayName, 'Développé couché');
  assert.equal(pickDefaultLift(lifts, { notes, today: TODAY })?.displayName, 'Développé couché');
  assert.equal(
    defaultLiftForClient([...lifts, camilleSquat], 'lea-id', { notes })?.displayName,
    'Développé couché',
  );
});

test('Camille regular training defaults to the lift she trained most recently', () => {
  const picked = pickDefaultLift([camilleBench, camilleSquat], { today: TODAY });
  assert.equal(picked?.displayName, 'Squat');
  assert.equal(liftChartKind(picked), 'curve');
  assert.equal(picked?.sessions[0]?.bestSet, '87.5kg × 5');
});

test('Sofia ghost: empty training, Relancer, no invented curve or numbers', () => {
  assert.equal(pickDefaultLift([]), null);
  assert.equal(liftChartKind(null), 'empty');
  assert.equal(weekMovedLift([], TODAY), null);

  const stale = lift('sofia-id', 'Squat', [
    session('2026-07-20', 60),
    session('2026-08-13', 60),
  ]);
  assert.equal(pickDefaultLift([stale], { today: TODAY }), null);

  const sofia = client('sofia-id', 'Sofia Martin');
  const priorities = buildCoachPriorities(
    [ops(sofia, ['missing_workout_week'])],
    emptySignals({ lifts: [stale] }),
    TODAY,
  );
  const missed = priorities.find(p => p.kind === 'missed_workout');
  assert.ok(missed);
  assert.equal(missed?.href, trainingFocusHref('sofia-id'));
  assert.equal(missed?.exerciseName, undefined);
  assert.equal(isTrainingHref(missed!.href), true);
  assert.equal(parseExerciseQuery(new URLSearchParams(missed!.href.split('?')[1]).get('exercise')), '');

  const action = resolveQueueAction(missed!, []);
  assert.equal(action.kind, 'compose');
  assert.equal(action.href, relanceThreadHref('sofia-id', 'missed_training'));
  assert.equal(action.templateKey, 'missed_training');
});

test('Aujourd’hui missed-session and File du jour training item deep-link to Entraînement with last lift', () => {
  const camille = client('camille-id', 'Camille Roux');
  const lea = client('lea-id', 'Léa Martin');
  const priorities = buildCoachPriorities(
    [
      ops(camille, ['missing_workout_today']),
      ops(lea, ['missing_workout_week']),
    ],
    emptySignals({ lifts: [camilleSquat, camilleBench, leaBench, leaRow] }),
    TODAY,
  );

  const camilleMissed = priorities.find(p => p.clientId === 'camille-id' && p.kind === 'missed_workout');
  assert.ok(camilleMissed);
  assert.equal(camilleMissed?.href, trainingFocusHref('camille-id', 'Squat'));
  assert.equal(camilleMissed?.exerciseName, 'Squat');
  assert.equal(isTrainingHref(camilleMissed!.href), true);
  assert.equal(
    parseExerciseQuery(new URLSearchParams(camilleMissed!.href.split('?')[1]).get('exercise')),
    'Squat',
  );

  const leaMissed = priorities.find(p => p.clientId === 'lea-id' && p.kind === 'missed_workout');
  assert.equal(leaMissed?.href, trainingFocusHref('lea-id', 'Développé couché'));

  const groups = groupQueueByClient(priorities.filter(p => p.kind === 'missed_workout'));
  assert.ok(groups.some(g => g.items[0]?.href === trainingFocusHref('camille-id', 'Squat')));

  const relance = resolveQueueAction(camilleMissed!, []);
  assert.equal(relance.kind, 'compose');
  assert.equal(relance.href, relanceThreadHref('camille-id', 'missed_training'));
});

test('stalled lift and program adapt keep the same Entraînement deep-link with the lift in view', () => {
  const stalled = lift('camille-id', 'Squat', [
    session('2026-08-08', 85),
    session('2026-08-18', 85),
    session('2026-08-28', 85),
  ], true);
  const camille = client('camille-id', 'Camille Roux');
  const priorities = buildCoachPriorities(
    [ops(camille)],
    emptySignals({ lifts: [stalled] }),
    TODAY,
  );
  const stall = priorities.find(p => p.kind === 'stalled_lift');
  assert.equal(stall?.href, trainingFocusHref('camille-id', 'Squat'));
  const adapt = priorities.find(p => p.kind === 'program_adapt');
  assert.equal(adapt?.href, trainingFocusHref('camille-id', 'Squat'));
});

test('weekMovedLift is null when data is thin, and picks the lift that actually moved this week', () => {
  const thin = lift('x', 'Curl', [session('2026-08-28', 12)]);
  assert.equal(weekMovedLift([thin], TODAY), null);

  const flat = lift('x', 'Curl', [
    session('2026-08-20', 12),
    session('2026-08-28', 12),
  ]);
  assert.equal(weekMovedLift([flat], TODAY), null);

  const oldPr = lift('x', 'Bench', [
    session('2026-08-01', 40),
    session('2026-08-10', 50),
  ]);
  assert.equal(weekMovedLift([oldPr], TODAY), null);

  assert.equal(weekMovedLift([camilleSquat, camilleBench], TODAY)?.displayName, 'Squat');
});

test('trainingFocusHref is ?tab=training&exercise= and empty stays without fake exercise', () => {
  assert.equal(trainingFocusHref('lea-id', 'Développé couché').startsWith('/clients/lea-id?'), true);
  assert.equal(isTrainingHref(trainingFocusHref('lea-id', 'Développé couché')), true);
  assert.equal(isTrainingHref('/clients/lea-id?tab=progress'), false);
  assert.equal(trainingFocusHref('sofia-id'), '/clients/sofia-id?tab=training');
  assert.equal(parseExerciseQuery(null), '');
  assert.equal(parseExerciseQuery('  Squat  '), 'Squat');
});
