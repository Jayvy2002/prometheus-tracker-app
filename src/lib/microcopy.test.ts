import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const locale = (language: 'fr' | 'en') =>
  readFileSync(resolve(process.cwd(), `src/i18n/locales/${language}.ts`), 'utf8');

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
