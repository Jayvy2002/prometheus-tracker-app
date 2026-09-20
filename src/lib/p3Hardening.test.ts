import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('P3 hardening reuses the same engine and closes the transversal gaps', () => {
  const found = latestMigrationContaining('phase_anchor_on date');
  assert.equal(found.file, '20260920014500_p3_hardening.sql');
  assert.match(found.sql, /program_days_program_phase_weekday_unique/);
  assert.match(found.sql, /program_days_phase_id_fkey[\s\S]*ON DELETE CASCADE/);
  assert.match(found.sql, /program_civil_date/);
  assert.match(found.sql, /validate_program_graph_payload/);
  assert.match(found.sql, /program_day_not_current_phase/);
  assert.match(found.sql, /FROM public\.program_day_exercises e/);
  assert.match(found.sql, /name = COALESCE\(v_name, name\)/);
  assert.match(found.sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.programs FROM authenticated/);
  assert.match(found.sql, /DROP POLICY IF EXISTS "Owners delete programs"/);
  assert.match(found.sql, /CREATE OR REPLACE FUNCTION public\.delete_program/);
  assert.match(found.sql, /scheduled_activation_timezone/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.program_actor_timezone\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.program_activation_timezone\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.program_current_phase_id\(uuid, date, date\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /start_workout_from_template\([\s\S]*SECURITY DEFINER/);
  assert.match(found.sql, /cancel_scheduled_program_version/);
  assert.match(found.sql, /program_activation_timezone/);
  assert.match(src('supabase/tests/program_versions.sql'), /scheduled_activation_timezone/);
  assert.match(src('src/stores/programStore.ts'), /rpc\('delete_program'/);
  assert.doesNotMatch(found.sql, /CREATE TABLE public\.(mesocycles|program_versioning|program_cycles)/);
  assert.doesNotMatch(found.sql, /CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.doesNotMatch(found.sql, /CREATE OR REPLACE FUNCTION public\.transition_client_to_solo/);

  assert.match(src('src/lib/clientGym.ts'), /daysForCurrentPhase/);
  assert.match(src('src/lib/clientGym.ts'), /phaseAnchorDate\(/);
  assert.match(src('src/stores/programStore.ts'), /activated_at, superseded_at/);
  assert.match(src('src/components/programs/ProgramRevisionHistory.tsx'), /program-revision-state/);
  assert.match(src('src/i18n/locales/fr/programs.ts'), /versionStateHistorical/);
  assert.match(src('src/i18n/locales/en/programs.ts'), /versionStateHistorical/);
  assert.match(src('src/i18n/locales/fr/programs.ts'), /deleteHasHistory/);
  assert.match(src('src/i18n/locales/en/programs.ts'), /deleteHasHistory/);
  assert.match(src('.github/workflows/ci.yml'), /program_hardening\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /helper ACL, delete, frozen tz/);
  assert.match(src('supabase/tests/program_hardening.sql'), /\\echo 'program hardening:/);
  assert.match(src('supabase/tests/program_hardening.sql'), /internal P3 helper exposed to authenticated/);
  assert.match(src('supabase/migrations.pending.json'), /20260920014500/);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260920014500/);
  assert.match(src('docs/CHANTIER.md'), /P3 hardening/);
});
