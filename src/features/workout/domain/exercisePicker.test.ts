import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { Exercise } from '../../../lib/types';
import {
  catalogMatchesForNames,
  composeExercisePicker,
  exerciseFamilyKey,
  mergeRecentNames,
  namesFromWorkouts,
  parseRecentExerciseNames,
  pickerRowTestId,
  pushRecentExerciseName,
  serializeRecentExerciseNames,
} from './exercisePicker';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function exercise(partial: Partial<Exercise> & { name: string }): Exercise {
  return {
    id: partial.id ?? partial.name,
    name: partial.name,
    name_fr: partial.name_fr ?? '',
    primary_muscles: partial.primary_muscles ?? ['chest'],
    secondary_muscles: [],
    category: 'strength',
    equipment: partial.equipment ?? 'barbell',
    instructions: '',
    tips: '',
    difficulty: 'intermediate',
    verified: true,
    created_by: null,
    created_at: '',
    video_url: partial.video_url ?? null,
  };
}

const squat = exercise({ name: 'Squat', name_fr: 'Squat', equipment: 'barbell', primary_muscles: ['quadriceps'] });
const hack = exercise({ name: 'Hack Squat', name_fr: 'Hack squat', equipment: 'machine', primary_muscles: ['quadriceps'] });
const bulgarian = exercise({ name: 'Bulgarian Split Squat', name_fr: 'Squat bulgare', equipment: 'dumbbell', primary_muscles: ['quadriceps'] });
const bench = exercise({ name: 'Bench Press', name_fr: 'Développé couché', equipment: 'barbell' });
const incline = exercise({ name: 'Incline Bench Press', name_fr: 'Developpe incline', equipment: 'barbell' });
const dbPress = exercise({ name: 'Dumbbell Press', name_fr: 'Developpe halteres', equipment: 'dumbbell' });
const deadlift = exercise({ name: 'Deadlift', name_fr: 'Soulevé de terre', equipment: 'barbell', primary_muscles: ['hamstrings'] });
const rdl = exercise({ name: 'Romanian Deadlift', name_fr: 'Soulevé de terre roumain', equipment: 'barbell', primary_muscles: ['hamstrings'] });
const facePull = exercise({ name: 'Face Pull', name_fr: 'Face pull', equipment: 'cable', primary_muscles: ['rear_delts'] });
const bicep = exercise({ name: 'Bicep Curl', name_fr: 'Curl biceps', equipment: 'dumbbell', primary_muscles: ['biceps'] });
const legCurl = exercise({ name: 'Leg Curl', name_fr: 'Curl jambes', equipment: 'machine', primary_muscles: ['hamstrings'] });
const pullup = exercise({ name: 'Pull-up', name_fr: 'Traction', equipment: 'bodyweight', primary_muscles: ['lats'] });
const chinup = exercise({ name: 'Chin-up', name_fr: 'Traction supination', equipment: 'bodyweight', primary_muscles: ['biceps'] });

const catalog = [squat, hack, bulgarian, bench, incline, dbPress, deadlift, rdl, facePull, bicep, legCurl, pullup, chinup];

test('UX18 families distinguish squat / bench / pull variants and do not mix curls', () => {
  assert.equal(exerciseFamilyKey(squat), 'squat');
  assert.equal(exerciseFamilyKey(hack), 'squat');
  assert.equal(exerciseFamilyKey(bulgarian), 'squat');
  assert.equal(exerciseFamilyKey(bench), 'bench');
  assert.equal(exerciseFamilyKey(incline), 'bench');
  assert.equal(exerciseFamilyKey(dbPress), 'bench');
  assert.equal(exerciseFamilyKey(deadlift), 'deadlift');
  assert.equal(exerciseFamilyKey(rdl), 'deadlift');
  assert.equal(exerciseFamilyKey(pullup), 'pull');
  assert.equal(exerciseFamilyKey(chinup), 'pull');
  assert.equal(exerciseFamilyKey(facePull), null);
  assert.equal(exerciseFamilyKey(bicep), 'curl');
  assert.equal(exerciseFamilyKey(legCurl), null);
});

