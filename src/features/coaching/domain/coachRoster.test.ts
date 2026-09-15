import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { clientFileHref } from './coachSituation';
import {
  ROSTER_RANK,
  buildRosterRow,
  compareRosterName,
  rosterBackPath,
  rosterChainState,
  rosterFromLocationState,
  rosterIdsFromLocationState,
  rosterNeighbors,
  rosterGoalStatus,
  rosterKcalHint,
  sortRosterClients,
} from './coachRoster';
import type {
  ClientLiftProgress,
  ClientOpsRow,
  CoachClientSummary,
  CoachRosterSignals,
  DailyCheckin,
  LiftSessionSnapshot,
  NutritionLogSnapshot,
} from '../../../lib/types';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';

const TODAY = '2026-08-29';

function client(
  id: string,
  name: string,
  extra: Partial<CoachClientSummary> = {},
): CoachClientSummary {
  return {
    id,
    full_name: name,
    email: `${id}@example.com`,
    avatar_url: '',
    linked_at: '2026-07-01T00:00:00Z',
    onboarding_completed: true,
    goal: 'cut',
    training_frequency: 4,
    target_weight_kg: 0,
    weight_kg: 0,
    last_visited_at: null,
    last_nudged_at: null,
    daily_calorie_target: 2100,
    ...extra,
  };
}

function ops(row: CoachClientSummary, extras: Partial<ClientOpsRow> = {}): ClientOpsRow {
  return {
    client: row,
    alerts: [],
    hasScheduledTrainingToday: true,
    hasProgram: true,
    setupCompleted: true,
    ...extras,
  };
}

function session(date: string): LiftSessionSnapshot {
  return {
    date,
    workoutId: `w-${date}`,
    workoutName: 'Lower',
    maxWeight: 80,
    bestSet: '80kg × 5',
    avgRir: 2,
    volume: 400,
    sets: [{ weight_kg: 80, reps: 5, rir: 2, completed: true }],
  };
}

function lift(clientId: string, date: string): ClientLiftProgress {
  return {
    clientId,
    exerciseName: 'squat',
    displayName: 'Squat',
    stalled: false,
    sessions: [session(date)],
  };
}

