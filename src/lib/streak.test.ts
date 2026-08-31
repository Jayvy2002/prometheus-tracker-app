import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  activityDateKey,
  applyQualifyingActivity,
  countUnbrokenStreak,
  effectiveCurrentStreak,
} from './streak';

const TODAY = '2026-08-31';

test('midnight UTC DATE strings keep the calendar day (no Toronto off-by-one)', () => {
  assert.equal(activityDateKey('2026-08-31'), '2026-08-31');
  assert.equal(activityDateKey('2026-08-31T00:00:00.000Z'), '2026-08-31');
  assert.equal(activityDateKey('2026-08-31T00:00:00Z'), '2026-08-31');
  assert.equal(activityDateKey('2026-08-31T00:00:00+00:00'), '2026-08-31');
});

test('stale last_activity (multi-day gap) shows 0, not a ghost 1', () => {
  assert.equal(effectiveCurrentStreak('2026-08-25', 1, TODAY), 0);
  assert.equal(effectiveCurrentStreak('2026-08-20', 7, TODAY), 0);
  assert.equal(effectiveCurrentStreak(null, 1, TODAY), 0);
  assert.equal(effectiveCurrentStreak('1970-01-01', 1, TODAY), 0);
  assert.equal(effectiveCurrentStreak('2026-08-25T00:00:00.000Z', 1, TODAY), 0);
});

test('streak stays live when last log is today or yesterday', () => {
  assert.equal(effectiveCurrentStreak(TODAY, 1, TODAY), 1);
  assert.equal(effectiveCurrentStreak('2026-08-30', 4, TODAY), 4);
  assert.equal(effectiveCurrentStreak('2026-08-30T00:00:00.000Z', 1, TODAY), 1);
});

test('logging today after a gap starts a new streak of 1', () => {
  const next = applyQualifyingActivity(
    { current_streak: 1, longest_streak: 5, last_activity_date: '2026-08-25' },
    TODAY,
    TODAY,
  );
  assert.deepEqual(next, {
    current_streak: 1,
    longest_streak: 5,
    last_activity_date: TODAY,
  });
});

test('logging today continues yesterday’s tail', () => {
  const next = applyQualifyingActivity(
    { current_streak: 3, longest_streak: 3, last_activity_date: '2026-08-30' },
    TODAY,
    TODAY,
  );
  assert.equal(next?.current_streak, 4);
  assert.equal(next?.last_activity_date, TODAY);
});

test('logging yesterday continues a tail that ended the day before', () => {
  const next = applyQualifyingActivity(
    { current_streak: 6, longest_streak: 6, last_activity_date: '2026-08-29' },
    '2026-08-30',
    TODAY,
  );
  assert.equal(next?.current_streak, 7);
  assert.equal(next?.last_activity_date, '2026-08-30');
});

test('logging yesterday after a gap starts at 1, not a revived multi-day streak', () => {
  const next = applyQualifyingActivity(
    { current_streak: 9, longest_streak: 9, last_activity_date: '2026-08-20' },
    '2026-08-30',
    TODAY,
  );
  assert.equal(next?.current_streak, 1);
  assert.equal(next?.last_activity_date, '2026-08-30');
});

test('same-day activity is a no-op', () => {
  assert.equal(
    applyQualifyingActivity(
      { current_streak: 2, longest_streak: 2, last_activity_date: TODAY },
      TODAY,
      TODAY,
    ),
    null,
  );
});

test('editing old history does not rewind or revive a multi-day streak', () => {
  assert.equal(
    applyQualifyingActivity(
      { current_streak: 0, longest_streak: 9, last_activity_date: '2026-08-20' },
      '2026-08-20',
      TODAY,
    ),
    null,
  );
  assert.equal(
    applyQualifyingActivity(
      { current_streak: 1, longest_streak: 1, last_activity_date: TODAY },
      '2026-08-25',
      TODAY,
    ),
    null,
  );
});

test('countUnbrokenStreak: empty or stale history is 0', () => {
  assert.equal(countUnbrokenStreak([], TODAY), 0);
  assert.equal(countUnbrokenStreak(['2026-08-20', '2026-08-21'], TODAY), 0);
  assert.equal(countUnbrokenStreak(['1970-01-01'], TODAY), 0);
});

test('countUnbrokenStreak: today after a gap is 1', () => {
  assert.equal(countUnbrokenStreak(['2026-08-20', TODAY], TODAY), 1);
});

test('countUnbrokenStreak: yesterday-only still counts (grace)', () => {
  assert.equal(countUnbrokenStreak(['2026-08-30', '2026-08-29'], TODAY), 2);
});

test('countUnbrokenStreak: gap yesterday breaks the tail', () => {
  assert.equal(countUnbrokenStreak(['2026-08-29', TODAY], TODAY), 1);
});

test('countUnbrokenStreak: ISO midnight dates still qualify', () => {
  assert.equal(countUnbrokenStreak(['2026-08-31T00:00:00.000Z', '2026-08-30T00:00:00Z'], TODAY), 2);
});

test('streak store decays on fetch and ignores old addLog dates', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/stores/streakStore.ts'), 'utf8');
  assert.match(src, /effectiveCurrentStreak/);
  assert.match(src, /applyQualifyingActivity/);
  assert.match(src, /get\(\)\.streak === null/);
  const nutrition = readFileSync(resolve(process.cwd(), 'src/stores/nutritionStore.ts'), 'utf8');
  assert.match(nutrition, /recordActivity/);
  assert.match(nutrition, /rescaleNutritionMacros/);
  const addWaterImpl = nutrition.slice(nutrition.indexOf('addWater: async'));
  assert.equal(addWaterImpl.includes('recordActivity'), false);
  const calendar = readFileSync(resolve(process.cwd(), 'src/components/calendar/CalendarPage.tsx'), 'utf8');
  assert.match(calendar, /countUnbrokenStreak/);
});
