import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { SEARCH_CATEGORIES, field, ilikePattern, rankSearch, searchReady, snippetAround, type SearchItem } from './globalSearch';

const item = (id: string, category: SearchItem['category'], title: string): SearchItem => ({
  id, category, title, href: `/x/${id}`, fields: [field(title)],
});

test('nothing below two letters; groups follow the workspace order (Vision §33)', () => {
  assert.equal(searchReady('s'), false);
  assert.deepEqual(rankSearch([item('a', 'clients', 'Sophie')], 's', 'coach'), []);
  assert.deepEqual(SEARCH_CATEGORIES.coach, ['clients', 'prospects', 'programs', 'exercises', 'conversations']);
  assert.deepEqual(SEARCH_CATEGORIES.personal, ['exercises', 'sessions', 'routines', 'programs', 'personal']);
  const groups = rankSearch([
    item('p', 'programs', 'Squat 5x5'),
    item('e', 'exercises', 'Squat'),
    item('c', 'clients', 'Squatteur Martin'),
  ], 'squat', 'coach');
  assert.deepEqual(groups.map(g => g.category), ['clients', 'programs', 'exercises']);
});

test('accents and case do not matter; best match first; five per group', () => {
  const many = Array.from({ length: 8 }, (_, i) => item(`e${i}`, 'exercises', `Développé couché variante ${i}`));
  const groups = rankSearch([...many, item('x', 'exercises', 'Developpe couche')], 'developpe couche', 'personal');
  assert.equal(groups[0].items.length, 5);
  assert.equal(groups[0].items[0].id, 'x');
});

test('a category outside the workspace is never listed, even if supplied', () => {
  const groups = rankSearch([item('c', 'clients', 'Marie Durand'), item('s', 'sessions', 'Marie jambes')], 'marie', 'personal');
  assert.deepEqual(groups.map(g => g.category), ['sessions']);
});

test('server filters treat % and _ literally; snippets show the matching words', () => {
  assert.equal(ilikePattern(' 100%_ok '), '%100\\%\\_ok%');
  assert.equal(snippetAround('Salut ! Pense à ton échauffement avant le squat demain matin, et bois de l’eau.', 'echauffement', 10), '…Pense à ton échauffement avant le squat…');
});

test('every source is scoped to the person: own rows or own threads, nothing wider', () => {
  const sources = readFileSync(resolve(process.cwd(), 'src/features/search/api/searchSources.ts'), 'utf8');
  const selects = sources.match(/\.from\('[a-z_]+'\)/g) ?? [];
  assert.ok(selects.length >= 7);
  for (const block of sources.split('export async function').slice(1)) {
    assert.match(block, /\.eq\('(owner_id|user_id|coach_id)', (userId|coachId)\)/);
  }
  assert.doesNotMatch(sources, /rpc\(|service_role/);
  const palette = readFileSync(resolve(process.cwd(), 'src/components/search/GlobalSearchPalette.tsx'), 'utf8');
  assert.match(palette, /activeWorkspace === 'coaching' \? 'coach' : 'personal'/);
  assert.match(palette, /role="dialog"/);
  assert.match(palette, /search\.empty/);
});