function log(userId: string, date: string, calories: number): NutritionLogSnapshot {
  return { user_id: userId, logged_at: date, calories };
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

const alex = client('alex-id', 'Alex Martin', { onboarding_completed: false, goal: '' });
const emile = client('emile-id', 'Émile', { goal: 'maintain', daily_calorie_target: 0 });
const jade = client('jade-id', 'Jade', { goal: 'cut', daily_calorie_target: 2100 });
const lea = client('lea-id', 'Léa', { goal: 'bulk', daily_calorie_target: 2600 });
const camille = client('camille-id', 'Camille', { goal: 'cut', daily_calorie_target: 2000 });

const ctx = {
  today: TODAY,
  opsRows: [
    ops(alex, { hasProgram: false, setupCompleted: false, alerts: ['onboarding_incomplete'] }),
    ops(emile, { hasProgram: false, alerts: ['program_unassigned', 'missing_workout_week'] }),
    ops(jade),
    ops(lea),
    ops(camille),
  ],
  signals: emptySignals({
    assignmentName: {
      'jade-id': 'Upper/Lower Jade',
      'lea-id': 'Hypertrophie Léa',
      'camille-id': 'Force Camille',
    },
    calorieTargets: {
      'jade-id': 2100,
      'lea-id': 2600,
      'camille-id': 2000,
    },
    lifts: [
      lift('jade-id', '2026-08-28'),
      lift('lea-id', '2026-08-27'),
      lift('camille-id', '2026-08-28'),
      lift('emile-id', '2026-08-14'),
    ],
    nutritionLogs: [
      log('jade-id', '2026-08-28', 2080),
      log('jade-id', '2026-08-27', 2120),
      log('jade-id', '2026-08-26', 2050),
      log('lea-id', '2026-08-28', 2550),
      log('camille-id', '2026-08-28', 1980),
    ],
  }),
};

test('goal status is cut / bulk / perf (maintain), not a raw DB string', () => {
  assert.equal(rosterGoalStatus('cut'), 'cut');
  assert.equal(rosterGoalStatus('lose'), 'cut');
  assert.equal(rosterGoalStatus('bulk'), 'bulk');
  assert.equal(rosterGoalStatus('gain'), 'bulk');
  assert.equal(rosterGoalStatus('maintain'), 'perf');
  assert.equal(rosterGoalStatus('recomp'), 'perf');
  assert.equal(rosterGoalStatus(''), '');
});

test('kcal hint is logged vs target, or an adherence hint — never a calorie cut', () => {
  const jadeKcal = rosterKcalHint(jade, ctx.signals, TODAY);
  assert.deepEqual(jadeKcal, { kind: 'vs_target', logged: 2083, target: 2100 });

  const emileKcal = rosterKcalHint(emile, ctx.signals, TODAY);
  assert.deepEqual(emileKcal, { kind: 'none' });

  const noLogs = client('ghost-kcal', 'Sofia', { daily_calorie_target: 1900 });
  assert.deepEqual(rosterKcalHint(noLogs, emptySignals({ calorieTargets: { 'ghost-kcal': 1900 } }), TODAY), {
    kind: 'no_logs',
  });

  const src = readFileSync(resolve(process.cwd(), 'src/features/coaching/domain/coachRoster.ts'), 'utf8');
  assert.doesNotMatch(src, /calorie_adjustment/);
  assert.doesNotMatch(src, /cut_stall/);
});

test('row shows goal, kcal, program name or pas de programme; active click is 360 overview', () => {
  const jadeRow = buildRosterRow(jade, ctx);
  assert.equal(jadeRow.goalStatus, 'cut');
  assert.equal(jadeRow.programName, 'Upper/Lower Jade');
  assert.equal(jadeRow.hasProgram, true);
  assert.equal(jadeRow.forceSetup, false);
  assert.equal(jadeRow.href, clientFileHref('jade-id'));
  assert.equal(jadeRow.href, '/clients/jade-id?tab=overview');
  assert.equal(jadeRow.kcal.kind, 'vs_target');

  const emileRow = buildRosterRow(emile, ctx);
  assert.equal(emileRow.goalStatus, 'perf');
  assert.equal(emileRow.programName, null);
  assert.equal(emileRow.hasProgram, false);
  assert.equal(emileRow.isGhost, true);
  assert.equal(emileRow.forceSetup, false);
  assert.equal(emileRow.href, clientFileHref('emile-id'));

  const alexRow = buildRosterRow(alex, ctx);
  assert.equal(alexRow.forceSetup, true);
  assert.equal(alexRow.href, '/clients/alex-id/setup');
  assert.equal(alexRow.hasProgram, false);
});

test('sort is deterministic: needs-attention first, then name — same order every load', () => {
  const shuffled = [lea, camille, emile, jade, alex];
  const again = [jade, alex, lea, emile, camille];
  const a = sortRosterClients(shuffled, ctx).map(r => r.client.id);
  const b = sortRosterClients(again, ctx).map(r => r.client.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['alex-id', 'emile-id', 'camille-id', 'jade-id', 'lea-id']);

  const ranks = sortRosterClients(shuffled, ctx).map(r => r.attentionRank);
  assert.equal(ranks[0], ROSTER_RANK.setup);
  assert.equal(ranks[1], ROSTER_RANK.noProgram);
  assert.ok(ranks.slice(2).every(r => r === ROSTER_RANK.onTrack));
});

test('ghost with a program ranks after no-program, before on-track', () => {
  const sofia = client('sofia-id', 'Sofia');
  const local = {
    ...ctx,
    opsRows: [...ctx.opsRows, ops(sofia)],
    signals: {
      ...ctx.signals,
      assignmentName: { ...ctx.signals.assignmentName, 'sofia-id': 'Full body Sofia' },
      lifts: [...ctx.signals.lifts, lift('sofia-id', '2026-08-10')],
    },
  };
  const ids = sortRosterClients([lea, sofia, emile, alex], local).map(r => r.client.id);
  assert.deepEqual(ids, ['alex-id', 'emile-id', 'sofia-id', 'lea-id']);
  const sofiaRow = buildRosterRow(sofia, local);
  assert.equal(sofiaRow.attentionRank, ROSTER_RANK.ghost);
  assert.equal(sofiaRow.programName, 'Full body Sofia');
  assert.equal(sofiaRow.kcal.kind, 'no_logs');
});

test('name tie-break is stable even without ops (thin profiles query)', () => {
  const names = [lea, camille, jade, emile, alex];
  const sorted = [...names].sort(compareRosterName).map(c => c.id);
  const sortedAgain = [...names].reverse().sort(compareRosterName).map(c => c.id);
  assert.deepEqual(sorted, sortedAgain);
  assert.deepEqual(sorted, ['alex-id', 'camille-id', 'emile-id', 'jade-id', 'lea-id']);
});

test('Clients page uses the roster sort and row facts, Setup only if not configured', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientsPage.tsx'), 'utf8');
  assert.match(page, /sortRosterClients/);
  assert.match(page, /rosterList/);
  assert.match(page, /forceSetup &&/);
  assert.match(page, /shouldOpenSetup|forceSetup/);
  assert.match(page, /clientFileHref/);
  assert.match(page, /rosterBackPath/);
  assert.match(page, /rosterChainState/);
  assert.doesNotMatch(page, /lastMessageForClient/);
  assert.doesNotMatch(page, /navigate\('\/programs'\)/);

  const detail = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientDetailPage.tsx'), 'utf8') + readFileSync(resolve(process.cwd(), 'src/features/coaching/hooks/useClientDossier.ts'), 'utf8');
  assert.match(detail, /rosterFromLocationState/);
  assert.match(detail, /rosterNeighbors/);
  assert.match(detail, /setSearchParams\(params, \{ replace: true, state: location\.state \}\)/);
  assert.match(detail, /navigate\(rosterBack\)/);
  assert.doesNotMatch(detail, /navigate\('\/clients'\)/);

  const fr = i18nLocaleSource('fr');
  assert.match(fr, /noProgram:\s*'Pas de programme'/);
  assert.match(fr, /goalCut:\s*'Sèche'/);
  assert.match(fr, /goalPerf:\s*'Perf'/);
  assert.match(fr, /prevFile:\s*'Fiche précédente'/);
  assert.match(fr, /nextFile:\s*'Fiche suivante'/);
});

