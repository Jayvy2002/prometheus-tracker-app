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

test('D06: full-text goes through cgi/search.pl (v2 is structured search), never as-you-type', () => {
  const off = src('src/features/nutrition/domain/openFoodFacts.ts');
  assert.match(off, /cgi\/search\.pl/);
  assert.doesNotMatch(off, /cgi\/search\.pl[^`\n]*fields=/);
  assert.doesNotMatch(off, /openfoodfacts\.org\/api\/v2/);
  assert.match(off, /product_name_fr/);
  assert.match(off, /fr\.openfoodfacts\.org/);
  assert.match(off, /OFF_SEARCH_TIMEOUT_MS/);
  assert.match(off, /consumeOffBudget/);
  assert.match(off, /country/);
  const hook = src('src/features/nutrition/hooks/useFoodCatalogSearch.ts');
  // OFF only on explicit searchNow — the debounced effect stays local.
  assert.match(hook, /searchOpenFoodFacts\(q, \{ lang, country/);
  assert.match(hook, /Explicite \(bouton\/Entrée\)/);
  assert.match(hook, /offStatus/);
});

test('FoodForm and IngredientPicker use the shared OFF search', () => {
  const food = src('src/components/nutrition/FoodForm.tsx');
  const ing = src('src/components/nutrition/IngredientPicker.tsx');
  const hook = src('src/features/nutrition/hooks/useFoodCatalogSearch.ts');
  assert.match(food, /useFoodCatalogSearch/);
  assert.match(ing, /useFoodCatalogSearch/);
  assert.match(hook, /searchOpenFoodFacts/);
  assert.doesNotMatch(food, /cgi\/search\.pl/);
  assert.doesNotMatch(ing, /cgi\/search\.pl/);
});

test('D06: shared budget caps OFF at 10 calls per rolling minute', async () => {
  const { consumeOffBudget, resetOffBudgetForTests } = await import('./openFoodFacts');
  resetOffBudgetForTests();
  for (let i = 0; i < 10; i++) assert.equal(consumeOffBudget(1_000_000 + i * 1000), true);
  assert.equal(consumeOffBudget(1_000_000 + 11 * 1000), false);
  assert.equal(consumeOffBudget(1_000_000 + 61 * 1000), true);
  resetOffBudgetForTests();
});

test('D06: aborted or timed-out OFF search throws a typed error, never hangs', async () => {
  const { OffSearchError, searchOpenFoodFacts, resetOffBudgetForTests } = await import('./openFoodFacts');
  resetOffBudgetForTests();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    searchOpenFoodFacts('poulet', { signal: controller.signal }),
    (err: unknown) => err instanceof OffSearchError && err.kind === 'aborted',
  );
  resetOffBudgetForTests();
});
