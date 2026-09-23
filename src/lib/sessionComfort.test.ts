import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { imageFileForUpload, isHeicLike } from './heicConvert';
import { platesForLoad, plateInventory, plateStyle, standardBarKg, totalFromSleeve } from './plateMath';
import { coachingStoreSource } from './coachingStoreSource';

function src(rel: string): string {
  if (rel === 'src/stores/coachingStore.ts') return coachingStoreSource();
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('UX15 rest auto is a preference; fill does not start the timer', () => {
  const prefs = src('src/stores/preferencesStore.ts');
  assert.match(prefs, /autoStartRest/);
  assert.match(prefs, /setAutoStartRest/);
  const units = src('src/components/profile/UnitsForm.tsx');
  assert.match(units, /data-testid="auto-start-rest"/);
  assert.match(units, /setAutoStartRest/);
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /shouldAutoStartRest/);
  assert.match(card, /autoStartRest/);
  const fill = card.slice(card.indexOf('const handleDuplicateSet'), card.indexOf('const handleSetComplete'));
  assert.doesNotMatch(fill, /onStartRestTimer/);
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /handleStartRestTimer\(\)/);
});

test('UX101 rest bar survives closing the modal; a new set remounts', () => {
  const timer = src('src/components/workout/RestTimer.tsx');
  assert.match(timer, /data-rest-bar="true"/);
  assert.match(timer, /onReopen/);
  assert.match(timer, /inFlight/);
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /onReopen=\{\(\) => setShowTimer\(true\)\}/);
  assert.match(form, /key=\{restEpoch\}/);
  assert.match(form, /autoStart=\{restAutoStart\}/);
});

test('UX102 free session saves as a routine, distinct from a program', () => {
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /data-save-routine="true"/);
  assert.match(form, /createRoutine/);
  assert.match(form, /workout\.saveAsRoutine/);
  assert.doesNotMatch(form, /data-save-plan="true"/);
  assert.doesNotMatch(form, /navigate\('\/programs\/new'\)/);
});

test('UX103 plate calculator uses profile units and a visual sleeve', () => {
  assert.equal(standardBarKg('kg'), 20);
  assert.equal(standardBarKg('lbs'), 45);
  assert.deepEqual(plateInventory('kg'), [25, 20, 15, 10, 5, 2.5, 1.25]);
  assert.deepEqual(plateInventory('lbs'), [55, 45, 35, 25, 10, 5, 2.5]);
  assert.equal(plateStyle(25, 'kg').bg, 'bg-red-600');
  assert.equal(plateStyle(20, 'kg').bg, 'bg-blue-600');
  assert.equal(plateStyle(15, 'kg').bg, 'bg-yellow-400');
  assert.equal(plateStyle(10, 'kg').bg, 'bg-green-600');
  assert.equal(plateStyle(5, 'kg').bg, 'bg-white');
  assert.equal(plateStyle(2.5, 'kg').bg, 'bg-neutral-800');
  assert.equal(plateStyle(55, 'lbs').bg, 'bg-red-600');
  assert.equal(plateStyle(45, 'lbs').bg, 'bg-blue-600');
  const kg = platesForLoad(100, 'kg');
  assert.deepEqual(kg.perSide, [{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
  assert.equal(kg.leftover, 0);
  assert.equal(totalFromSleeve([25, 15], 20), 100);
  const lbs = platesForLoad(225, 'lbs');
  assert.deepEqual(lbs.perSide, [{ plate: 55, count: 1 }, { plate: 35, count: 1 }]);
  assert.deepEqual(platesForLoad(135, 'lbs').perSide, [{ plate: 45, count: 1 }]);
  const card = src('src/components/workout/ExerciseCard.tsx') + src('src/components/workout/SetRow.tsx') + src('src/features/workout/domain/overloadSuggestion.ts') + src('src/features/workout/hooks/useExerciseHistory.ts');
  assert.match(card, /data-plates-open="true"/);
  assert.match(card, /<PlateCalc/);
  assert.match(card, /unit=\{weightUnit\}/);
  assert.match(card, /import \{ isPerformedSet \} from '..\/..\/lib\/performedSets'/);
  const calc = src('src/components/workout/PlateCalc.tsx');
  assert.match(calc, /data-plate-sleeve="true"/);
  assert.match(calc, /data-plate-palette="true"/);
  assert.match(calc, /data-plate-add=/);
  assert.match(calc, /data-plate-total="true"/);
});

test('16g session logger stays usable on a phone', () => {
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /data-workout-logger="true"/);
  assert.match(form, /min-w-0/);
  const card = src('src/components/workout/ExerciseCard.tsx') + src('src/components/workout/SetRow.tsx') + src('src/features/workout/domain/overloadSuggestion.ts') + src('src/features/workout/hooks/useExerciseHistory.ts');
  assert.match(card, /data-set-row="true"/);
  assert.match(card, /OverflowMenu/);
  assert.match(card, /SetRowMenu/);
  assert.match(card, /min-h-11 min-w-11/);
});

test('UX104 reuse a meal from a chosen day, not only yesterday', () => {
  const page = src('src/components/nutrition/NutritionPage.tsx');
  assert.match(page, /data-reuse-date="true"/);
  assert.match(page, /handleReuseCategory\(reuseCategory, reuseDate\)/);
  assert.match(page, /openReuse/);
  assert.doesNotMatch(page, /onReuse=\{\(\) => handleReuseCategory\(cat\.value\)\}/);
});

test('UX105 scanner inherits journal date and category', () => {
  const page = src('src/components/nutrition/NutritionPage.tsx');
  assert.match(page, /\/scanner\?date=\$/);
  assert.match(page, /category=\$/);
  const scanner = src('src/components/scanner/ScannerPage.tsx');
  assert.match(scanner, /searchParams\.get\('category'\)/);
  assert.match(scanner, /searchParams\.get\('date'\)/);
});

test('UX106 HEIC is converted before upload; failure still says heic_unsupported', async () => {
  assert.equal(isHeicLike({ name: 'IMG_001.HEIC', type: '' }), true);
  const jpeg = new File([new Uint8Array([0xff, 0xd8])], 'a.jpg', { type: 'image/jpeg' });
  const ok = await imageFileForUpload(jpeg);
  assert.equal('file' in ok, true);
  const heic = new File([new Uint8Array([1, 2, 3])], 'a.heic', { type: 'image/heic' });
  const fail = await imageFileForUpload(heic);
  assert.equal('error' in fail && fail.error === 'heic_unsupported', true);

  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /imageFileForUpload/);
  assert.match(store, /heic_unsupported/);
  const nutrition = src('src/stores/nutritionStore.ts');
  assert.match(nutrition, /imageFileForUpload/);
  const avatar = src('src/components/profile/AvatarUpload.tsx');
  assert.match(avatar, /imageFileForUpload/);
  assert.match(avatar, /image\/heic/);
});
