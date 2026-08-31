import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  averageLoggedCalories,
  calorieGapKind,
  calorieGapPct,
  clientHomeNextAction,
  daysSinceActivity,
  isClientFirstRun,
  parseActivityTime,
  shouldShowDaysSinceReminder,
  statsCalorieSummary,
} from './clientHome';

const NOW = new Date('2026-08-30T12:00:00.000Z');

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const jade = {
  completedWorkoutCount: 0,
  nutritionLogCount: 0,
  checkinCount: 0,
  lastWorkoutAt: null,
  lastNutritionAt: null,
  lastCheckinAt: null,
};

test('Jade-like day-1: first-run is true even with epoch / empty last activity', () => {
  assert.equal(isClientFirstRun(jade), true);
  assert.equal(isClientFirstRun({ ...jade, lastWorkoutAt: '1970-01-01T00:00:00.000Z' }), true);
  assert.equal(isClientFirstRun({ ...jade, lastWorkoutAt: '' }), true);
  assert.equal(isClientFirstRun({ ...jade, lastCheckinAt: '0000-00-00' }), true);
});

test('any real session, food log or check-in leaves first-run', () => {
  assert.equal(isClientFirstRun({ ...jade, completedWorkoutCount: 1 }), false);
  assert.equal(isClientFirstRun({ ...jade, nutritionLogCount: 1 }), false);
  assert.equal(isClientFirstRun({ ...jade, checkinCount: 1 }), false);
  assert.equal(isClientFirstRun({ ...jade, lastWorkoutAt: '2026-08-28T18:00:00.000Z' }), false);
});

test('onboarding weigh-in alone does not count as client activity', () => {
  assert.equal(isClientFirstRun(jade), true);
});

test('days-since never invents 999 from null or epoch-zero', () => {
  assert.equal(daysSinceActivity(null, NOW), null);
  assert.equal(daysSinceActivity(undefined, NOW), null);
  assert.equal(daysSinceActivity('', NOW), null);
  assert.equal(daysSinceActivity('1970-01-01T00:00:00.000Z', NOW), null);
  assert.equal(daysSinceActivity('1970-01-01', NOW), null);
  assert.equal(parseActivityTime('not-a-date'), null);
  assert.equal(shouldShowDaysSinceReminder(null), false);
  assert.notEqual(daysSinceActivity(null, NOW), 999);
  assert.equal(daysSinceActivity('2026-08-27T12:00:00.000Z', NOW), 3);
  assert.equal(shouldShowDaysSinceReminder(3), true);
  assert.equal(shouldShowDaysSinceReminder(2), false);
});

test('0 logged kcal vs target is missing data, not 71% or 100% below', () => {
  assert.equal(calorieGapPct(0, 2000, false), null);
  assert.equal(calorieGapPct(0, 2000, true), null);
  assert.equal(calorieGapKind(null), null);
  assert.equal(statsCalorieSummary({ days: [], calorieTarget: 2000 }), null);
  assert.equal(statsCalorieSummary({ days: [{ calories: 0 }, { calories: 0 }], calorieTarget: 2000 }), null);
});

test('water-only zeros must not dilute a real day into a fake deficit', () => {
  const mixed = [
    { calories: 0 },
    { calories: 0 },
    { calories: 0 },
    { calories: 0 },
    { calories: 0 },
    { calories: 2000 },
    { calories: 2000 },
  ];
  assert.deepEqual(averageLoggedCalories(mixed), { avg: 2000, hasLogs: true });
  const padded = statsCalorieSummary({ days: mixed, calorieTarget: 2000 });
  assert.equal(padded?.kind, 'on_target');
});

test('real under-eating (580 vs 2000) is −71%, only when there are logs', () => {
  assert.equal(calorieGapPct(580, 2000, true), -71);
  assert.equal(calorieGapKind(-71), 'below');
  const summary = statsCalorieSummary({ days: [{ calories: 580 }], calorieTarget: 2000 });
  assert.deepEqual(summary, { kind: 'below', pct: 71 });
  assert.equal(calorieGapPct(580, 2000, false), null);
});

test('Jade next action: waiting for program or first session — never a forced check-in', () => {
  assert.equal(clientHomeNextAction({
    firstRun: true,
    hasProgram: false,
    hasNextWorkout: false,
    hasCoach: true,
  }), 'waiting_program');

  assert.equal(clientHomeNextAction({
    firstRun: true,
    hasProgram: true,
    hasNextWorkout: false,
    hasCoach: true,
  }), 'first_session');

  assert.equal(clientHomeNextAction({
    firstRun: true,
    hasProgram: true,
    hasNextWorkout: true,
    hasCoach: true,
  }), null);

  assert.equal(clientHomeNextAction({
    firstRun: true,
    hasProgram: false,
    hasNextWorkout: false,
    hasCoach: false,
  }), 'first_session');

  assert.equal(clientHomeNextAction({
    firstRun: false,
    hasProgram: true,
    hasNextWorkout: false,
    hasCoach: true,
  }), null);
});

test('client home copy is FR tutoiement; Dashboard never uses a 999 sentinel', () => {
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /waitingProgram: 'Ton coach va t’envoyer un programme'/);
  assert.match(fr, /firstSession: 'Première séance quand tu es prêt'/);

  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.doesNotMatch(dash, /:\s*999/);
  assert.match(dash, /isClientFirstRun/);
  assert.match(dash, /clientHomeNextAction/);
  assert.match(dash, /daysSinceActivity/);
  assert.match(dash, /shouldShowDaysSinceReminder/);
  assert.match(dash, /calmHome/);
  assert.doesNotMatch(dash, /\/recipes/);
  assert.doesNotMatch(dash, /navigate\('\/routines'\)/);
  assert.doesNotMatch(dash, /navigate\('\/programs\/new'\)/);
  assert.doesNotMatch(dash, /nextAction === 'checkin'/);
  assert.doesNotMatch(dash, /Navigate to="\/checkin"/);
  assert.match(dash, /showModule\(tracking, 'checkins'\) && !todayCheckin && !activityPending/);
  assert.match(dash, /!activityPending && \(/);

  const home = src('src/lib/clientHome.ts');
  assert.doesNotMatch(home, /return 'checkin'/);

  const stats = src('src/components/stats/StatsPage.tsx');
  assert.match(stats, /statsCalorieSummary/);
});
