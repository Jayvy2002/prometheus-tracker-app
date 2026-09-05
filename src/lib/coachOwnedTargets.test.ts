import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasSentNutritionTarget,
  MIN_SENT_CALORIE_TARGET,
  stripSelfServeNutritionTargets,
} from './coachOwnedTargets';

test('sent target is a finished kcal floor, not the schema default 2000', () => {
  assert.equal(hasSentNutritionTarget(null), false);
  assert.equal(hasSentNutritionTarget({ daily_calorie_target: null }), false);
  assert.equal(hasSentNutritionTarget({ daily_calorie_target: 0 }), false);
  assert.equal(hasSentNutritionTarget({ daily_calorie_target: MIN_SENT_CALORIE_TARGET - 1 }), false);
  assert.equal(hasSentNutritionTarget({ daily_calorie_target: MIN_SENT_CALORIE_TARGET }), true);
  assert.equal(hasSentNutritionTarget({ daily_calorie_target: 2200 }), true);
});

test('coached athletes cannot self-serve nutrition, water, or steps targets', () => {
  const updates = stripSelfServeNutritionTargets({
    goal: 'cut',
    target_weight_kg: 70,
    daily_calorie_target: 2000,
    protein_target: 150,
    carbs_target: 250,
    fat_target: 65,
    daily_water_target_ml: 3000,
    daily_steps_target: 12000,
  }, true);
  assert.equal(updates.goal, 'cut');
  assert.equal(updates.target_weight_kg, 70);
  assert.equal('daily_calorie_target' in updates, false);
  assert.equal('protein_target' in updates, false);
  assert.equal('carbs_target' in updates, false);
  assert.equal('fat_target' in updates, false);
  assert.equal('daily_water_target_ml' in updates, false);
  assert.equal('daily_steps_target' in updates, false);
});

test('solo tracker still writes kcal from GoalsForm / onboarding', () => {
  const updates = stripSelfServeNutritionTargets({
    daily_calorie_target: 2400,
    protein_target: 160,
  }, false);
  assert.equal(updates.daily_calorie_target, 2400);
  assert.equal(updates.protein_target, 160);
});
