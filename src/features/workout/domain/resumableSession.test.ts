import test from 'node:test';
import assert from 'node:assert/strict';
import { pickResumableWorkout, workoutHasLoggedWork } from './resumableSession';

const row = (id: string, date: string, completed = false) => ({ id, date, completed });

test('resume bar offers today or yesterday, never an old unfinished row', () => {
  const rows = [row('old', '2026-06-01T12:00:00'), row('done', '2026-09-23T12:00:00', true)];
  assert.equal(pickResumableWorkout(rows, null, '2026-09-23', '2026-09-22'), null);
  const withRecent = [...rows, row('y', '2026-09-22T12:00:00'), row('t', '2026-09-23T12:00:00')];
  assert.equal(pickResumableWorkout(withRecent, null, '2026-09-23', '2026-09-22')?.id, 't');
});

test('the session open in the logger wins when it is recent', () => {
  const current = row('cur', '2026-09-22T12:00:00');
  const rows = [row('t', '2026-09-23T12:00:00')];
  assert.equal(pickResumableWorkout(rows, current, '2026-09-23', '2026-09-22')?.id, 'cur');
  assert.equal(pickResumableWorkout(rows, row('stale', '2026-01-01T12:00:00'), '2026-09-23', '2026-09-22')?.id, 't');
});

test('an empty session has no logged work; one rep or one second is work', () => {
  assert.equal(workoutHasLoggedWork([]), false);
  assert.equal(workoutHasLoggedWork([{ sets: [{ weight_kg: 0, reps: 0 }] }]), false);
  assert.equal(workoutHasLoggedWork([{ sets: [{ weight_kg: 0, reps: 1 }] }]), true);
  assert.equal(workoutHasLoggedWork([{ sets: [{ weight_kg: 0, reps: 0, duration_seconds: 30 }] }]), true);
});
