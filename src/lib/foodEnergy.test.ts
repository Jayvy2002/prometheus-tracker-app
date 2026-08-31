import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KJ_PER_KCAL,
  correctLogCalories,
  energyLooksLikeKj,
  kcalFromEnergyValue,
  kcalPer100gFromNutriments,
  normalizePer100gKcal,
} from './foodEnergy';

test('Kallo rice cakes: OFF energy-kcal_100g is kJ; use energy_100g / 4.184', () => {
  const n = {
    'energy-kcal_100g': 1900,
    'energy-kcal': 1900,
    energy_100g: 1643.5,
    proteins_100g: 8.5,
    carbohydrates_100g: 82.3,
    fat_100g: 2.7,
  };
  const kcal = kcalPer100gFromNutriments(n);
  assert.ok(kcal > 360 && kcal < 430, `expected ~393 kcal, got ${kcal}`);
  assert.ok(Math.abs(kcal - 1643.5 / KJ_PER_KCAL) < 0.01);
});

test('energy-kcal above 900 kcal/100g is treated as kJ even without a kJ field', () => {
  const kcal = normalizePer100gKcal(1900, 8.5, 82.3, 2.7);
  assert.ok(kcal > 400 && kcal < 500, `expected ~454 kcal, got ${kcal}`);
});

test('a logged 100g rice-cakes row displays ~kcal not ~kJ', () => {
  const calories = correctLogCalories({
    calories: 1900,
    protein: 9,
    carbs: 82,
    fat: 3,
    quantity: 100,
    unit: 'g',
  });
  assert.ok(calories < 600, `still looks like kJ: ${calories}`);
  assert.ok(calories > 350);
});

test('real kcal is left alone (poulet ~103, burrito, oil)', () => {
  assert.equal(
    Math.round(kcalPer100gFromNutriments({
      'energy-kcal_100g': 103,
      energy_100g: 439.8,
      proteins_100g: 21,
      carbohydrates_100g: 0.5,
      fat_100g: 1.7,
    })),
    103,
  );
  assert.equal(kcalFromEnergyValue(1200, { protein: 50, carbs: 120, fat: 50 }), 1200);
  assert.equal(kcalFromEnergyValue(884, { protein: 0, carbs: 0, fat: 100, grams: 100 }), 884);
  assert.equal(energyLooksLikeKj(1768, { protein: 0, carbs: 0, fat: 200, grams: 200 }), false);
});

test('missing kcal falls back to kJ / 4.184', () => {
  const kcal = kcalPer100gFromNutriments({
    energy_100g: 418.4,
    proteins_100g: 10,
    carbohydrates_100g: 10,
    fat_100g: 2,
  });
  assert.ok(Math.abs(kcal - 100) < 0.01);
});
