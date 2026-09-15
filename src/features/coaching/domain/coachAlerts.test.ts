import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClientOpsRows, coachClockFacts, weekAgoStr } from './coachAlerts';
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