test('recent names stay exact — Squat does not swallow Hack Squat', () => {
  assert.deepEqual(parseRecentExerciseNames('not-json'), []);
  assert.deepEqual(parseRecentExerciseNames(JSON.stringify(['Squat', 'Squat', 'Hack Squat', 1, ''])), ['Squat', 'Hack Squat']);
  assert.equal(serializeRecentExerciseNames(['Squat', 'Hack Squat']), JSON.stringify(['Squat', 'Hack Squat']));
  assert.deepEqual(pushRecentExerciseName(['Squat', 'Bench Press'], 'Hack Squat'), ['Hack Squat', 'Squat', 'Bench Press']);
  assert.deepEqual(pushRecentExerciseName(['Hack Squat', 'Squat'], 'squat'), ['squat', 'Hack Squat']);
  const hits = catalogMatchesForNames(catalog, ['Squat', 'hack squat', 'Unknown']);
  assert.deepEqual(hits.map(ex => ex.name), ['Squat', 'Hack Squat']);
});

test('history names are newest first and merge behind explicit picks', () => {
  const names = namesFromWorkouts([
    { date: '2026-09-01', exercises: [{ name: 'Squat' }] },
    { date: '2026-09-10', exercises: [{ name: 'Hack Squat' }, { name: 'Squat' }] },
  ]);
  assert.deepEqual(names, ['Hack Squat', 'Squat']);
  assert.deepEqual(mergeRecentNames(['Bench Press'], names), ['Bench Press', 'Hack Squat', 'Squat']);
});

test('searching squat groups variants with equipment visible before tap', () => {
  const model = composeExercisePicker({
    catalog,
    query: 'squat',
    recentNames: ['Squat'],
    equipment: 'all',
  });
  assert.deepEqual(model.equipmentOptions, ['barbell', 'dumbbell', 'machine']);
  assert.equal(model.sections[0]?.kind, 'recents');
  if (model.sections[0]?.kind !== 'recents') throw new Error('expected recents');
  assert.deepEqual(model.sections[0].exercises.map(ex => ex.name), ['Squat']);
  const family = model.sections.find(section => section.kind === 'family');
  assert.equal(family?.kind, 'family');
  if (family?.kind !== 'family') throw new Error('expected family');
  assert.equal(family.family, 'squat');
  assert.deepEqual(family.exercises.map(ex => `${ex.name}:${ex.equipment}`), [
    'Squat:barbell',
    'Bulgarian Split Squat:dumbbell',
    'Hack Squat:machine',
  ]);
});

test('equipment chip keeps the matching variant only', () => {
  const machine = composeExercisePicker({
    catalog,
    query: 'squat',
    recentNames: ['Squat'],
    equipment: 'machine',
  });
  assert.equal(machine.sections.some(section => section.kind === 'family'), false);
  const names = machine.sections.flatMap(section => section.exercises.map(ex => ex.name));
  assert.deepEqual(names, ['Hack Squat']);
});

test('row test ids stay stable for live proofs', () => {
  assert.equal(pickerRowTestId(hack), 'exercise-picker-hack-squat');
  assert.equal(pickerRowTestId(squat), 'exercise-picker-squat');
});

test('ExercisePicker shows recents, equipment chips and family groups before select', () => {
  const picker = src('src/components/workout/ExercisePicker.tsx');
  assert.match(picker, /composeExercisePicker/);
  assert.match(picker, /rememberExerciseName/);
  assert.match(picker, /data-testid="exercise-picker-recents"/);
  assert.match(picker, /exercise-picker-equipment-/);
  assert.match(picker, /exercise-picker-family-/);
  assert.match(picker, /pickerRowTestId/);
  assert.match(picker, /variantHint/);
  assert.match(src('src/i18n/locales/fr/workout.ts'), /variantHint: 'Choisis la variante et le matériel avant d’ajouter\.'/);
  assert.match(src('src/i18n/locales/en/workout.ts'), /variantHint: 'Pick the variant and equipment before adding\.'/);
});
