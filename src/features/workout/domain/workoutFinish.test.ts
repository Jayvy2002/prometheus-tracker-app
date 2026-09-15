import assert from 'node:assert/strict';
import { test } from 'node:test';
import { incompleteWorkingSets, shouldConfirmIncompleteFinish, workingSets } from './workoutFinish';

const session = [
  {
    id: 'ex-1',
    sets: [
      { id: 'w1', set_type: 'warmup', completed: false },
      { id: 's1', set_type: 'working', completed: true },
      { id: 's2', set_type: 'working', completed: false },
      { id: 's3', set_type: 'drop', completed: false },
    ],
  },
];

test('warm-ups are ignored when finishing a session', () => {
  assert.equal(workingSets(session).length, 3);
  assert.deepEqual(incompleteWorkingSets(session).map(s => s.id), ['s2', 's3']);
  assert.equal(shouldConfirmIncompleteFinish(session), true);
});

test('a fully logged session does not ask for confirmation', () => {
  const done = [{
    id: 'ex-1',
    sets: [
      { id: 'w1', set_type: 'warmup', completed: false },
      { id: 's1', set_type: 'working', completed: true },
    ],
  }];
  assert.equal(shouldConfirmIncompleteFinish(done), false);
  assert.equal(incompleteWorkingSets(done).length, 0);
});
