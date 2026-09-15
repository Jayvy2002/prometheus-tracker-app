import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  averageLoggedCalories,
  calorieGapKind,
  calorieGapPct,
  clientHomeNextAction,
  clientHomeNextActionKey,
  daysSinceActivity,
  isClientFirstRun,
  parseActivityTime,
  pickClientHomeStrip,
  pickTodayReminder,
  shouldShowDaysSinceReminder,
  statsCalorieSummary,
} from './clientHome';
import { i18nLocaleSource } from './i18nLocaleSource';

const NOW = new Date('2026-08-30T12:00:00.000Z');

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
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

  // Ex-solo who just joined a coach: history, no program yet → still waiting for the coach.
  assert.equal(clientHomeNextAction({
    firstRun: false,
    hasProgram: false,
    hasNextWorkout: false,
    hasCoach: true,
  }), 'waiting_program');
  assert.equal(clientHomeNextActionKey('waiting_program'), 'dashboard.firstRun.waitingProgram');
  assert.equal(clientHomeNextActionKey('first_session'), 'dashboard.firstRun.firstSession');
  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /clientHomeNextActionKey\(nextAction\)/);
  assert.match(dash, /to="\/messages"/);
  assert.match(dash, /dashboard\.nothingToday/);
  assert.doesNotMatch(dash, /dashboard\.firstRun\.\$\{nextAction\}/);
});

test('client home copy is FR tutoiement; Dashboard never uses a 999 sentinel', () => {
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /waitingProgram: 'Ton coach va t’envoyer un programme'/);
  assert.match(fr, /firstSession: 'Première séance quand tu es prêt'/);
  assert.match(fr, /nothingToday:/);

  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
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
  assert.match(dash, /hasSentNutritionTarget/);
  assert.doesNotMatch(dash, /\?\? 2000/);
  assert.match(dash, /!activityPending && \(/);

  const home = src('src/lib/clientHome.ts');
  assert.doesNotMatch(home, /return 'checkin'/);

  const stats = src('src/components/stats/StatsPage.tsx');
  assert.match(stats, /statsCalorieSummary/);
});

test('Today shows at most one reminder, in a fixed urgency order', () => {
  assert.equal(pickTodayReminder({
    deload: true, meal: true, water: true, weight: true,
  }, []), 'deload');
  assert.equal(pickTodayReminder({
    deload: true, meal: true, water: false, weight: true,
  }, ['deload']), 'meal');
  assert.equal(pickTodayReminder({
    deload: false, meal: false, water: false, weight: true,
  }, []), 'weight');
  assert.equal(pickTodayReminder({
    deload: false, meal: false, water: false, weight: false,
  }, []), null);
});

test('Accueil shows one companion strip: hero wins, then message, check-in, reminder', () => {
  assert.equal(pickClientHomeStrip({
    hasPrimaryHero: true,
    unreadMessage: true,
    checkinDue: true,
    reminder: 'weight',
  }), null);
  assert.equal(pickClientHomeStrip({
    hasPrimaryHero: false,
    unreadMessage: true,
    checkinDue: true,
    reminder: 'meal',
  }), 'unread_message');
  assert.equal(pickClientHomeStrip({
    hasPrimaryHero: false,
    unreadMessage: false,
    checkinDue: true,
    reminder: 'water',
  }), 'checkin_due');
  assert.equal(pickClientHomeStrip({
    hasPrimaryHero: false,
    unreadMessage: false,
    checkinDue: false,
    reminder: 'deload',
  }), 'deload');
  assert.equal(pickClientHomeStrip({
    hasPrimaryHero: false,
    unreadMessage: false,
    checkinDue: false,
    reminder: null,
  }), null);

  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.match(dash, /pickClientHomeStrip/);
  assert.match(dash, /isProgramDayDue/);
  assert.match(dash, /homeStrip === 'unread_message'/);
  assert.match(dash, /homeStrip === 'checkin_due'/);
  assert.doesNotMatch(dash, /\{showUnreadCoachMessage &&/);
  assert.doesNotMatch(dash, /\{showCheckinStrip &&/);
  assert.doesNotMatch(dash, /\{todayReminder === 'deload' &&/);
});
