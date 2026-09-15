import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  calendarDayWeights,
  calendarDayWorkouts,
  listedProgressMatches,
  responsesHaveError,
} from './progressSearch';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('search lists every filtered match instead of skipping the first five', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'curl'];
  assert.deepEqual(listedProgressMatches(names, ''), ['f', 'curl']);
  assert.deepEqual(listedProgressMatches(names.filter(n => n.includes('c')), 'c'), ['c', 'curl']);
});

test('a day can list several workouts and weigh-ins', () => {
  assert.deepEqual(
    calendarDayWorkouts([
      { id: 'w1', name: 'AM', workout_exercises: [{ id: 'e1' }] },
      { id: 'w2', name: '', workout_exercises: [{ id: 'e2' }, { id: 'e3' }] },
    ], 'Untitled'),
    [
      { id: 'w1', name: 'AM', exerciseCount: 1 },
      { id: 'w2', name: 'Untitled', exerciseCount: 2 },
    ],
  );
  assert.deepEqual(calendarDayWeights([{ weight_kg: 80 }, { weight_kg: 80.4 }]), [80, 80.4]);
  assert.equal(responsesHaveError([{ error: null }, { error: { message: 'fail' } }]), true);
  assert.equal(responsesHaveError([{ error: null }]), false);
});

test('calendar, progress and stats treat a failed fetch as an error with retry', () => {
  const calendar = src('src/components/calendar/CalendarPage.tsx');
  assert.doesNotMatch(calendar, /from\('workouts'\)[\s\S]{0,400}\.maybeSingle\(\)/);
  assert.doesNotMatch(calendar, /from\('weight_measurements'\)[\s\S]{0,400}\.maybeSingle\(\)/);
  assert.match(calendar, /calendarDayWorkouts/);
  assert.match(calendar, /summarySeq/);
  assert.match(calendar, /calendar\.loadError/);
  assert.match(calendar, /\.catch\(/);

  const progress = src('src/components/workout/ExerciseProgressPage.tsx');
  assert.match(progress, /listedProgressMatches/);
  assert.doesNotMatch(progress, /filteredExercises\.slice\(5\)/);
  assert.match(progress, /progress\.loadError/);
  assert.match(progress, /errors\.retry/);

  const stats = src('src/components/stats/StatsPage.tsx');
  assert.match(stats, /stats\.loadError/);
  assert.match(stats, /responsesHaveError/);
  assert.match(stats, /errors\.retry/);
});
