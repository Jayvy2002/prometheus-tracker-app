import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import { quickAddActions } from '../../../app/navigation/navConfig';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('UX107 FAB offers check-in when the module is on', () => {
  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /quickAddActions\(tracking\)/);
  const on = { track_workouts: true, track_checkins: true, track_nutrition: true, track_weight: true };
  assert.ok(quickAddActions(on).some(a => a.path === '/checkin' && a.labelKey === 'nav.addCheckin'));
  assert.equal(quickAddActions({ ...on, track_checkins: false }).some(a => a.path === '/checkin'), false);
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /labelKey: 'nav\.addCheckin'/);
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /addCheckin: 'Check-in'/);
});

test('UX108 library duplicate uses fork_program, not assign', () => {
  const store = src('src/stores/programStore.ts');
  assert.match(store, /duplicateProgram:/);
  assert.match(store, /rpc\('fork_program'/);
  const page = src('src/components/programs/ProgramsPage.tsx');
  assert.match(page, /programs\.duplicate/);
  assert.match(page, /duplicateProgram\(p\.id\)/);
});

test('UX109 session readout shows exercise notes', () => {
  const readout = src('src/components/workout/SessionReadout.tsx');
  assert.match(readout, /data-session-notes="true"/);
  assert.match(readout, /ex\.notes/);
  const mapper = src('src/features/coaching/domain/coachLastSession.ts');
  assert.match(mapper, /notes: \(ex\.notes \|\| ''\)\.trim\(\)/);
});

test('UX110 setup copies tracking from another client into the form', () => {
  const page = src('src/components/coaching/ClientSetupPage.tsx');
  assert.match(page, /data-copy-tracking="true"/);
  assert.match(page, /cloneTrackingConfig/);
  assert.match(page, /fetchTrackingConfig\(copyFromId\)/);
  assert.match(page, /setup_completed_at: prev\.setup_completed_at/);
});

test('coached mobile stays at 5 tabs and nutrition lives in the body hub', () => {
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /path: '\/body'/);
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.doesNotMatch(profile, /to="\/nutrition"/);
  assert.ok(quickAddActions({ track_workouts: true, track_checkins: true, track_nutrition: true, track_weight: true }).some(a => a.labelKey === 'nav.addMeal'));
  const tabs = src('src/app/navigation/navConfig.test.ts');
  assert.match(tabs, /paths\.length, 5/);
});
