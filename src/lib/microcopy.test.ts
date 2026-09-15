import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18nLocaleSource } from './i18nLocaleSource';

const locale = (language: 'fr' | 'en') => i18nLocaleSource(language);

test('user-facing copy avoids internal implementation jargon', () => {
  const copy = `${locale('fr')}\n${locale('en')}`;

  for (const jargon of [
    'SQL d’abord',
    'SQL first',
    'Formule ISSN de l’app',
    'App ISSN formula',
    'parseur local',
    'local parser',
    'agent in-app',
    'in-app agent',
    'best-effort',
    'Fuseau horaire IANA',
    'IANA timezone',
    'marketplace de widgets',
    'widget marketplace',
  ]) {
    assert.doesNotMatch(copy, new RegExp(jargon, 'i'), `internal copy leaked: ${jargon}`);
  }
});

test('reassurance is concise instead of repeated on every coach action', () => {
  const copy = `${locale('fr')}\n${locale('en')}`;

  for (const repeated of [
    'rien ne s’applique tout seul',
    'rien ne part tout seul',
    'nothing applies on its own',
    'nothing auto-applies',
    'nothing sends itself',
  ]) {
    assert.doesNotMatch(copy, new RegExp(repeated, 'i'), `repetitive reassurance returned: ${repeated}`);
  }
});

test('reminders stay factual and recipe controls are localized', () => {
  const fr = locale('fr');
  const en = locale('en');
  const recipes = readFileSync(resolve(process.cwd(), 'src/components/nutrition/RecipesPage.tsx'), 'utf8');

  assert.doesNotMatch(fr, /c’est l’assiduité qui manque|probablement du gras|Monte sur la balance|Bois un verre/);
  assert.doesNotMatch(en, /consistency is what’s missing|likely fat|Step on the scale|Grab a glass/);
  assert.doesNotMatch(recipes, />Delete Recipe<|>This action cannot be undone\.<|>Cancel<|>Delete</);
  assert.match(recipes, /nutrition\.recipes\.deleteTitle/);
  assert.match(recipes, /nutrition\.recipes\.servings/);
});
