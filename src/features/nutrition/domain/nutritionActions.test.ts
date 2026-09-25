import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

/** Every <button …>…</button> of a component (attributes and children). */
function buttonTags(source: string): string[] {
  return source.split('<button').slice(1).map(chunk => chunk.slice(0, chunk.indexOf('</button>')));
}

/** A button whose only child is an icon. */
const ICON_ONLY = /^[\s\S]*?>\s*<(?:ArrowLeft|Trash2|Pencil|Minus|Heart|Plus)\b[^<]*\/>\s*$/;

test('lot D: meal actions are named, readable and 44 px; reuse says what it does', () => {
  const meal = src('src/components/nutrition/MealSection.tsx');
  const buttons = buttonTags(meal);
  assert.equal(buttons.length, 4, 'reuse, add, edit, delete');
  for (const tag of buttons) {
    assert.match(tag, /aria-label=\{t\('nutrition\./, `named: ${tag}`);
    assert.match(tag, /min-h-11|iconAction/, `44 px: ${tag}`);
  }
  assert.match(meal, /const iconAction = 'inline-flex min-h-11 min-w-11/);
  // Visible short label next to ↺, and no pale 20 px icons left.
  assert.match(meal, /nutrition\.reuseShort/);
  assert.doesNotMatch(meal, /text-neutral-600/);
  assert.doesNotMatch(meal, /className="p-1 /);
  // Undo stays; « removed » only once the row is really gone.
  assert.match(meal, /toastWithUndo\(t\('nutrition\.itemRemoved'/);
  assert.match(meal, /getState\(\)\.logs\.some\(l => l\.id === snapshot\.id\)\) return/);
  // Lot A wording is reused, not rewritten.
  assert.match(meal, /nutrition\.kcalValue/);
  assert.match(meal, /nutrition\.macrosShort/);
});

test('lot D: other nutrition icon buttons have a name and a 44 px target', () => {
  const files = {
    food: src('src/components/nutrition/FoodForm.tsx'),
    picker: src('src/components/nutrition/IngredientPicker.tsx'),
    recipe: src('src/components/nutrition/RecipeForm.tsx'),
    recipes: src('src/components/nutrition/RecipesPage.tsx'),
    steps: src('src/components/nutrition/StepsTracker.tsx'),
    water: src('src/components/nutrition/WaterTracker.tsx'),
  };
  assert.match(files.food, /aria-label=\{t\(isFavorited \? 'nutrition\.foodForm\.removeFavorite' : 'nutrition\.foodForm\.addFavorite'\)\}/);
  assert.match(files.food, /aria-pressed=\{isFavorited\}/);
  assert.doesNotMatch(files.food, /kcal\/serving/);
  assert.doesNotMatch(files.food, /· C \{Math\.round\(remainC\)\}g/);
  assert.match(files.picker, /aria-label=\{t\('common\.back'\)\}/);
  assert.doesNotMatch(files.picker, /→ 1 serving/);
  assert.match(files.recipe, /aria-label=\{t\('common\.back'\)\}/);
  assert.match(files.recipe, /nutrition\.recipeForm\.removeIngredient/);
  assert.match(files.steps, /aria-label=\{t\('nutrition\.steps\.reset'\)\}/);
  assert.match(files.water, /aria-label=\{t\('nutrition\.water\.removeLast'\)\}/);
  // Icon-only buttons (an icon and no text child) all carry min-h-11 min-w-11.
  let iconOnlyCount = 0;
  for (const [name, source] of Object.entries(files)) {
    for (const tag of buttonTags(source).filter(b => ICON_ONLY.test(b))) {
      iconOnlyCount += 1;
      assert.match(tag, /min-h-11 min-w-11/, `${name}: ${tag}`);
      assert.match(tag, /aria-label=/, `${name}: ${tag}`);
    }
  }
  // back ×2, favorite, remove ingredient, recipe edit + delete, steps reset, water remove
  assert.ok(iconOnlyCount >= 8, `icon-only buttons checked: ${iconOnlyCount}`);
});

test('lot D: an edit is confirmed before « updated » is shown', () => {
  const modal = src('src/components/nutrition/EditFoodModal.tsx');
  const check = modal.indexOf('if (before && after === before) return;');
  const toastAt = modal.indexOf("toast(t('nutrition.editModal.updated'))");
  assert.ok(check > 0 && toastAt > check);
});

test('lot D: new nutrition keys exist in French and English', () => {
  const fr = src('src/i18n/locales/fr/nutrition.ts');
  const en = src('src/i18n/locales/en/nutrition.ts');
  for (const key of ['reuseShort', 'reuseMealFor', 'addFoodTo', 'editItem', 'deleteItem', 'kcalPerServing', 'addFavorite', 'removeFavorite', 'removeIngredient', 'reset']) {
    assert.match(fr, new RegExp(`\\b${key}:`), `fr ${key}`);
    assert.match(en, new RegExp(`\\b${key}:`), `en ${key}`);
  }
});
