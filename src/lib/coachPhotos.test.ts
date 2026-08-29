import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultComparePair,
  photoCompareKind,
  resolveComparePair,
  sortedProgressPhotos,
} from './coachPhotos';
import type { ProgressPhoto } from './types';

function photo(id: string, takenAt: string, kind: ProgressPhoto['kind'] = 'front'): ProgressPhoto {
  return {
    id,
    user_id: 'marc-id',
    taken_at: takenAt,
    kind,
    storage_path: `${id}.jpg`,
    notes: '',
    created_at: `${takenAt}T12:00:00Z`,
  };
}

test('empty compare state has no pair — Relancer, not a settings lecture', () => {
  assert.equal(photoCompareKind([]), 'empty');
  assert.deepEqual(defaultComparePair([]), { oldest: null, newest: null });
});

test('a single photo is not a scavenger hunt: one slot filled, the other empty', () => {
  const only = photo('p1', '2026-08-01', 'side');
  assert.equal(photoCompareKind([only]), 'single');
  const pair = defaultComparePair([only]);
  assert.equal(pair.oldest?.id, 'p1');
  assert.equal(pair.newest, null);
});

test('two photos default to plus ancienne vs plus récente, even with different angles', () => {
  const older = photo('old', '2026-06-01', 'front');
  const newer = photo('new', '2026-08-20', 'side');
  const extra = photo('mid', '2026-07-10', 'back');
  assert.equal(photoCompareKind([newer, older, extra]), 'pair');
  const pair = defaultComparePair([newer, extra, older]);
  assert.equal(pair.oldest?.id, 'old');
  assert.equal(pair.newest?.id, 'new');
  assert.deepEqual(sortedProgressPhotos([newer, extra, older]).map(p => p.id), ['old', 'mid', 'new']);
});

test('coach can pick two other photos without hunting a matching kind', () => {
  const a = photo('a', '2026-06-01', 'front');
  const b = photo('b', '2026-07-01', 'side');
  const c = photo('c', '2026-08-01', 'back');
  const picked = resolveComparePair([c, a, b], 'b', 'c');
  assert.equal(picked.oldest?.id, 'b');
  assert.equal(picked.newest?.id, 'c');
});
