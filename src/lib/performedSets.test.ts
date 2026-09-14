import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  aggregateExerciseProgress,
  computeWorkoutSummaryStats,
  isCompletedSet,
  isPerformedSet,
  isRecordAtIndex,
} from './performedSets';
import { readableSets } from './coachLastSession';
import { buildClientLifts } from './coachLifts';

test('a prefilled unchecked set is not performed', () => {
  const filled = { completed: false, set_type: 'working', weight_kg: 80, reps: 5 };
  const checked = { completed: true, set_type: 'working', weight_kg: 80, reps: 5 };
  const warmup = { completed: true, set_type: 'warmup', weight_kg: 40, reps: 8 };
  assert.equal(isPerformedSet(filled), false);
  assert.equal(isCompletedSet(filled), false);
  assert.equal(isPerformedSet(checked), true);
  assert.equal(isPerformedSet(warmup), false);
  assert.equal(isCompletedSet(warmup), true);
});

test('summary volume and set count ignore unchecked leftover sets', () => {
  const stats = computeWorkoutSummaryStats({
    exercises: [{
      name: 'Squat',
      sets: [
        { completed: true, set_type: 'working', weight_kg: 100, reps: 5 },
        { completed: false, set_type: 'working', weight_kg: 100, reps: 5 },
        { completed: false, set_type: 'warmup', weight_kg: 60, reps: 8 },
      ],
    }],
  }, 1800);
  assert.equal(stats.setCount, 1);
  assert.equal(stats.skippedSetCount, 1);
  assert.equal(stats.totalVolume, 500);
  assert.equal(stats.exerciseCount, 1);
  assert.equal(stats.topExercises[0]?.estimated1RM, 117);
});

test('readableSets never treats weight or reps as done', () => {
  const sets = [
    { weight_kg: 80, reps: 5, rir: 2, completed: true },
    { weight_kg: 90, reps: 5, rir: 1, completed: false },
  ];
  assert.deepEqual(readableSets(sets).map(s => s.weight_kg), [80]);
});

test('coach lift history does not fall back to unchecked loads', () => {
  const lifts = buildClientLifts(
    [{ id: 'w1', user_id: 'c1', date: '2026-09-14T12:00:00', name: 'Lower', completed: true }],
    [{ id: 'e1', workout_id: 'w1', name: 'Squat' }],
    [
      { exercise_id: 'e1', weight_kg: 100, reps: 5, rir: 2, completed: true, set_type: 'working' },
      { exercise_id: 'e1', weight_kg: 120, reps: 5, rir: 1, completed: false, set_type: 'working' },
    ],
  );
  assert.equal(lifts.length, 1);
  assert.equal(lifts[0]?.sessions[0]?.maxWeight, 100);
  assert.equal(lifts[0]?.sessions[0]?.volume, 500);
  assert.equal(readableSets(lifts[0]?.sessions[0]?.sets ?? []).length, 1);
});

test('an all-unchecked finished workout is not a lift session', () => {
  const lifts = buildClientLifts(
    [{ id: 'w1', user_id: 'c1', date: '2026-09-14T12:00:00', name: 'Lower', completed: true }],
    [{ id: 'e1', workout_id: 'w1', name: 'Squat' }],
    [{ exercise_id: 'e1', weight_kg: 100, reps: 5, rir: 2, completed: false, set_type: 'working' }],
  );
  assert.equal(lifts.length, 0);
});

test('progress charts skip unchecked sets even if the workout is completed', () => {
  const rows = aggregateExerciseProgress([
    {
      name: 'Bench',
      workouts: { date: '2026-09-14T12:00:00' },
      workout_sets: [
        { weight_kg: 60, reps: 5, set_type: 'working', completed: true },
        { weight_kg: 80, reps: 5, set_type: 'working', completed: false },
      ],
    },
  ], iso => iso.slice(0, 10));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.entries[0]?.sets, 1);
  assert.equal(rows[0]?.entries[0]?.maxWeight, 60);
  assert.equal(rows[0]?.latest1RM, 70);
});

test('a tied 1RM is not a beaten record', () => {
  const entries = [
    { estimated1RM: 100 },
    { estimated1RM: 100 },
    { estimated1RM: 110 },
  ];
  assert.equal(isRecordAtIndex(entries, 0), false);
  assert.equal(isRecordAtIndex(entries, 1), false);
  assert.equal(isRecordAtIndex(entries, 2), true);
});

test('summary screen has no auto-close, no fake PR count, no coach lecture', () => {
  const summary = readFileSync(resolve(process.cwd(), 'src/components/workout/WorkoutSummaryScreen.tsx'), 'utf8');
  assert.doesNotMatch(summary, /30000/);
  assert.doesNotMatch(summary, /prCount/);
  assert.doesNotMatch(summary, /workout\.summary\.coaching/);
  assert.doesNotMatch(summary, /setTimeout/);
  assert.match(summary, /computeWorkoutSummaryStats/);
  assert.match(summary, /workout\.summary\.facts/);
  const form = readFileSync(resolve(process.cwd(), 'src/components/workout/WorkoutForm.tsx'), 'utf8');
  assert.match(form, /navigate\(`\/workout\/\$\{workoutId\}`/);
});
