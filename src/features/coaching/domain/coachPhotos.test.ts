import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  defaultComparePair,
  photoCompareKind,
  resolveComparePair,
  sortedProgressPhotos,
} from './coachPhotos';
import {
  athletePhotoAudience,
  athletePhotoSubtitleKey,
  currentCoachSeesPhotoHistory,
  hasPhotosBeforeLink,
} from '../../../lib/photoAudience';
import type { ProgressPhoto } from '../../../lib/types';

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

test('athlete photo copy follows the real coach, not a generic “your coach sees them”', () => {
  assert.equal(athletePhotoAudience(false), 'solo');
  assert.equal(athletePhotoAudience(true), 'coached');
  assert.equal(athletePhotoSubtitleKey('solo'), 'coaching.photos.subtitleSolo');
  assert.equal(athletePhotoSubtitleKey('coached'), 'coaching.photos.subtitleCoached');
  assert.equal(currentCoachSeesPhotoHistory(), true);
  assert.equal(hasPhotosBeforeLink([photo('old', '2026-01-01')], '2026-06-01T10:00:00Z'), true);
  assert.equal(hasPhotosBeforeLink([photo('new', '2026-08-01')], '2026-06-01T10:00:00Z'), false);
});

test('photos page and consent copy tell the real audience, including history before the link', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientPhotosPage.tsx'), 'utf8');
  assert.match(page, /athletePhotoSubtitleKey/);
  assert.match(page, /myCoach/);
  assert.doesNotMatch(page, /t\('coaching\.photos\.subtitle'\)/);

  const dossier = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientDetailPage.tsx'), 'utf8');
  assert.match(dossier, /coaching\.photos\.coachSeesHistory/);

  const fr = readFileSync(resolve(process.cwd(), 'src/i18n/locales/fr.ts'), 'utf8');
  const en = readFileSync(resolve(process.cwd(), 'src/i18n/locales/en.ts'), 'utf8');
  const photosFr = fr.slice(fr.indexOf('photos: {'), fr.indexOf('settings: {', fr.indexOf('photos: {')));
  assert.match(photosFr, /subtitleSolo:/);
  assert.match(photosFr, /subtitleCoached:/);
  assert.doesNotMatch(photosFr, /Ton coach les voit/);
  assert.match(fr, /progress_photos: 'Photos de progression — y compris celles déjà enregistrées avant ce suivi'/);
  assert.match(en, /progress_photos: 'Progress photos — including those already saved before this coaching relationship'/);
  assert.match(photosFr, /coachSeesHistory:/);
});
