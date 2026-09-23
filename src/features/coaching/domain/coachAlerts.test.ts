import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClientOpsRows, coachClockFacts, linkedForAtLeast, weekAgoStr, windowStart } from './coachAlerts';
import type { CoachClientSummary, ClientTrackingConfig } from '../../../lib/types';

const client = {
  id: 'client-1', full_name: 'Hugo', email: '', avatar_url: '', linked_at: '',
  onboarding_completed: true, goal: '', training_frequency: 5,
  target_weight_kg: 0, weight_kg: 0, last_visited_at: null,
  last_nudged_at: null, daily_calorie_target: 0,
} as CoachClientSummary;

function alertsAt(localHour: number, workoutDates: string[] = []) {
  const today = '2026-08-31'; // Monday
  return buildClientOpsRows([client], {
    today, weekAgo: weekAgoStr(today), weekday: 1, localHour,
    missedWorkoutCutoffHour: 21,
    checkinUserIds: new Set(['client-1']),
    nutritionUserIds: new Set(['client-1']),
    weightUserIds: new Set(['client-1']),
    workoutDatesByUser: new Map([['client-1', workoutDates]]),
    scheduledWeekdaysByClient: new Map([['client-1', new Set([1, 3, 5])]]),
    assignedClientIds: new Set(['client-1']),
    trackingByClient: new Map([['client-1', {
      track_weight: true, track_checkins: true, track_nutrition: true,
      track_workouts: true, setup_completed_at: '2026-08-01',
    } as ClientTrackingConfig]]),
  })[0].alerts;
}

test('today workout is not called missed before the coach cutoff', () => {
  assert.doesNotMatch(alertsAt(18).join(','), /missing_workout/);
  assert.ok(alertsAt(21).includes('missing_workout_today'));
});

test('coach clock uses the configured timezone around UTC midnight', () => {
  const clock = coachClockFacts(new Date('2026-09-01T00:30:00Z'), 'America/Toronto');
  assert.deepEqual(clock, { today: '2026-08-31', weekday: 1, localHour: 20 });
});

function checkinAlertsFor(opts: { linkedAt: string; checkedInWithinWeek: boolean }) {
  const today = '2026-08-31';
  return buildClientOpsRows([{ ...client, linked_at: opts.linkedAt }], {
    today, weekAgo: weekAgoStr(today), weekday: 1, localHour: 10,
    missedWorkoutCutoffHour: 21,
    checkinUserIds: new Set(opts.checkedInWithinWeek ? ['client-1'] : []),
    nutritionUserIds: new Set(),
    weightUserIds: new Set(),
    workoutDatesByUser: new Map(),
    scheduledWeekdaysByClient: new Map(),
    assignedClientIds: new Set(['client-1']),
    trackingByClient: new Map([['client-1', {
      track_weight: true, track_checkins: true, track_nutrition: true,
      track_workouts: false, setup_completed_at: '2026-08-01',
    } as ClientTrackingConfig]]),
  })[0].alerts;
}

test('a client linked today has missed nothing yet', () => {
  const alerts = checkinAlertsFor({ linkedAt: '2026-08-31T08:00:00Z', checkedInWithinWeek: false });
  assert.equal(alerts.includes('missing_checkin'), false);
  assert.equal(alerts.includes('missing_nutrition'), false);
  assert.equal(alerts.includes('missing_weight'), false);
});

test('check-in silence is a 7-day window, not a daily expectation', () => {
  // Linked long ago, checked in once this week: no alert even without a check-in today.
  assert.equal(checkinAlertsFor({ linkedAt: '2026-06-01', checkedInWithinWeek: true }).includes('missing_checkin'), false);
  // A full week of silence after the window could be observed: the coach is told.
  assert.equal(checkinAlertsFor({ linkedAt: '2026-06-01', checkedInWithinWeek: false }).includes('missing_checkin'), true);
  // Nutrition waits 3 days of link age, weight 7.
  const threeDaysIn = checkinAlertsFor({ linkedAt: '2026-08-28', checkedInWithinWeek: false });
  assert.equal(threeDaysIn.includes('missing_nutrition'), true);
  assert.equal(threeDaysIn.includes('missing_weight'), false);
  assert.equal(threeDaysIn.includes('missing_checkin'), false);
});

test('window helpers count the window inclusively from today', () => {
  assert.equal(windowStart('2026-08-31', 7), '2026-08-25');
  assert.equal(windowStart('2026-08-31', 1), '2026-08-31');
  assert.equal(linkedForAtLeast('2026-08-24', '2026-08-31', 7), true);
  assert.equal(linkedForAtLeast('2026-08-25', '2026-08-31', 7), false);
  assert.equal(linkedForAtLeast('', '2026-08-31', 7), true);
});
