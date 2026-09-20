import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import {
  PROGRAM_STALE,
  assignStartLabel,
  isProgramStaleError,
  mapProgramWriteError,
} from './programWrite';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('maps stale SQL to a stable client code', () => {
  assert.equal(isProgramStaleError(null), false);
  assert.equal(isProgramStaleError(PROGRAM_STALE), true);
  assert.equal(isProgramStaleError('ERROR: stale'), true);
  assert.equal(
    mapProgramWriteError('ERROR: stale', { stale: 'reload', fallback: 'retry' }),
    'reload',
  );
  assert.equal(
    mapProgramWriteError('Not program owner', { stale: 'reload', fallback: 'retry' }),
    'retry',
  );
  assert.equal(
    mapProgramWriteError('already_scheduled', {
      stale: 'reload',
      fallback: 'retry',
      scheduled: 'replace',
      historical: 'hist',
    }),
    'replace',
  );
  assert.equal(
    mapProgramWriteError('historical', {
      stale: 'reload',
      fallback: 'retry',
      scheduled: 'replace',
      historical: 'hist',
    }),
    'hist',
  );
  assert.equal(
    mapProgramWriteError('mixed phase durations', {
      stale: 'reload',
      fallback: 'retry',
      mixedPhases: 'mixed',
      invalidSets: 'sets',
    }),
    'mixed',
  );
  assert.equal(
    mapProgramWriteError('Invalid sets for Bench', {
      stale: 'reload',
      fallback: 'retry',
      mixedPhases: 'mixed',
      invalidSets: 'sets',
    }),
    'sets',
  );
});

test('assign recap date stays on the local calendar day', () => {
  assert.equal(assignStartLabel('not-a-date', 'fr-FR'), 'not-a-date');
  const label = assignStartLabel('2026-09-15', 'en-GB');
  assert.match(label, /15/);
  assert.match(label, /9|09|Sep/i);
});

test('latest save_program wraps metadata + sync_program_days, refuses stale, and blocks coached leftover owners', () => {
  const found = latestMigrationContaining(/CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.equal(found.file, '20260919225507_program_phases.sql');
  assert.match(found.sql, /SECURITY DEFINER/);
  assert.match(found.sql, /SET search_path = public/);
  assert.match(found.sql, /RAISE EXCEPTION 'stale'/);
  assert.match(found.sql, /coached_client_cannot_edit_program/);
  assert.match(found.sql, /Coached client cannot edit assigned program/);
  assert.match(found.sql, /v_days := public\.sync_program_days\(p_program_id, p_days\)/);
  assert.match(found.sql, /p_session_organization text DEFAULT NULL/);
  assert.match(found.sql, /p_phases jsonb DEFAULT NULL/);
  assert.match(found.sql, /GRANT EXECUTE ON FUNCTION public\.save_program\(uuid, text, text, int, jsonb, timestamptz, text, jsonb\) TO authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.save_program\(uuid, text, text, int, jsonb, timestamptz, text, jsonb\) FROM PUBLIC, anon/);
});

test('legacy program RPCs, owner RLS and assignment Data API share the leftover coached lock', () => {
  const found = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.coached_client_cannot_edit_program');
  assert.equal(found.file, '20260918103748_program_write_coached_owner.sql');
  const sync = latestMigrationContaining(/CREATE OR REPLACE FUNCTION public\.sync_program_days\(/);
  assert.equal(sync.file, '20260920014500_p3_hardening.sql');
  assert.match(sync.sql, /coached_client_cannot_edit_program/);
  const day = latestMigrationContaining(/CREATE OR REPLACE FUNCTION public\.save_program_day_exercises\(/);
  assert.equal(day.file, '20260918103748_program_write_coached_owner.sql');
  assert.match(day.sql, /coached_client_cannot_edit_program/);
  assert.match(found.sql, /LANGUAGE plpgsql/);
  assert.match(found.sql, /Owners update programs/);
  assert.match(found.sql, /Owners update program days/);
  assert.match(found.sql, /Owners update program day exercises/);
  assert.match(found.sql, /Owners manage programs/);
  assert.match(found.sql, /Owners manage program days/);
  assert.match(found.sql, /Owners manage program day exercises/);
  assert.match(found.sql, /Assigner inserts assignments/);
  assert.match(found.sql, /actor_owns_program/);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260918103748"/);
  assert.match(src('supabase/tests/save_program_coached.sql'), /sync_program_days/);
  assert.match(src('supabase/tests/save_program_coached.sql'), /save_program_day_exercises/);
  assert.match(src('supabase/tests/save_program_coached.sql'), /self-assign INSERT/);
  assert.match(src('supabase/tests/save_program_coached.sql'), /user_capabilities/);
  assert.match(src('supabase/tests/save_program_coached.sql'), /dual roster sync/);
  assert.match(src('.github/workflows/ci.yml'), /bash -eo pipefail \{0\}/);
});

test('editor and solo save go through saveProgram; delete waits for the server', () => {
  const store = src('src/stores/programStore.ts');
  assert.match(store, /rpc\('save_program'/);
  assert.match(store, /p_expected_updated_at/);
  const deleteFn = store.slice(store.indexOf('deleteProgram: async'));
  assert.match(deleteFn, /rpc\('delete_program'/);
  assert.match(deleteFn, /p_program_id: id/);
  assert.doesNotMatch(deleteFn, /from\('programs'\)\.delete/);
  assert.match(deleteFn, /if \(error\) return \{ error:/);
  assert.match(deleteFn, /ne retire du store qu'après/);
  const fetchFn = store.slice(store.indexOf('fetchPrograms: async'));
  assert.doesNotMatch(fetchFn.slice(0, 900), /programs: \[\]/);
  assert.match(fetchFn, /programsError/);

  const editor = src('src/components/programs/ProgramEditorPage.tsx');
  assert.match(editor, /saveProgram\(/);
  assert.doesNotMatch(editor, /updateProgram\(/);
  assert.doesNotMatch(editor, /syncProgramDays\(/);

  const solo = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(solo, /saveProgram\(/);
  assert.doesNotMatch(solo, /updateProgram\(/);
  assert.doesNotMatch(solo, /syncProgramDays\(/);

  const list = src('src/components/programs/ProgramsPage.tsx');
  assert.match(list, /programs\.assignRecap/);
  assert.match(list, /errors\.loadPrograms/);
  assert.match(list, /deleteProgram\(p\.id\)/);
  assert.match(list, /programDeleteToast/);
  assert.match(list, /deleteHasHistory/);

  assert.match(src('src/i18n/locales/fr.ts'), /assignRecap:/);
  assert.match(src('src/i18n/locales/en.ts'), /assignRecap:/);
  assert.match(src('src/i18n/locales/fr.ts'), /deleteHasHistory:/);
  assert.match(src('src/i18n/locales/en.ts'), /deleteHasHistory:/);
  assert.match(src('.github/workflows/ci.yml'), /save_program\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /save_program_coached\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /program_session_organization\.sql/);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260915133000"/);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260918102103"/);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260918103748"/);
  assert.doesNotMatch(src('supabase/migrations.pending.json'), /20260918102103|20260918103748/);
});
