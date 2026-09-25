import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { newSetTypeFor } from './timedExercise';
import { routineTemplateExercises } from './nextRoutine';
import { prescriptionBadgeParts, type PrescriptionVisibility } from './prescriptionBadge';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const ALL: PrescriptionVisibility = { sets: true, reps: 'either', load: true, rir: true, rest: true };

test('a new set of a timed hold is timed; otherwise the default applies', () => {
  assert.equal(newSetTypeFor([], 'time'), 'isometric');
  assert.equal(newSetTypeFor(null, 'reps'), null);
  assert.equal(newSetTypeFor([], null), null);
  assert.equal(newSetTypeFor([{ set_type: 'isometric' }, { set_type: 'isometric' }]), 'isometric');
  // What was logged wins over the catalog: a plank logged in reps stays in reps.
  assert.equal(newSetTypeFor([{ set_type: 'working' }], 'time'), null);
  assert.equal(newSetTypeFor([{ set_type: 'isometric' }, { set_type: 'working' }], 'time'), null);
});

test('a routine starts a timed catalog exercise as timed sets, by catalog link only', () => {
  const measurement = new Map([['plank-id', 'time'], ['bench-id', 'reps']]);
  const rows = routineTemplateExercises([
    { name: 'Gainage', default_sets: 3, default_reps: 1, order_index: 0, catalog_exercise_id: 'plank-id' },
    { name: 'Bench', default_sets: 4, default_reps: 8, order_index: 1, catalog_exercise_id: 'bench-id' },
    { name: 'Plank', default_sets: 3, default_reps: 10, order_index: 2, catalog_exercise_id: null },
  ], id => measurement.get(id));
  assert.equal(rows[0].set_type, 'isometric');
  assert.equal(rows[1].set_type, undefined);
  // No link: the name « Plank » is not used to guess.
  assert.equal(rows[2].set_type, undefined);
  assert.deepEqual(Object.keys(rows[1]).sort(), ['default_reps', 'default_sets', 'name', 'order_index']);
});

test('the badge of a timed hold shows its sets, not a reps target', () => {
  const parts = prescriptionBadgeParts({ sets: 3, reps: 10, restSeconds: 60, timed: true }, ALL);
  assert.deepEqual(parts.map(p => p.key), ['setsOnly', 'restMin']);
  assert.deepEqual(prescriptionBadgeParts({ sets: 3, reps: 10 }, ALL)[0].key, 'setsReps');
});

test('the catalog, the logger and the program editor read the measurement', () => {
  const store = src('src/stores/exerciseStore.ts');
  assert.match(store, /\$\{CATALOG_COLUMNS\}, measurement/);
  // A frontend deployed before the migration still loads the catalog.
  assert.match(store, /UNDEFINED_COLUMN = '42703'/);

  const workoutStore = src('src/stores/workoutStore.ts');
  assert.match(workoutStore, /addSet: async \(exerciseId, orderIndex, setType\)/);
  assert.match(workoutStore, /takeQueuedOp\('set\.add', \{ exerciseId, set: initial \}/);

  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /addSet\(ex\.id, 0, newSetTypeFor\(\[\], measurement\)\)/);
  assert.match(form, /routineStartExercises\(routine\.exercises\)/);
  for (const page of ['src/components/dashboard/Dashboard.tsx', 'src/components/routines/RoutinesPage.tsx', 'src/components/workout/WorkoutPage.tsx']) {
    assert.match(src(page), /exercises: await routineStartExercises\(routine\.exercises\)/, page);
  }

  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /addSet\(exercise\.id, idx, newSetTypeFor\(sets, catalogMeasurement\)\)/);
  assert.match(card, /row\.id === exercise\.catalog_exercise_id/);
  assert.match(card, /timed: repsColumn === 'duration'/);

  const editor = src('src/components/coaching/ProgramSessionEditor.tsx');
  assert.match(editor, /measurement === 'time'/);
  // The duration shown in the editor is the one saved.
  assert.match(editor, /isometric_seconds: ex\.isometric_seconds \?\? DEFAULT_ISOMETRIC_SECONDS/);
});

test('the measurement migration is additive and pending', () => {
  const migration = src('supabase/migrations/20260925100000_exercise_measurement.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS measurement text NOT NULL DEFAULT 'reps'/);
  assert.match(migration, /CHECK \(measurement IN \('reps', 'time'\)\)/);
  assert.match(migration, /WHERE name = 'Plank'/);
  assert.doesNotMatch(migration, /workout_sets|program_day_exercises/);
  // Pending until production is verified, then in the lock (applied 2026-09-25).
  assert.match(
    src('supabase/migrations.pending.json') + src('supabase/schema_migrations.lock.json'),
    /"20260925100000"/,
  );
});
