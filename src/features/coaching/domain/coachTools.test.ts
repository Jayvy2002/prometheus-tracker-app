import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('UX107 FAB offers check-in when the module is on', () => {
  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /track_checkins/);
  assert.match(fab, /nav\.addCheckin/);
  assert.match(fab, /navigate\('\/checkin'\)/);
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

test('UX111 coached mobile stays at 5 tabs; nutrition is profile + FAB', () => {
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /UX111/);
  assert.match(nav, /Pas de 6ᵉ onglet/);
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.match(profile, /to="\/nutrition"/);
  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /nav\.addMeal/);
  const tabs = src('src/app/navigation/navConfig.test.ts');
  assert.match(tabs, /paths\.length, 5/);
});
