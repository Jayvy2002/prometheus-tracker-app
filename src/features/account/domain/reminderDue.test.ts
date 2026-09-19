import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  isProgramTrainingWeekday,
  shouldSendDailyReminder,
  shouldShowReminderPermissionPrompt,
  weekdayInTimeZone,
} from './reminderDue';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const TUE = new Date('2026-09-15T18:00:00.000Z');

test('weekday follows the profile timezone, not UTC alone', () => {
  assert.equal(weekdayInTimeZone(TUE, 'UTC'), 2);
  assert.equal(weekdayInTimeZone(TUE, 'America/Toronto'), 2);
  assert.equal(weekdayInTimeZone(TUE, 'Asia/Tokyo'), 3);
});

test('assigned plan: rest day and empty plan are not a workout task', () => {
  const days = [
    { weekday: 1, name: 'Push', exerciseCount: 3 },
    { weekday: 3, name: 'Pull', exerciseCount: 2 },
    { weekday: 5, name: '', exerciseCount: 0 },
  ];
  assert.equal(isProgramTrainingWeekday(days, 1), true);
  assert.equal(isProgramTrainingWeekday(days, 2), false);
  assert.equal(isProgramTrainingWeekday(days, 5), false);
  assert.equal(isProgramTrainingWeekday([{ weekday: 2, name: '', exerciseCount: 0 }], 2), false);
  assert.equal(isProgramTrainingWeekday([
    { weekday: null, name: 'A', exerciseCount: 1 },
    { weekday: null, name: 'B', exerciseCount: 1 },
  ], 0), true);
});

test('shouldSendDailyReminder skips finished, off-module, and rest-day workout pings', () => {
  assert.equal(shouldSendDailyReminder({
    kind: 'workout', trackingOn: true, loggedToday: false, hasAssignedProgram: false, todayIsTrainingDay: false,
  }), true);
  assert.equal(shouldSendDailyReminder({
    kind: 'workout', trackingOn: true, loggedToday: true, hasAssignedProgram: false, todayIsTrainingDay: true,
  }), false);
  assert.equal(shouldSendDailyReminder({
    kind: 'workout', trackingOn: false, loggedToday: false, hasAssignedProgram: false, todayIsTrainingDay: true,
  }), false);
  assert.equal(shouldSendDailyReminder({
    kind: 'workout', trackingOn: true, loggedToday: false, hasAssignedProgram: true, todayIsTrainingDay: false,
  }), false);
  assert.equal(shouldSendDailyReminder({
    kind: 'workout', trackingOn: true, loggedToday: false, hasAssignedProgram: true, todayIsTrainingDay: true,
  }), true);
  assert.equal(shouldSendDailyReminder({
    kind: 'nutrition', trackingOn: true, loggedToday: false, hasAssignedProgram: true, todayIsTrainingDay: false,
  }), true);
  assert.equal(shouldSendDailyReminder({
    kind: 'nutrition', trackingOn: true, loggedToday: true, hasAssignedProgram: false, todayIsTrainingDay: true,
  }), false);
});

test('permission prompt is after a useful action, never when blocked or already on', () => {
  assert.equal(shouldShowReminderPermissionPrompt({
    reminderAlreadyEnabled: false, permission: 'default', dismissed: false,
  }), true);
  assert.equal(shouldShowReminderPermissionPrompt({
    reminderAlreadyEnabled: false, permission: 'granted', dismissed: false,
  }), true);
  assert.equal(shouldShowReminderPermissionPrompt({
    reminderAlreadyEnabled: true, permission: 'granted', dismissed: false,
  }), false);
  assert.equal(shouldShowReminderPermissionPrompt({
    reminderAlreadyEnabled: false, permission: 'denied', dismissed: false,
  }), false);
  assert.equal(shouldShowReminderPermissionPrompt({
    reminderAlreadyEnabled: false, permission: 'unsupported', dismissed: false,
  }), false);
  assert.equal(shouldShowReminderPermissionPrompt({
    reminderAlreadyEnabled: false, permission: 'default', dismissed: true,
  }), false);
});

test('UX64 wires recap prompt, no signup request, edge skips rest days', () => {
  const recap = src('src/components/workout/WorkoutRecap.tsx');
  assert.match(recap, /ReminderPermissionPrompt/);
  const prompt = src('src/components/profile/ReminderPermissionPrompt.tsx');
  assert.match(prompt, /shouldShowReminderPermissionPrompt/);
  assert.match(prompt, /requestNotificationPermission/);
  assert.match(prompt, /reminder-permission-prompt/);
  assert.match(prompt, /prometheus_reminder_prompt/);
  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.doesNotMatch(dash, /requestNotificationPermission/);
  const edge = src('supabase/functions/send-daily-reminders/index.ts');
  assert.match(edge, /shouldSendDailyReminder/);
  assert.match(edge, /program_assignments/);
  assert.match(edge, /program_days/);
  assert.match(edge, /weekdayInTimeZone/);
  assert.match(edge, /todayIsTrainingDay/);
  const settings = src('src/components/profile/NotificationSettings.tsx');
  assert.match(settings, /workoutReminderDesc/);
  const fr = src('src/i18n/locales/fr/common.ts');
  const en = src('src/i18n/locales/en/common.ts');
  assert.match(fr, /askAfterWorkout:/);
  assert.match(en, /askAfterWorkout:/);
  assert.doesNotMatch(fr, /askAfterWorkout:.*Premium/);
  assert.doesNotMatch(en, /askAfterWorkout:.*Premium/);
});
