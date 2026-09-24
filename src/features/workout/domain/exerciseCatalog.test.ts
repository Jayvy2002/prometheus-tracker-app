import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import frWorkout from '../../../i18n/locales/fr/workout';
import enWorkout from '../../../i18n/locales/en/workout';
import { foldText } from '../../coaching/domain/coachText';
import { isExactExerciseMatch } from './pickerSearch';
import type { Exercise } from '../types';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('P5.3 catalog links a unique alias and never rewrites the written name', () => {
  const sql = src('supabase/migrations/20260923014500_p5_exercise_catalog.sql');
  assert.match(sql, /exercise_normalize_name/);
  assert.match(sql, /UNIQUE \(normalized\)/);
  assert.match(sql, /merge_exercises/);
  assert.match(sql, /confirmation_required/);
  assert.doesNotMatch(sql, /NEW\.name\s*:=/);
  assert.doesNotMatch(sql, /start_workout_from_template/);
  assert.doesNotMatch(sql, /save_program/);
  const testSql = src('supabase/tests/p5_exercise_catalog.sql');
  assert.match(testSql, /^ROLLBACK;/m);
  assert.doesNotMatch(testSql, /^COMMIT;/m);
  assert.match(src('.github/workflows/ci.yml'), /p5_exercise_catalog\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /test-p5-exercise-merge-lock\.sh/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /P5_EXERCISE_GRANTS/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260923014500'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260923014500"/);
  assert.match(src('supabase/functions/verify-exercise/index.ts'), /applied:\s*false/);
  assert.doesNotMatch(src('supabase/functions/verify-exercise/index.ts'), /from\("exercises"\)[\s\S]{0,120}\.insert/);
  assert.match(src('src/components/workout/ExercisePicker.tsx'), /propose_exercise/);
  assert.match(src('src/components/workout/ExercisePicker.tsx'), /saturate-0/);
  assert.ok(frWorkout.workout.exercisePicker.pendingSaved);
  assert.ok(enWorkout.workout.exercisePicker.pendingSaved);
  assert.equal(foldText('Développé couché'), 'developpe couche');
  const bench = { name: 'Bench Press', name_fr: 'Développé couché', aliases: ['bp'] } as Exercise;
  assert.equal(isExactExerciseMatch('BP', bench), true);
  assert.equal(isExactExerciseMatch('Hack Squat', bench), false);
});

test('history of a catalog exercise follows its catalog id, not the accents of its name', () => {
  const store = readFileSync(resolve(process.cwd(), 'src/stores/workoutStore.ts'), 'utf8');
  assert.match(store, /base\.eq\('catalog_exercise_id', catalogExerciseId\)/);
  const card = readFileSync(resolve(process.cwd(), 'src/components/workout/ExerciseCard.tsx'), 'utf8');
  assert.match(card, /useExerciseHistory\(exercise\.name, currentWorkout\?\.id, exercise\.catalog_exercise_id\)/);
});
