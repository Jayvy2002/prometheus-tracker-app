import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkinFocusHref,
  checkinIdFromHref,
  checkinReviewRows,
  focusCheckin,
  formatCheckinScore,
  isUnreadCheckin,
  parseCheckinQuery,
  relanceHrefForCheckin,
} from './coachCheckins';
import { buildCoachPriorities, inferPrioritySinceIso } from './coachPriorities';
import type {
  ClientOpsRow,
  CoachClientSummary,
  CoachRosterSignals,
  DailyCheckin,
} from './types';

// Fixtures are dated 2026-08-28/29; the recency windows (7 d) must be judged from that day, not from
// the machine clock, or these tests turn red on their own once the fixtures age past the window.
const TODAY = '2026-08-29';

function checkin(partial: Partial<DailyCheckin> & Pick<DailyCheckin, 'id' | 'user_id'>): DailyCheckin {
  return {
    checked_at: '2026-08-28',
    hunger: null,
    fatigue: null,
    sleep_quality: 4,
    sleep_hours: null,
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

function client(id: string, name: string, lastVisitedAt: string | null = null): CoachClientSummary {
  return {
    id,
    full_name: name,
    email: `${id}@example.com`,
    avatar_url: '',
    linked_at: '2026-08-01T00:00:00Z',
    onboarding_completed: true,
    goal: 'cut',
    training_frequency: 4,
    target_weight_kg: 70,
    weight_kg: 74,
    last_visited_at: lastVisitedAt,
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

function signals(checkins: DailyCheckin[]): CoachRosterSignals {
  return {
    checkins,
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
  };
}

test('check-in deep-link opens the fiche Check-ins tab with that check-in id', () => {
  const href = checkinFocusHref('marie-id', 'ck-today');
  assert.equal(href, '/clients/marie-id?tab=checkins&checkin=ck-today');
  assert.equal(checkinIdFromHref(href), 'ck-today');
  assert.equal(parseCheckinQuery('ck-today'), 'ck-today');
  assert.equal(parseCheckinQuery('auto apply'), null);
  assert.equal(checkinFocusHref('marie-id'), '/clients/marie-id?tab=checkins');
});

test('File du jour pain/adherence items deep-link to Santé for pain, Check-ins otherwise', () => {
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
    signals([latest, prev]),
    TODAY,
  );
  const pain = priorities.find(p => p.kind === 'new_pain');
  assert.ok(pain);
  assert.equal(pain?.checkinId, 'ck-pain');
  assert.equal(pain?.href, '/clients/marie-id?tab=health&checkin=ck-pain');
  assert.equal(checkinIdFromHref(pain?.href ?? ''), 'ck-pain');
});

test('CHECK-INS À RELIRE lists the latest unread check-in; Relancer is the #21 thread+draft path', () => {
  const marie = client('marie-id', 'Marie Dupont', '2026-08-27T10:00:00Z');
  const latest = checkin({
    id: 'ck-unread',
    user_id: 'marie-id',
    checked_at: '2026-08-29',
    joint_pain: 4,
    created_at: '2026-08-29T07:00:00Z',
  });
  const rows = checkinReviewRows(
    [ops(marie)],
    signals([latest]),
    buildCoachPriorities([ops(marie)], signals([latest, checkin({ id: 'ck-old', user_id: 'marie-id', joint_pain: 1 })]), TODAY),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.checkin.id, 'ck-unread');
  assert.equal(rows[0]?.href, '/clients/marie-id?tab=health&checkin=ck-unread');
  assert.equal(rows[0]?.kind, 'new_pain');
  assert.equal(rows[0]?.relanceHref, '/messages/marie-id?nudge=general_followup');
  assert.equal(relanceHrefForCheckin('marie-id', 'new_pain'), '/messages/marie-id?nudge=general_followup');
});

test('a visited client with no flag and an older check-in is not in the review list', () => {
  const alex = client('alex-id', 'Alex Gagnon', '2026-08-29T12:00:00Z');
  const latest = checkin({
    id: 'ck-seen',
    user_id: 'alex-id',
    checked_at: '2026-08-28',
    created_at: '2026-08-28T08:00:00Z',
  });
  const rows = checkinReviewRows([ops(alex)], signals([latest]), []);
  assert.equal(rows.length, 0);
  assert.equal(isUnreadCheckin(latest, alex.last_visited_at), false);
});

test('missed check-in without any submitted check-in is not a review row', () => {
  const sofia = client('sofia-id', 'Sofia Martin');
  const rows = checkinReviewRows(
    [ops(sofia, ['missing_checkin'])],
    signals([]),
    buildCoachPriorities([ops(sofia, ['missing_checkin'])], signals([]), TODAY),
  );
  assert.equal(rows.length, 0);
});

test('a pain check-in already visited is not in CHECK-INS À RELIRE', () => {
  const marie = client('marie-id', 'Marie Dupont', '2026-08-29T12:00:00Z');
  const latest = checkin({
    id: 'ck-pain',
    user_id: 'marie-id',
    checked_at: '2026-08-29',
    joint_pain: 4,
    created_at: '2026-08-29T07:00:00Z',
  });
  const rows = checkinReviewRows(
    [ops(marie)],
    signals([latest]),
    buildCoachPriorities([ops(marie)], signals([latest, checkin({ id: 'ck-old', user_id: 'marie-id', joint_pain: 1 })]), TODAY),
  );
  assert.equal(rows.length, 0);
});

test('focusCheckin opens the requested check-in, not just the latest', () => {
  const older = checkin({ id: 'ck-old', user_id: 'marie-id', checked_at: '2026-08-20' });
  const latest = checkin({ id: 'ck-new', user_id: 'marie-id', checked_at: '2026-08-29' });
  assert.equal(focusCheckin([latest, older], 'ck-old')?.id, 'ck-old');
  assert.equal(focusCheckin([latest, older], 'missing')?.id, 'ck-new');
});

test('check-in scores: new 0–10 show /10; legacy 1–5 show the stored number', () => {
  assert.equal(formatCheckinScore(0), '0/10');
  assert.equal(formatCheckinScore(10), '10/10');
  assert.equal(formatCheckinScore(7), '7/10');
  assert.equal(formatCheckinScore(3), '3');
  assert.equal(formatCheckinScore(3.0), '3');
  assert.equal(formatCheckinScore(3.3), '3.3');
  assert.equal(formatCheckinScore(null), '—');
});

test('queue “depuis quand” is last check-in / session, else the coaching link', () => {
  const row = ops(client('marie-id', 'Marie'));
  const empty = signals([]);
  assert.equal(inferPrioritySinceIso({ kind: 'onboarding_incomplete' }, row, empty), '2026-08-01T00:00:00Z');
  assert.equal(inferPrioritySinceIso({ kind: 'missed_workout' }, row, empty), '2026-08-01T00:00:00Z');
  assert.equal(
    inferPrioritySinceIso(
      { kind: 'missed_checkin' },
      row,
      signals([checkin({ id: 'ck', user_id: 'marie-id', checked_at: '2026-08-20T08:00:00Z' })]),
    ),
    '2026-08-20',
  );
});
