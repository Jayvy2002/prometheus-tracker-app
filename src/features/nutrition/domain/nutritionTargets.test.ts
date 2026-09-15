import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definedTarget, nutritionTargetsFromProfile, targetRatio } from './nutritionTargets';

test('definedTarget rejects missing and zero fallbacks', () => {
  assert.equal(definedTarget(undefined), null);
  assert.equal(definedTarget(null), null);
  assert.equal(definedTarget(0), null);
  assert.equal(definedTarget(-10), null);
  assert.equal(definedTarget(150), 150);
});

test('nutritionTargetsFromProfile never invents 150 / 250 / 65', () => {
  assert.deepEqual(nutritionTargetsFromProfile(null), {
    calories: null, protein: null, carbs: null, fat: null, waterMl: null, steps: null,
  });
  assert.deepEqual(nutritionTargetsFromProfile({ protein_target: 0, carbs_target: 250 }), {
    calories: null, protein: null, carbs: 250, fat: null, waterMl: null, steps: null,
  });
});

test('targetRatio is 0 without a real target', () => {
  assert.equal(targetRatio(80, null), 0);
  assert.equal(targetRatio(80, 160), 50);
});
