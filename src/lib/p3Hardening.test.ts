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
  {
    const delStart = found.sql.indexOf('CREATE OR REPLACE FUNCTION public.delete_program');
    const delEnd = found.sql.indexOf('REVOKE ALL ON FUNCTION public.delete_program');
    const delFn = found.sql.slice(delStart, delEnd);
    const lockAt = delFn.search(/FROM public\.programs\s+WHERE id = p_program_id\s+FOR UPDATE/);
    const leftoverAt = delFn.indexOf('coached_client_cannot_edit_program');
    const activeAt = delFn.indexOf("RAISE EXCEPTION 'program_has_active_assignment'");
    const histAt = delFn.indexOf('program_has_history(p_program_id)');
    const deleteAt = delFn.indexOf('DELETE FROM public.programs');
    assert.ok(
      lockAt >= 0 && leftoverAt > lockAt && activeAt > leftoverAt && histAt > activeAt && deleteAt > histAt,
      'delete_program must FOR UPDATE the program row before leftover/active/history checks',
    );
  }
  assert.match(found.sql, /scheduled_activation_timezone/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.program_actor_timezone\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.program_activation_timezone\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.snapshot_program_revision\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.sync_program_phases\(uuid, jsonb\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.create_program_with_days/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.save_program_day_exercises/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.sync_program_days\(uuid, jsonb\) FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.sync_program_phases\(uuid, jsonb, boolean\)/);
  assert.match(found.sql, /validate_program_graph_payload\(v_org, p_days, v_phases\)/);
  assert.doesNotMatch(found.sql, /validate_program_graph_payload\(v_org, p_days, NULL\)/);
  assert.match(found.sql, /workouts_protect_program_provenance/);
  assert.match(found.sql, /workout_exercises_protect_prescribed/);
  assert.match(found.sql, /p_anchor_mode text/);
  assert.match(found.sql, /phase duration required/);
  assert.match(found.sql, /GRANT SELECT ON TABLE public\.program_revisions TO authenticated/);
  assert.match(found.sql, /ADD COLUMN IF NOT EXISTS program_id uuid/);
  assert.match(found.sql, /active assignment without active_revision_no after backfill/);
  assert.match(found.sql, /start_workout_from_template\([\s\S]*SECURITY DEFINER/);
  assert.match(found.sql, /cancel_scheduled_program_version/);
  assert.match(found.sql, /program_activation_timezone/);
  assert.match(src('supabase/tests/program_versions.sql'), /scheduled_activation_timezone/);
  assert.match(src('src/stores/programStore.ts'), /rpc\('delete_program'/);
  assert.doesNotMatch(found.sql, /CREATE TABLE public\.(mesocycles|program_versioning|program_cycles)/);
  assert.doesNotMatch(found.sql, /CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.doesNotMatch(found.sql, /CREATE OR REPLACE FUNCTION public\.transition_client_to_solo/);

  assert.match(src('src/features/programs/hooks/useProgramCivilClock.ts'), /civilDateInTimeZone/);
  assert.match(src('src/components/dashboard/Dashboard.tsx'), /useProgramCivilClock/);
  assert.match(src('src/components/programs/ClientProgramPage.tsx'), /effectiveVersionStart/);
  assert.match(src('src/lib/clientGym.ts'), /phaseAnchorDate\(/);
  assert.match(src('src/stores/programStore.ts'), /activated_at, superseded_at/);
  assert.match(src('src/components/programs/ProgramRevisionHistory.tsx'), /program-revision-state/);
  assert.match(src('src/i18n/locales/fr/programs.ts'), /versionStateHistorical/);
  assert.match(src('src/i18n/locales/en/programs.ts'), /versionStateHistorical/);
  assert.match(src('src/i18n/locales/fr/programs.ts'), /deleteHasHistory/);
  assert.match(src('src/i18n/locales/en/programs.ts'), /deleteHasHistory/);
  assert.match(src('.github/workflows/ci.yml'), /program_hardening\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /helper ACL, delete, frozen tz/);
  assert.match(src('.github/workflows/ci.yml'), /delete_program locks program row FOR UPDATE before checks/);
  assert.match(src('.github/workflows/ci.yml'), /test-delete-program-lock\.sh/);
  assert.match(src('scripts/test-delete-program-lock.sh'), /pg_advisory_xact_lock/);
  assert.match(src('scripts/test-delete-program-lock.sh'), /assign_program_secure/);
  assert.match(src('scripts/test-delete-program-lock.sh'), /delete_program did not wait on in-flight assignment/);
  assert.match(src('scripts/test-delete-program-lock.sh'), /in-flight assign cannot sneak past FOR UPDATE/);
  assert.match(src('supabase/tests/program_hardening.sql'), /\\echo 'program hardening:/);
  assert.match(src('supabase/tests/program_hardening.sql'), /delete_program locks program row FOR UPDATE before checks/);
  assert.match(src('supabase/tests/program_hardening.sql'), /internal P3 helper exposed to authenticated/);
  assert.match(src('supabase/tests/program_hardening.sql'), /delete_program does not lock the program row before deletion checks/);
  assert.match(src('supabase/tests/program_hardening.sql'), /from public\.programs where id = p_program_id for update/);
  assert.match(src('supabase/tests/program_hardening.sql'), /leftover refuse mutated assignments/);
  assert.match(src('supabase/tests/program_hardening.sql'), /active refuse mutated assignments/);
  assert.match(src('supabase/tests/program_hardening.sql'), /refused assignment-history delete dropped assignments/);
  assert.match(src('supabase/tests/program_hardening.sql'), /program provenance is RPC-only/);
  assert.match(src('supabase/tests/program_hardening.sql'), /workout prescription is immutable/);
  assert.match(src('supabase/tests/program_hardening.sql'), /activate now anchored/);
  assert.match(src('supabase/tests/program_hardening.sql'), /scheduled\/due anchored/);
  assert.match(src('supabase/tests/program_hardening.sql'), /unexpected authenticated program DEFINER/);
  assert.match(src('supabase/tests/program_hardening.sql'), /actor_owns_program\(uuid\)/);
  assert.match(src('supabase/tests/program_hardening.sql'), /legitimate start left program_id unset/);
  assert.match(src('supabase/tests/program_hardening.sql'), /off-plan workout carried program provenance/);
  assert.match(src('supabase/tests/program_hardening.sql'), /active assignment without active_revision_no after backfill/);
  assert.match(src('.github/workflows/ci.yml'), /program hardening: provenance immutability/);
  assert.match(src('supabase/migrations.pending.json'), /20260920014500/);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260920014500/);
  assert.match(src('docs/CHANTIER.md'), /P3 hardening/);
});
