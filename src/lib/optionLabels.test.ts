import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { optionDescription, optionLabel } from './optionLabels';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const t = ((key: string, opts?: { defaultValue?: string }) => {
  const table: Record<string, string> = {
    'options.meals.breakfast': 'Petit-déjeuner',
    'options.genders.male': 'Homme',
    'options.setTypes.warmup': 'Échauffement',
    'options.activity.sedentaryHint': 'Peu ou pas d’exercice',
  };
  return table[key] ?? opts?.defaultValue ?? key;
}) as Parameters<typeof optionLabel>[0];

test('optionLabel uses the translated label and never leaks a raw key when a fallback exists', () => {
  assert.equal(optionLabel(t, 'meals', 'breakfast', 'Breakfast'), 'Petit-déjeuner');
  assert.equal(optionLabel(t, 'genders', 'male', 'male'), 'Homme');
  assert.equal(optionLabel(t, 'setTypes', 'warmup', 'Warm-up'), 'Échauffement');
  assert.equal(optionLabel(t, 'meals', 'unknown', 'Snack'), 'Snack');
});

test('optionDescription reads the Hint suffix', () => {
  assert.equal(optionDescription(t, 'activity', 'sedentary', 'Little or no exercise'), 'Peu ou pas d’exercice');
  assert.equal(optionDescription(t, 'activity', 'missing', 'fallback'), 'fallback');
});

test('FR and EN both define the options namespace used by the UI', () => {
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  for (const key of [
    'options: {',
    'placeholders: {',
    'foodName:',
    'genders: {',
    'meals: {',
    'breakfast:',
    'setTypes: {',
    'warmup:',
    'diet: {',
    'allergies: {',
    'trainingExperience: {',
    'trainingFocus: {',
    'auth.signOut',
  ]) {
    if (key === 'auth.signOut') {
      assert.match(fr, /signOut: 'Se déconnecter'/);
      assert.match(en, /signOut: 'Sign Out'/);
      continue;
    }
    assert.match(fr, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(en, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('visible workout fallbacks and meal labels come from i18n, not English constants', () => {
  const workout = src('src/components/workout/WorkoutPage.tsx');
  const calendar = src('src/components/calendar/CalendarPage.tsx');
  const recap = src('src/components/workout/WorkoutRecap.tsx');
  const wall = src('src/components/auth/WallSignOut.tsx');
  assert.match(workout, /workout\.unnamed/);
  assert.doesNotMatch(workout, /w\.name \|\| 'Workout'/);
  assert.match(calendar, /workout\.unnamed/);
  assert.match(recap, /optionLabel\(t, 'setTypes'/);
  assert.match(wall, /auth\.signOut/);
});
