import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canUndoWorkoutDelete } from './workoutUndo';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

test('only a session without program provenance can be restored by undo', () => {
  assert.equal(canUndoWorkoutDelete({}), true);
  assert.equal(canUndoWorkoutDelete({ program_assignment_id: null, program_day_id: null }), true);
  assert.equal(canUndoWorkoutDelete({ program_day_id: 'd' }), false);
  assert.equal(canUndoWorkoutDelete({ program_assignment_id: 'a' }), false);
  assert.equal(canUndoWorkoutDelete({ program_id: 'p' }), false);
  assert.equal(canUndoWorkoutDelete({ program_phase_id: 'ph' }), false);
  assert.equal(canUndoWorkoutDelete({ program_revision_no: 0 }), false);
  assert.equal(canUndoWorkoutDelete({ prescribed_phase_name: 'Force' }), false);
});

test('history delete never reports a restore that did not happen', () => {
  const page = src('src/components/workout/WorkoutPage.tsx');
  // Program sessions: explicit confirmation, no undo.
  assert.match(page, /canUndoWorkoutDelete\(/);
  assert.match(page, /workout\.deleteConfirm/);
  // The restore never re-sends program provenance (RPC-only in the database).
  const restore = page.slice(page.indexOf('const restoreDeleted'), page.indexOf('const handleDelete'));
  assert.doesNotMatch(restore, /program_(assignment|day|phase)_id|program_id|program_revision_no/);
  // Success is shown only after the rows are back.
  assert.match(restore, /restoreFailed/);
  const store = src('src/stores/workoutStore.ts');
  assert.match(store, /restoreExercise: \(workoutId: string, exerciseData: WorkoutExercise\) => Promise<boolean>/);
});
