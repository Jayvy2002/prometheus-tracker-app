import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  displayExerciseName,
  foodIdentity,
  isExactExerciseMatch,
  mergeRankedFoodHits,
  rankExercises,
  scoreAgainstQuery,
} from './pickerSearch';
import type { Exercise, FoodFavorite, FoodProduct } from './types';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function product(partial: Partial<FoodProduct> & { name: string }): FoodProduct {
  return {
    id: partial.id ?? '',
    barcode: partial.barcode ?? null,
    name: partial.name,
    brand: partial.brand ?? null,
    calories_per_100g: partial.calories_per_100g ?? 100,
    protein_per_100g: partial.protein_per_100g ?? 10,
    carbs_per_100g: partial.carbs_per_100g ?? 10,
    fat_per_100g: partial.fat_per_100g ?? 2,
    serving_size: partial.serving_size ?? 100,
    serving_unit: partial.serving_unit ?? 'g',
    created_by: null,
    created_at: '',
    data_source: partial.data_source ?? null,
  };
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

test('accent fold + prefix rank a branded food above a weak substring', () => {
  const hits = mergeRankedFoodHits({
    query: 'skyr vanille',
    db: [
      product({ name: 'Yaourt vanille 0%', brand: 'Marque X' }),
      product({ name: 'Skyr à la vanille', brand: 'Danone' }),
    ],
    off: [
      product({ name: 'Skyr Vanille', brand: 'Danone', barcode: '123' }),
    ],
    recents: [],
    favorites: [],
  });
  assert.equal(hits[0].name.toLowerCase().includes('skyr'), true);
  assert.equal(foodIdentity(hits[0]).startsWith('bc:') || hits[0].brand === 'Danone', true);
});

test('favorites and recents that match the query sit above catalog noise', () => {
  const fav: FoodFavorite = {
    id: 'f1',
    user_id: 'u',
    product_id: 'p1',
    product_name: 'Skyr nature',
    brand: 'Maison',
    calories_per_100g: 60,
    protein_per_100g: 10,
    carbs_per_100g: 4,
    fat_per_100g: 0,
    serving_size: 150,
    serving_unit: 'g',
    created_at: '',
  };
  const hits = mergeRankedFoodHits({
    query: 'skyr',
    db: [product({ name: 'Biscuits skyr crunch', brand: 'Snack Co' })],
    off: [],
    recents: [product({ name: 'Skyr nature', brand: 'Maison', id: 'p1' })],
    favorites: [fav],
  });
  assert.equal(hits[0]._source === 'favorite' || hits[0]._source === 'recent', true);
  assert.equal(hits[0].name, 'Skyr nature');
});

test('exercise search folds accents, ranks names over equipment, and matches nicknames', () => {
  const library = [
    exercise({ name: 'Barbell Bench Press', name_fr: 'Developpe couche', primary_muscles: ['chest'] }),
    exercise({ name: 'Barbell Row', name_fr: 'Row barre', primary_muscles: ['lats'], equipment: 'barbell' }),
    exercise({ name: 'Romanian Deadlift', name_fr: 'Souleve de terre roumain', primary_muscles: ['hamstrings'] }),
  ];
  const developpe = rankExercises(library, 'développé couché', 'fr');
  assert.equal(developpe[0].name, 'Barbell Bench Press');
  assert.equal(isExactExerciseMatch('Développé couché', library[0]), true);

  const bp = rankExercises(library, 'bp', 'fr');
  assert.equal(bp[0].name, 'Barbell Bench Press');

  const rdl = rankExercises(library, 'rdl', 'en');
  assert.equal(rdl[0].name, 'Romanian Deadlift');

  const typo = rankExercises(library, 'develope', 'fr');
  assert.equal(typo[0].name, 'Barbell Bench Press');

  const pecs = rankExercises(library, 'pectoraux', 'fr');
  assert.equal(pecs[0].name, 'Barbell Bench Press');

  const bar = rankExercises(library, 'barre', 'fr');
  assert.ok(bar.length >= 1);
  assert.equal(displayExerciseName(library[0], 'fr'), 'Developpe couche');
  assert.equal(displayExerciseName(library[0], 'en'), 'Barbell Bench Press');
});

test('token score needs every word when the whole query is not a substring', () => {
  const score = scoreAgainstQuery('bench press', [
    { text: 'Barbell Bench Press', weight: 1 },
  ]);
  const miss = scoreAgainstQuery('bench press', [
    { text: 'Face Pull', weight: 1 },
  ]);
  assert.ok(score > 60);
  assert.equal(miss, 0);
});

test('FoodForm and IngredientPicker search as you type and never skip Open Food Facts', () => {
  const food = src('src/components/nutrition/FoodForm.tsx');
  const ing = src('src/components/nutrition/IngredientPicker.tsx');
  const hook = src('src/lib/useFoodCatalogSearch.ts');
  const sql = src('supabase/migrations/20260907222909_food_search_rank.sql');
  assert.match(food, /useFoodCatalogSearch/);
  assert.match(ing, /useFoodCatalogSearch/);
  assert.match(hook, /searchOpenFoodFacts/);
  assert.match(hook, /FOOD_SEARCH_DEBOUNCE_MS/);
  assert.doesNotMatch(hook, /if \(dbResults\.length > 0\)/);
  assert.match(src('src/stores/exerciseStore.ts'), /rankExercises/);
  assert.match(src('src/components/workout/ExercisePicker.tsx'), /displayExerciseName/);
  assert.match(src('src/components/workout/ExercisePicker.tsx'), /hasStrongMatch/);
  assert.match(sql, /word_similarity/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.search_food_products/);
});
