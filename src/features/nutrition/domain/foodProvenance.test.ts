import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { foodProvenanceKey, foodProvenanceKind } from './foodProvenance';

test('provenance names the source and never claims a certification', () => {
  assert.equal(foodProvenanceKind({ _source: 'openfoodfacts' }), 'openfoodfacts');
  assert.equal(foodProvenanceKind({ data_source: 'openfoodfacts' }), 'openfoodfacts');
  assert.equal(foodProvenanceKind({ _source: 'db', data_source: 'foundation' }), 'catalog');
  assert.equal(foodProvenanceKind({ _source: 'favorite' }), 'favorite');
  assert.equal(foodProvenanceKind({ _source: 'recent' }), 'recent');
  assert.equal(foodProvenanceKind({ data_source: 'user' }), 'manual');
  assert.equal(foodProvenanceKind(null), 'manual');
  assert.equal(foodProvenanceKey('openfoodfacts'), 'nutrition.foodForm.provenance.openfoodfacts');
});

test('search hits and the selected food show provenance in words', () => {
  const hits = readFileSync(resolve(process.cwd(), 'src/components/nutrition/FoodSearchHits.tsx'), 'utf8');
  assert.match(hits, /foodProvenanceKind/);
  assert.match(hits, /foodProvenanceKey/);
  const form = readFileSync(resolve(process.cwd(), 'src/components/nutrition/FoodForm.tsx'), 'utf8');
  assert.match(form, /foodProvenanceKind/);
  const fr = readFileSync(resolve(process.cwd(), 'src/i18n/locales/fr/nutrition.ts'), 'utf8');
  assert.match(fr, /Open Food Facts — non certifié/);
  assert.match(fr, /Saisie manuelle — non certifié/);
  assert.doesNotMatch(fr, /certifié USDA|certifié nutrition/);
});
