import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoachPriorities } from './coachPriorities';
import { checkinReviewRows } from './coachCheckins';
import { groupQueueByClient, relanceThreadHref, resolveQueueAction } from './coachQueue';
import {
  canAskRecoveryAdjust,
  highHungerPriority,
  highStressPriority,
  isLowSleep,
  isPainFlag,
  isRecentCheckin,
  isRecoveryHref,
  lowMoodPriority,
  lowSleepPriority,
  painPriority,
  parseClientTab,
  recoveryContextPayload,
  recoveryFocusHref,
  recoverySnapshot,
  relanceHrefForRecovery,
  resolveClientTab,
} from './coachRecovery';
import type {
  ClientOpsRow,
  CoachClientSummary,
  CoachRosterSignals,
  DailyCheckin,
} from './types';

const TODAY = '2026-08-29';

function checkin(partial: Partial<DailyCheckin> & Pick<DailyCheckin, 'id' | 'user_id'>): DailyCheckin {
  return {
    checked_at: '2026-08-28',
    hunger: null,
    fatigue: null,
    sleep_quality: 4,
    sleep_hours: 7.5,
    stress: null,
    motivation: 4,
    muscle_soreness: null,
    joint_pain: 1,
    adherence_nutrition: 4,
    adherence_training: 4,
    energy_level: 4,
    mood: 4,
    notes: '',
    created_at: '2026-08-28T08:00:00Z',
    updated_at: '2026-08-28T08:00:00Z',
    ...partial,
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
    checkins: [],
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

test('recovery snapshot is THAT check-in (sleep, pain, energy) — not a dump or invented score', () => {
  const latest = checkin({
    id: 'ck-today',
    user_id: 'lea-id',
    checked_at: '2026-08-29',
    sleep_hours: 6.5,
    sleep_quality: 3,
    joint_pain: 4,
    energy_level: 2,
    muscle_soreness: 3,
    notes: 'genou gauche',
    created_at: '2026-08-29T07:00:00Z',
  });
  const prev = checkin({
    id: 'ck-prev',
    user_id: 'lea-id',
    checked_at: '2026-08-22',
    sleep_hours: 7.5,
    joint_pain: 1,
    energy_level: 4,
  });
  const older = checkin({
    id: 'ck-old',
    user_id: 'lea-id',
    checked_at: '2026-08-15',
    sleep_hours: 8,
    joint_pain: 1,
    energy_level: 4,
  });

  const view = recoverySnapshot([latest, prev, older], { today: TODAY });
  assert.ok(view);
  assert.equal(view?.checkin.id, 'ck-today');
  assert.equal(view?.sleepHours, 6.5);
  assert.equal(view?.pain, 4);
  assert.equal(view?.energy, 2);
  assert.equal(view?.soreness, 3);
  assert.equal(view?.notes, 'genou gauche');
  assert.deepEqual(view?.trend.sleepHours, [7.5, 6.5]);
  assert.deepEqual(view?.trend.pain, [1, 4]);
  assert.equal(canAskRecoveryAdjust(view!), true);

  const ctx = recoveryContextPayload(view!);
  assert.equal(ctx.checkin_id, 'ck-today');
  assert.equal(ctx.joint_pain, 4);
  assert.equal(ctx.sleep_hours, 6.5);
});

test('empty recovery: Sofia stale / Alex none — Relancer, no invented sleep or pain', () => {
  assert.equal(recoverySnapshot([], { today: TODAY }), null);

  const stale = checkin({
    id: 'ck-stale',
    user_id: 'sofia-id',
    checked_at: '2026-07-20',
    sleep_hours: 4,
    joint_pain: 5,
    created_at: '2026-07-20T08:00:00Z',
  });
  assert.equal(isRecentCheckin(stale, TODAY), false);
  assert.equal(recoverySnapshot([stale], { today: TODAY }), null);

  const sofiaLast = checkin({
    id: 'ck-sofia',
    user_id: 'sofia-id',
    checked_at: '2026-08-18',
    sleep_hours: 7,
    joint_pain: 1,
    created_at: '2026-08-18T08:00:00Z',
  });
  assert.equal(recoverySnapshot([sofiaLast], { today: TODAY }), null);
  assert.equal(
    painPriority('sofia-id', 'Sofia Martin', '', stale, null, TODAY),
    null,
  );
  assert.equal(
    lowSleepPriority('sofia-id', 'Sofia Martin', '', stale, TODAY),
    null,
  );

  const alex = client('alex-id', 'Alex Gagnon');
  const priorities = buildCoachPriorities(
    [ops(alex, ['missing_checkin'])],
    emptySignals(),
    TODAY,
  );
  assert.equal(priorities.some(p => p.kind === 'new_pain' || p.kind === 'low_sleep'), false);
  const missed = priorities.find(p => p.kind === 'missed_checkin');
  assert.ok(missed);
  const action = resolveQueueAction(missed!, []);
  assert.equal(action.kind, 'compose');
  assert.equal(action.href, relanceThreadHref('alex-id', 'missed_checkins'));
  assert.equal(relanceHrefForRecovery('sofia-id', false), '/messages/sofia-id?nudge=missed_checkins');
});

test('Aujourd’hui douleur deep-links to ?tab=health — Relancer stays thread+draft', () => {
  const marie = client('marie-id', 'Marie Dupont');
  const latest = checkin({
    id: 'ck-pain',
    user_id: 'marie-id',
    checked_at: '2026-08-29',
    joint_pain: 4,
    sleep_hours: 7,
    created_at: '2026-08-29T07:00:00Z',
  });
  const prev = checkin({
    id: 'ck-prev',
    user_id: 'marie-id',
    checked_at: '2026-08-28',
    joint_pain: 1,
  });
  const sofia = client('sofia-id', 'Sofia Martin');
  const stale = checkin({
    id: 'ck-stale',
    user_id: 'sofia-id',
    checked_at: '2026-07-20',
    joint_pain: 5,
    sleep_hours: 4,
  });

  const priorities = buildCoachPriorities(
    [ops(marie), ops(sofia, ['missing_checkin'])],
    emptySignals({ checkins: [latest, prev, stale] }),
    TODAY,
  );

  const pain = priorities.find(p => p.clientId === 'marie-id' && p.kind === 'new_pain');
  assert.ok(pain);
  assert.equal(pain?.checkinId, 'ck-pain');
  assert.equal(pain?.href, recoveryFocusHref('marie-id', 'ck-pain'));
  assert.equal(isRecoveryHref(pain!.href), true);
  assert.equal(pain?.href.includes('tab=health'), true);

  const painAction = resolveQueueAction(pain!, []);
  assert.equal(painAction.kind, 'open_360');
  assert.equal(painAction.href, pain?.href);
  assert.equal(painAction.ctaKey, 'coaching.queue.openRecovery');

  const review = checkinReviewRows(
    [ops(marie)],
    emptySignals({ checkins: [latest, prev] }),
    priorities,
  );
  assert.equal(review[0]?.kind, 'new_pain');
  assert.equal(review[0]?.href, recoveryFocusHref('marie-id', 'ck-pain'));
  assert.equal(review[0]?.relanceHref, relanceThreadHref('marie-id', 'general_followup'));

  assert.equal(priorities.some(p => p.clientId === 'sofia-id' && p.kind === 'new_pain'), false);
  const sofiaMissed = priorities.find(p => p.clientId === 'sofia-id' && p.kind === 'missed_checkin');
  assert.ok(sofiaMissed);
  assert.equal(resolveQueueAction(sofiaMissed!, []).kind, 'compose');
});

test('low sleep in a recent check-in appears; missing sleep is not invented', () => {
  const camille = client('camille-id', 'Camille Roux');
  const short = checkin({
    id: 'ck-sleep',
    user_id: 'camille-id',
    checked_at: '2026-08-29',
    sleep_hours: 4.5,
    sleep_quality: 2,
    joint_pain: 1,
    energy_level: 2,
    created_at: '2026-08-29T07:00:00Z',
  });
  assert.equal(isLowSleep(short), true);
  assert.equal(isPainFlag(short), false);

  const priorities = buildCoachPriorities(
    [ops(camille)],
    emptySignals({ checkins: [short] }),
    TODAY,
  );
  const sleep = priorities.find(p => p.kind === 'low_sleep');
  assert.ok(sleep);
  assert.equal(sleep?.href, recoveryFocusHref('camille-id', 'ck-sleep'));
  assert.equal(resolveQueueAction(sleep!, []).ctaKey, 'coaching.queue.openRecovery');

  const noSleep = checkin({
    id: 'ck-ok',
    user_id: 'lea-id',
    checked_at: '2026-08-29',
    sleep_hours: null,
    sleep_quality: null,
    joint_pain: 1,
  });
  assert.equal(isLowSleep(noSleep), false);
  assert.equal(lowSleepPriority('lea-id', 'Léa', '', noSleep, TODAY), null);
});

test('recoveryFocusHref is ?tab=health&checkin= and tab=recovery alias opens Santé', () => {
  assert.equal(
    recoveryFocusHref('marie-id', 'ck-pain'),
    '/clients/marie-id?tab=health&checkin=ck-pain',
  );
  assert.equal(isRecoveryHref(recoveryFocusHref('marie-id', 'ck-pain')), true);
  assert.equal(isRecoveryHref('/clients/marie-id?tab=recovery'), true);
  assert.equal(isRecoveryHref('/clients/marie-id?tab=checkins&checkin=ck-pain'), false);
  assert.equal(parseClientTab('recovery'), 'health');
  assert.equal(parseClientTab('health'), 'health');
  assert.equal(resolveClientTab('recovery', 'ck-pain'), 'health');
  assert.equal(resolveClientTab(null, 'ck-pain'), 'checkins');
  assert.equal(resolveClientTab(null, null), 'overview');
  assert.equal(relanceHrefForRecovery('marie-id', true), '/messages/marie-id?nudge=general_followup');
});

test('File du jour pain items use the Santé deep-link', () => {
  const marie = client('marie-id', 'Marie Dupont');
  const latest = checkin({
    id: 'ck-pain',
    user_id: 'marie-id',
    checked_at: '2026-08-29',
    joint_pain: 4,
    created_at: '2026-08-29T07:00:00Z',
  });
  const prev = checkin({
    id: 'ck-prev',
    user_id: 'marie-id',
    checked_at: '2026-08-28',
    joint_pain: 1,
  });
  const priorities = buildCoachPriorities(
    [ops(marie)],
    emptySignals({ checkins: [latest, prev] }),
    TODAY,
  );
  const groups = groupQueueByClient(priorities.filter(p => p.kind === 'new_pain'));
  assert.equal(groups[0]?.items[0]?.href, recoveryFocusHref('marie-id', 'ck-pain'));
  assert.equal(groups[0]?.items[0]?.checkinId, 'ck-pain');
});

test('explicit checkin query opens that snapshot even when it is not the newest', () => {
  const older = checkin({
    id: 'ck-old',
    user_id: 'lea-id',
    checked_at: '2026-08-20',
    sleep_hours: 5,
    joint_pain: 3,
  });
  const latest = checkin({
    id: 'ck-new',
    user_id: 'lea-id',
    checked_at: '2026-08-29',
    sleep_hours: 8,
    joint_pain: 1,
  });
  const view = recoverySnapshot([latest, older], { today: TODAY, checkinId: 'ck-old' });
  assert.equal(view?.checkin.id, 'ck-old');
  assert.equal(view?.sleepHours, 5);
  assert.equal(view?.pain, 3);
});

test('recent high stress / low mood / high hunger become recovery priorities', () => {
  const row = checkin({
    id: 'ck-scores',
    user_id: 'marie-id',
    checked_at: '2026-08-29',
    stress: 8,
    mood: 2,
    hunger: 9,
    joint_pain: 0,
    sleep_quality: 7,
    energy_level: 6,
    created_at: '2026-08-29T07:00:00Z',
  });
  const stress = highStressPriority('marie-id', 'Marie', '', row, TODAY);
  const mood = lowMoodPriority('marie-id', 'Marie', '', row, TODAY);
  const hunger = highHungerPriority('marie-id', 'Marie', '', row, TODAY);
  assert.ok(stress);
  assert.ok(mood);
  assert.ok(hunger);
  assert.equal(stress?.kind, 'high_stress');
  assert.equal(mood?.kind, 'low_mood');
  assert.equal(hunger?.kind, 'high_hunger');
  assert.equal(resolveQueueAction(stress!, []).ctaKey, 'coaching.queue.openRecovery');

  const stale = checkin({
    id: 'ck-old-scores',
    user_id: 'marie-id',
    checked_at: '2026-07-01',
    stress: 9,
    mood: 1,
    hunger: 10,
    joint_pain: 0,
  });
  assert.equal(highStressPriority('marie-id', 'Marie', '', stale, TODAY), null);

  const view = recoverySnapshot([row], { today: TODAY });
  assert.equal(view?.stress, 8);
  assert.equal(view?.mood, 2);
  assert.equal(view?.hunger, 9);
  assert.equal(recoveryContextPayload(view!).stress, 8);

  const priorities = buildCoachPriorities(
    [ops(client('marie-id', 'Marie Dupont'))],
    emptySignals({ checkins: [row] }),
    TODAY,
  );
  assert.ok(priorities.some(p => p.kind === 'high_stress'));
  assert.ok(priorities.some(p => p.kind === 'low_mood'));
  assert.ok(priorities.some(p => p.kind === 'high_hunger'));
});
