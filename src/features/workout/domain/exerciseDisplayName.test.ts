import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  catalogNameIndex,
  catalogRowFor,
  exerciseDisplayName,
  localizedCatalogName,
} from './exerciseDisplayName';
import { routineTemplateExercises } from './nextRoutine';
import { buildOfflineStartedWorkout } from './offlineStart';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const CATALOG = [
  { id: 'plank', name: 'Plank', name_fr: 'Gainage' },
  { id: 'bench', name: 'Bench Press', name_fr: 'Développé couché' },
  { id: 'squat', name: 'Squat', name_fr: 'Squat' },
  { id: 'old-plank', name: 'Plank hold', name_fr: 'Planche', merged_into_id: 'plank' },
  { id: 'no-fr', name: 'Face Pull', name_fr: '' },
];
const index = catalogNameIndex(CATALOG);
const shown = (stored: string, id: string | null, lang: string) =>
  exerciseDisplayName(stored, catalogRowFor(index, stored, id), lang);

test('a catalog exercise reads in the app language', () => {
  assert.equal(shown('Plank', 'plank', 'fr'), 'Gainage');
  assert.equal(shown('Plank', 'plank', 'en'), 'Plank');
  assert.equal(shown('Plank', 'plank', 'en-GB'), 'Plank');
  assert.equal(shown('Gainage', 'plank', 'en'), 'Plank');
  assert.equal(shown('Bench Press', 'bench', 'fr-CA'), 'Développé couché');
  // No French name: the English one, never an empty label.
  assert.equal(shown('Face Pull', 'no-fr', 'fr'), 'Face Pull');
  assert.equal(localizedCatalogName({ name: 'Plank', name_fr: null }, undefined), 'Plank');
});

test('a name the person wrote stays as written', () => {
  // Renamed but still linked.
  assert.equal(shown('Gainage lesté', 'plank', 'fr'), 'Gainage lesté');
  assert.equal(shown('Mon gainage du soir', 'plank', 'en'), 'Mon gainage du soir');
  // Not in the catalog at all.
  assert.equal(shown('Tractions australiennes', null, 'fr'), 'Tractions australiennes');
  assert.equal(shown('', 'plank', 'fr'), '');
  assert.equal(exerciseDisplayName(null, CATALOG[0], 'fr'), '');
});

test('rows without a link (history, snapshots) match the catalog by its own names only', () => {
  assert.equal(shown('Plank', null, 'fr'), 'Gainage');
  // Accents and case are not a different exercise.
  assert.equal(shown('developpe couche', null, 'en'), 'Bench Press');
  assert.equal(shown('BENCH PRESS', null, 'fr'), 'Développé couché');
  // A merged catalog row is not a display source.
  assert.equal(shown('Plank hold', null, 'fr'), 'Plank hold');
  // Just replaced: the stored name is the new exercise, the old link has not caught up yet.
  assert.equal(shown('Bench Press', 'plank', 'fr'), 'Développé couché');
});

test('the English name wins when a French name equals another exercise’s English name', () => {
  const idx = catalogNameIndex([
    { id: 'a', name: 'Squat', name_fr: 'Squat' },
    { id: 'b', name: 'Front Squat', name_fr: 'Squat' },
  ]);
  assert.equal(catalogRowFor(idx, 'Squat', null)?.id, 'a');
});

test('a started session keeps the catalog link of its routine, offline too', () => {
  const rows = routineTemplateExercises([
    { name: 'Plank', default_sets: 3, default_reps: 1, order_index: 0, catalog_exercise_id: 'plank' },
  ]);
  assert.equal(rows[0].catalog_exercise_id, 'plank');
  const workout = buildOfflineStartedWorkout({
    opId: 'op-1', userId: 'u', name: 'Core', date: '2026-09-25T12:00:00',
    routineId: null, programAssignmentId: null, programDayId: null,
    exercises: rows,
  });
  assert.equal(workout.exercises?.[0]?.catalog_exercise_id, 'plank');
});

test('every screen that shows an exercise name goes through the display name', () => {
  const screens: Array<[string, RegExp]> = [
    ['src/components/workout/ExerciseCard.tsx', /exerciseName\(localName, exercise\.catalog_exercise_id\)/],
    ['src/components/workout/WorkoutRecap.tsx', /exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/workout/SessionReadout.tsx', /exerciseName\(ex\.name\)/],
    ['src/components/workout/WorkoutSummaryScreen.tsx', /exerciseName\(ex\.name\)/],
    ['src/components/workout/WorkoutPage.tsx', /names\.slice\(0, 3\)\.map\(name => exerciseName\(name\)\)/],
    ['src/components/workout/ExerciseProgressPage.tsx', /displayExercise\(detail\.name\)/],
    ['src/components/workout/SetRow.tsx', /exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/workout/ExerciseMedia.tsx', /localizedCatalogName\(exercise, i18n\.language\)/],
    ['src/components/routines/RoutineForm.tsx', /exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/coaching/ProgramSessionEditor.tsx', /const label = exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/coaching/ClientDetailPage.tsx', /exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/coaching/ClientLiftChart.tsx', /exerciseName\(l\.displayName\)/],
    ['src/components/programs/ClientProgramPage.tsx', /exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/dashboard/ClientGymCard.tsx', /exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/dashboard/SoloProgramProposal.tsx', /exerciseName\(ex\.name, ex\.catalog_exercise_id\)/],
    ['src/components/solo/SoloAskBar.tsx', /exerciseName\(ex\.name\)/],
    ['src/components/constraints/ConstraintsPanel.tsx', /exerciseName\(c\.exercise_name\)/],
  ];
  for (const [path, pattern] of screens) assert.match(src(path), pattern, path);
  // Display only: what is written and matched on stays the stored name.
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /useExerciseHistory\(exercise\.name, /);
  assert.match(card, /exerciseName=\{localName \|\| exercise\.name\}/);
});

test('the start carries the catalog link through a new migration', () => {
  const migration = src('supabase/migrations/20260925110000_start_workout_catalog_link.sql');
  assert.match(migration, /'catalog_exercise_id', e\.catalog_exercise_id/);
  assert.match(migration, /prescription_source, catalog_exercise_id/);
  assert.match(migration, /x\.verified OR x\.created_by = v_user_id/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.start_workout_from_template\(text, timestamptz, uuid, uuid, uuid, jsonb\)\s+TO authenticated/);
  assert.match(src('supabase/migrations.pending.json'), /"20260925110000"/);
});
