import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  PERSONAL_EXPORT_EXCLUDED,
  PERSONAL_EXPORT_INCLUDED,
  dataAudience,
  deleteConfirmToken,
  profileExportFields,
  sharedModulesForCoach,
} from './dataControl';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('solo audience is self; coached names the coach and shared modules', () => {
  assert.deepEqual(dataAudience({
    hasCoach: false, coachName: null,
    tracking: { track_workouts: true, track_checkins: true, track_nutrition: true, track_weight: true },
  }), { photos: 'self', coachName: null, modules: [] });
  assert.deepEqual(dataAudience({
    hasCoach: true, coachName: 'Chantier Coach',
    tracking: { track_workouts: true, track_checkins: true, track_nutrition: false, track_weight: false },
  }), { photos: 'coach', coachName: 'Chantier Coach', modules: ['workouts', 'checkins'] });
  assert.deepEqual(sharedModulesForCoach({
    track_workouts: false, track_checkins: false, track_nutrition: false, track_weight: true,
  }), ['weight']);
});

test('export lists journals and never coach notes or medical intake', () => {
  assert.ok(PERSONAL_EXPORT_INCLUDED.includes('workouts'));
  assert.ok(PERSONAL_EXPORT_INCLUDED.includes('progress_photos'));
  assert.ok(PERSONAL_EXPORT_EXCLUDED.includes('coach_notes'));
  assert.ok(PERSONAL_EXPORT_EXCLUDED.includes('kinesiology_intake'));
  const stripped = profileExportFields({
    full_name: 'Solo',
    kinesiology_intake: { pain: true },
    kinesiology_intake_completed_at: '2026-01-01',
  });
  assert.equal(stripped?.full_name, 'Solo');
  assert.equal('kinesiology_intake' in (stripped ?? {}), false);
});

test('delete confirm word matches the language the user sees', () => {
  assert.equal(deleteConfirmToken('fr'), 'SUPPRIMER');
  assert.equal(deleteConfirmToken('fr-CA'), 'SUPPRIMER');
  assert.equal(deleteConfirmToken('en'), 'DELETE');
});

test('UX66 wires profile panel, export fetch, and honest delete recap', () => {
  const page = src('src/components/profile/ProfilePage.tsx');
  assert.match(page, /DataControlPanel/);
  assert.match(page, /deleteConfirmToken/);
  assert.match(page, /data-delete-open/);
  assert.match(page, /data-delete-confirm/);
  assert.match(page, /data-delete-confirm-submit/);
  const panel = src('src/components/profile/DataControlPanel.tsx');
  assert.match(panel, /data-control-panel/);
  assert.match(panel, /data-audience/);
  assert.match(panel, /data-export/);
  assert.match(panel, /exportPersonalData/);
  const api = src('src/features/account/data/exportPersonalData.ts');
  assert.match(api, /PERSONAL_EXPORT_EXCLUDED/);
  assert.match(api, /nutrition_logs.*name/);
  assert.match(api, /energy_level/);
  assert.doesNotMatch(api, /food_name/);
  assert.doesNotMatch(api, /coach_notes/);
  assert.doesNotMatch(api, /kinesiology_intake/);
  const fr = src('src/i18n/locales/fr/common.ts');
  const en = src('src/i18n/locales/en/common.ts');
  assert.match(fr, /dataControl:/);
  assert.match(en, /dataControl:/);
  assert.match(fr, /photosSelf:/);
  assert.match(en, /photosSelf:/);
});
