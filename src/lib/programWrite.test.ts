import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';
import {
  PROGRAM_STALE,
  assignStartLabel,
  isProgramStaleError,
  mapProgramWriteError,
} from './programWrite';

function src(rel: string): string {
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
});

test('assign recap date stays on the local calendar day', () => {
  assert.equal(assignStartLabel('not-a-date', 'fr-FR'), 'not-a-date');
  const label = assignStartLabel('2026-09-15', 'en-GB');
  assert.match(label, /15/);
  assert.match(label, /9|09|Sep/i);
});

test('latest save_program wraps metadata + sync_program_days and refuses stale', () => {
  const found = latestMigrationContaining(/CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.equal(found.file, '20260915133000_save_program.sql');
  assert.match(found.sql, /SECURITY DEFINER/);
  assert.match(found.sql, /SET search_path = public/);
  assert.match(found.sql, /RAISE EXCEPTION 'stale'/);
  assert.match(found.sql, /v_days := public\.sync_program_days\(p_program_id, p_days\)/);
  assert.match(found.sql, /GRANT EXECUTE ON FUNCTION public\.save_program\(uuid, text, text, int, jsonb, timestamptz\) TO authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.save_program\(uuid, text, text, int, jsonb, timestamptz\) FROM PUBLIC, anon/);
});

test('editor and solo save go through saveProgram; delete waits for the server', () => {
  const store = src('src/stores/programStore.ts');
  assert.match(store, /rpc\('save_program'/);
  assert.match(store, /p_expected_updated_at/);
  const deleteFn = store.slice(store.indexOf('deleteProgram: async'));
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

  assert.match(src('src/i18n/locales/fr.ts'), /assignRecap:/);
  assert.match(src('src/i18n/locales/en.ts'), /assignRecap:/);
  assert.match(src('.github/workflows/ci.yml'), /save_program\.sql/);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260915133000"/);
});