test('roster back path keeps the filter; unknown state falls back to /clients', () => {
  assert.equal(rosterBackPath(null), '/clients');
  assert.equal(rosterBackPath('pain'), '/clients?filter=pain');
  assert.equal(rosterFromLocationState({ from: '/clients?filter=stalled' }), '/clients?filter=stalled');
  assert.equal(rosterFromLocationState({ from: '/dashboard' }), '/dashboard');
  assert.equal(rosterFromLocationState({ from: 'https://evil.example/clients' }), '/clients');
  assert.equal(rosterFromLocationState(null), '/clients');
});

test('roster chain walks the filtered list without rebuilding it', () => {
  const ids = ['invitee-id', 'client-id', 'third-id'];
  assert.deepEqual(rosterNeighbors(ids, 'invitee-id'), {
    prevId: null, nextId: 'client-id', index: 0, total: 3,
  });
  assert.deepEqual(rosterNeighbors(ids, 'client-id'), {
    prevId: 'invitee-id', nextId: 'third-id', index: 1, total: 3,
  });
  assert.deepEqual(rosterNeighbors(ids, 'third-id'), {
    prevId: 'client-id', nextId: null, index: 2, total: 3,
  });
  assert.deepEqual(rosterNeighbors(ids, 'unknown'), {
    prevId: null, nextId: null, index: -1, total: 3,
  });
  assert.deepEqual(rosterIdsFromLocationState({ rosterIds: ids, from: '/clients' }), ids);
  assert.deepEqual(rosterIdsFromLocationState({ rosterIds: ['ok', '/evil'] }), ['ok']);
  assert.deepEqual(rosterIdsFromLocationState({ rosterIds: 'nope' }), []);
  assert.deepEqual(rosterChainState('/clients?filter=checkin', ids).rosterIds, ids);
});
