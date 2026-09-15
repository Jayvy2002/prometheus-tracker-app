import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { imageFileForUpload, isHeicLike } from './heicConvert';
import { platesForLoad, standardBarKg } from './plateMath';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

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

test('UX102 free session saves as a plan day with lot 14 types', () => {
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /data-save-plan="true"/);
  assert.match(form, /workoutExerciseToPlanDraft/);
  assert.match(form, /soloAsk\.savePlan/);
  assert.match(form, /createProgram/);
  assert.doesNotMatch(form, /navigate\('\/programs\/new'\)/);
});

test('UX103 plate calculator uses profile units and a standard bar', () => {
  assert.equal(standardBarKg('kg'), 20);
  assert.equal(standardBarKg('lbs'), 45);
  const kg = platesForLoad(100, 'kg');
  assert.deepEqual(kg.perSide, [{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
  assert.equal(kg.leftover, 0);
  const lbs = platesForLoad(225, 'lbs');
  assert.deepEqual(lbs.perSide, [{ plate: 45, count: 2 }]);
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /data-plates-open="true"/);
  assert.match(card, /<PlateCalc/);
  assert.match(card, /unit=\{weightUnit\}/);
  assert.match(card, /import \{ isPerformedSet \} from '..\/..\/lib\/performedSets'/);
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
