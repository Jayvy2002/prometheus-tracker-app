import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOfflineStartedWorkout,
  mapOfflineStartShape,
  offlineStartExerciseId,
  offlineStartSetId,
  templateSetCount,
} from './offlineStart';

const template = [
  { name: 'Leg curl', default_sets: 2, default_reps: 10, order_index: 1 },
  { name: ' Squat ', default_sets: 3, default_reps: 5, order_index: 0, default_weight_kg: 100 },
];

test('an offline start mirrors the server: same order, same set counts, temporary ids', () => {
  const w = buildOfflineStartedWorkout({
    opId: 'op1', userId: 'u1', name: 'Lower', date: '2026-09-20T09:00:00',
    programAssignmentId: 'a1', programDayId: 'd1', exercises: template,
  });
  assert.equal(w.id, 'local-op1');
  assert.deepEqual(w.exercises?.map(e => e.name), ['Squat', 'Leg curl']);
  assert.deepEqual(w.exercises?.map(e => e.sets?.length), [3, 2]);
  assert.equal(w.exercises?.[0].id, offlineStartExerciseId('op1', 0));
  assert.equal(w.exercises?.[0].sets?.[2].id, offlineStartSetId('op1', 0, 2));
  assert.equal(w.exercises?.[0].prescribed_weight_kg, 100);
  assert.equal(w.exercises?.[0].prescription_source, 'program');
  assert.equal(w.completed, false);
  // Nothing is pre-logged: sets start empty, like on the server.
  assert.ok(w.exercises?.every(e => e.sets?.every(s => s.reps === 0 && !s.completed)));
});

test('set count follows the server rule (default 3, bounded 1–20)', () => {
  assert.equal(templateSetCount({ default_sets: 0 }), 1);
  assert.equal(templateSetCount({ default_sets: 50 }), 20);
  assert.equal(templateSetCount({ default_sets: Number.NaN }), 3);
});

test('the replayed server shape maps every temporary id to one server id', () => {
  const pairs = new Map(mapOfflineStartShape('op1', {
    workout_id: 'w-real',
    exercises: [
      { id: 'e-real-0', order_index: 0, sets: ['s0', 's1', 's2'] },
      { id: 'e-real-1', order_index: 1, sets: ['s3', 's4'] },
    ],
  }));
  assert.equal(pairs.get('local-op1'), 'w-real');
  assert.equal(pairs.get(offlineStartExerciseId('op1', 1)), 'e-real-1');
  assert.equal(pairs.get(offlineStartSetId('op1', 0, 2)), 's2');
  assert.equal(pairs.get(offlineStartSetId('op1', 1, 1)), 's4');
  assert.equal(pairs.size, 1 + 2 + 5);
});

test('an edit on a row that only exists locally is recognised (it must wait in the queue)', async () => {
  const { referencesOfflineTempId } = await import('../data/offlineIds');
  assert.equal(referencesOfflineTempId({ id: 'local-op1.e0.s1', updates: { reps: 8 } }), true);
  assert.equal(referencesOfflineTempId({ exerciseId: 'local-op1.e0', set: {} }), true);
  assert.equal(referencesOfflineTempId({ id: '3f1c2d4e-0000-4000-8000-000000000001', updates: { reps: 8 } }), false);
  assert.equal(referencesOfflineTempId({ ids: ['a', 'local-x'] }), true);
});
