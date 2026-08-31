import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { mapOffProduct } from './openFoodFacts';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('French product_name_fr is used when product_name is empty', () => {
  const hit = mapOffProduct({
    code: '123',
    product_name: '',
    product_name_fr: 'Blanc de poulet grillé',
    brands: 'Fleury Michon',
    nutriments: {
      'energy-kcal_100g': 105,
      proteins_100g: 23,
      carbohydrates_100g: 0.5,
      fat_100g: 1.2,
    },
    serving_quantity: 40,
  });
  assert.equal(hit?.name, 'Blanc de poulet grillé');
  assert.equal(hit?.brand, 'Fleury Michon');
  assert.equal(hit?.calories_per_100g, 105);
});

test('cgi search must not send fields= (503 on poulet / riz)', () => {
  const off = src('src/lib/openFoodFacts.ts');
  assert.match(off, /cgi\/search\.pl/);
  assert.doesNotMatch(off, /cgi\/search\.pl[^`\n]*fields=/);
  assert.match(off, /product_name_fr/);
  assert.match(off, /fr\.openfoodfacts\.org/);
});

test('FoodForm and IngredientPicker use the shared OFF search', () => {
  const food = src('src/components/nutrition/FoodForm.tsx');
  const ing = src('src/components/nutrition/IngredientPicker.tsx');
  assert.match(food, /searchOpenFoodFacts/);
  assert.match(ing, /searchOpenFoodFacts/);
  assert.doesNotMatch(food, /cgi\/search\.pl/);
  assert.doesNotMatch(ing, /cgi\/search\.pl/);
});
