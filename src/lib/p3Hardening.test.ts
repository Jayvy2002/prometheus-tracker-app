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
  assert.match(found.sql, /workouts_program_day_id_fkey[\s\S]*ON DELETE SET NULL[\s\S]*DEFERRABLE INITIALLY IMMEDIATE/);
  assert.match(found.sql, /workouts_program_phase_id_fkey[\s\S]*ON DELETE SET NULL[\s\S]*DEFERRABLE INITIALLY IMMEDIATE/);
  assert.match(found.sql, /program_civil_date/);
  assert.match(found.sql, /validate_program_graph_payload/);
  assert.match(found.sql, /program_day_not_current_phase/);
  assert.match(found.sql, /FROM public\.program_day_exercises e/);
  assert.match(found.sql, /name = COALESCE\(v_name, name\)/);
  assert.match(found.sql, /REVOKE ALL ON TABLE public\.programs FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /GRANT SELECT ON TABLE public\.programs TO authenticated/);
  assert.match(found.sql, /REVOKE ALL ON TABLE public\.program_assignments FROM PUBLIC, anon, authenticated/);
  assert.match(found.sql, /GRANT SELECT ON TABLE public\.program_assignments TO authenticated/);
  assert.match(found.sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.workouts TO authenticated/);
  assert.match(found.sql, /frozen_revision_no/);
  assert.match(found.sql, /version_start_on/);
  assert.match(found.sql, /prescription_source/);
  assert.match(found.sql, /mixed phase durations/);
  assert.match(found.sql, /program_effective_version_start/);
  assert.match(found.sql, /program_assignments_protect_identity/);
  {
    const freezeStart = found.sql.indexOf('CREATE OR REPLACE FUNCTION public.program_assignments_freeze_on_pause');
    const freezeEnd = found.sql.indexOf('REVOKE ALL ON FUNCTION public.program_assignments_freeze_on_pause');
    const freezeFn = found.sql.slice(freezeStart, freezeEnd);
    assert.match(freezeFn, /FROM public\.programs p\s+WHERE p\.id = NEW\.program_id\s+FOR UPDATE/);
  }
  assert.match(found.sql, /CREATE OR REPLACE FUNCTION public\.get_frozen_program_archive/);
  assert.match(found.sql, /RAISE EXCEPTION 'program_not_started'/);
  assert.match(found.sql, /RAISE EXCEPTION 'activation_date_in_past'/);
  assert.match(found.sql, /GRANT EXECUTE ON FUNCTION public\.get_frozen_program_archive\(uuid\) TO authenticated/);
  assert.match(found.sql, /Assigned clients read programs[\s\S]{0,280}pa\.status = 'active'/);
  assert.doesNotMatch(
    found.sql.slice(found.sql.lastIndexOf('DROP POLICY IF EXISTS "Assigned clients read programs"')),
    /Assigned clients read programs[\s\S]{0,280}status IN \('active','paused'\)/,
  );
  {
    const coachLive = found.sql.slice(found.sql.lastIndexOf('DROP POLICY IF EXISTS "Coaches read assigned programs"'));
    const programsPol = coachLive.slice(
      coachLive.indexOf('CREATE POLICY "Coaches read assigned programs"'),
      coachLive.indexOf('DROP POLICY IF EXISTS "Coaches read assigned program days"'),
    );
    const daysPol = coachLive.slice(
      coachLive.indexOf('CREATE POLICY "Coaches read assigned program days"'),
      coachLive.indexOf('DROP POLICY IF EXISTS "Coaches read assigned program day exercises"'),
    );
    const exPol = coachLive.slice(
      coachLive.indexOf('CREATE POLICY "Coaches read assigned program day exercises"'),
      coachLive.indexOf('DROP POLICY IF EXISTS "Coaches read assigned program phases"'),
    );
    const phasesPol = coachLive.slice(
      coachLive.indexOf('CREATE POLICY "Coaches read assigned program phases"'),
      coachLive.indexOf('DROP POLICY IF EXISTS "Coaches read client program revisions"'),
    );
    for (const [name, pol] of [
      ['programs', programsPol],
      ['days', daysPol],
      ['exercises', exPol],
      ['phases', phasesPol],
    ] as const) {
      assert.match(pol, /is_coach_of\(pa\.client_id\)/, `${name} coach policy missing is_coach_of`);
      assert.match(pol, /pa\.status = 'active'/, `${name} coach policy missing active assignment`);
      assert.doesNotMatch(pol, /status IN \('active',\s*'paused'\)/, `${name} coach policy still allows paused`);
    }
  }
  {
    const readStart = found.sql.indexOf('CREATE OR REPLACE FUNCTION public.actor_can_read_program');
    const readEnd = found.sql.indexOf('REVOKE ALL ON FUNCTION public.actor_can_read_program');
    const readFn = found.sql.slice(readStart, readEnd);
    assert.match(readFn, /is_coach_of\(pa\.client_id\)\s+AND pa\.status = 'active'/);
  }
  {
    const archStart = found.sql.indexOf('CREATE OR REPLACE FUNCTION public.get_frozen_program_archive');
    const archEnd = found.sql.indexOf('REVOKE ALL ON FUNCTION public.get_frozen_program_archive');
    const archFn = found.sql.slice(archStart, archEnd);
    assert.match(archFn, /is_coach_of\(v_asg\.client_id\)/);
  }
  {
    const revStart = found.sql.lastIndexOf('DROP POLICY IF EXISTS "Coaches read client program revisions"');
    const revPol = found.sql.slice(revStart, found.sql.indexOf('CREATE OR REPLACE FUNCTION public.get_frozen_program_archive', revStart));
    assert.match(revPol, /pa\.status = 'active'/);
    assert.match(revPol, /frozen_revision_no/);
    assert.match(revPol, /scheduled_revision_no/);
    assert.match(revPol, /program_revisions\.created_at <= pa\.updated_at/);
  }
  {
    const adoptStart = found.sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.adopt_client_assignment');
    const adoptEnd = found.sql.indexOf('REVOKE ALL ON FUNCTION public.adopt_client_assignment', adoptStart);
    const adoptFn = found.sql.slice(adoptStart, adoptEnd);
    assert.match(adoptFn, /p_assignment_id uuid/);
    assert.match(adoptFn, /frozen_revision_no/);
    assert.match(adoptFn, /apply_program_revision_snapshot\(v_fork_id, 1, 'now'\)/);
    assert.match(adoptFn, /FROM public\.programs p\s+WHERE p\.id = v_program_id\s+FOR UPDATE/);
    assert.match(adoptFn, /FROM public\.program_assignments pa\s+WHERE pa\.id = p_assignment_id\s+FOR UPDATE/);
    assert.match(adoptFn, /FROM public\.coach_client_links l[\s\S]*FOR SHARE/);
    const lockProgram = adoptFn.search(/FROM public\.programs p\s+WHERE p\.id = v_program_id\s+FOR UPDATE/);
    const lockAsg = adoptFn.search(/FROM public\.program_assignments pa\s+WHERE pa\.id = p_assignment_id\s+FOR UPDATE/);
    const lockLink = adoptFn.search(/FROM public\.coach_client_links l[\s\S]*FOR SHARE/);
    const reval = adoptFn.lastIndexOf('is_coach_of');
    assert.ok(
      lockProgram >= 0 && lockAsg > lockProgram && lockLink > lockAsg && reval > lockLink,
      'adopt must lock program, then assignment, then link FOR SHARE, then revalidate is_coach_of',
    );
    assert.doesNotMatch(adoptFn, /CASE WHEN pa\.status = 'active' THEN 0 ELSE 1 END/);
    assert.doesNotMatch(adoptFn, /pa\.updated_at DESC/);
    assert.doesNotMatch(adoptFn, /ORDER BY/);
    assert.doesNotMatch(adoptFn, /FROM public\.program_days/);
    assert.doesNotMatch(adoptFn, /FROM public\.program_phases/);
    assert.doesNotMatch(adoptFn, /FROM public\.program_day_exercises/);
  }
  assert.match(found.sql, /DROP FUNCTION IF EXISTS public\.adopt_client_program\(uuid, uuid, text\)/);
  assert.match(found.sql, /GRANT EXECUTE ON FUNCTION public\.adopt_client_assignment\(uuid, text\) TO authenticated/);
  assert.doesNotMatch(found.sql, /CREATE OR REPLACE FUNCTION public\.adopt_client_program/);
  assert.match(src('src/features/coaching/model/clientsSlice.ts'), /rpc\('adopt_client_assignment'/);
  assert.match(src('src/features/coaching/model/clientsSlice.ts'), /p_assignment_id: assignmentId/);
  assert.doesNotMatch(src('src/features/coaching/model/clientsSlice.ts'), /adoptClientProgram/);
  assert.match(src('src/components/coaching/ClientDetailPage.tsx'), /adoptingId === a\.id/);
  assert.match(src('src/components/coaching/ClientDetailPage.tsx'), /adoptClientAssignment\(a\.id\)/);
  assert.match(src('src/components/coaching/ClientDetailPage.tsx'), /setAdoptingId\(a\.id\)/);
  assert.doesNotMatch(src('src/components/coaching/ClientDetailPage.tsx'), /adoptClientProgram/);
  assert.doesNotMatch(src('src/components/coaching/ClientDetailPage.tsx'), /setAdoptingId\(a\.program_id\)/);
  assert.match(src('src/features/coaching/model/clientsSlice.ts'), /rpc\('get_frozen_program_archive'/);
  {
    const endStart = found.sql.indexOf('CREATE OR REPLACE FUNCTION public.client_end_coach_link()');
    const endFn = found.sql.slice(endStart, endStart + 1800);
    assert.match(endFn, /FOR UPDATE/);
  }
  assert.match(src('src/stores/programStore.ts'), /rpc\('get_frozen_program_archive'/);
  assert.match(src('src/lib/clientGym.ts'), /todayDate < startedOn/);
  assert.match(src('src/features/programs/domain/programVersions.ts'), /date < assignmentStart/);
  assert.match(src('src/components/programs/ProgramEditorPage.tsx'), /min=\{programClock\.today\}/);
  assert.match(src('src/i18n/locales/fr/programs.ts'), /activationDateInPast/);
  assert.match(src('src/i18n/locales/en/programs.ts'), /activationDateInPast/);
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
  assert.match(src('supabase/tests/program_versions.sql'), /Data API INSERT is closed; fixtures run as postgres/);
  assert.match(src('supabase/tests/program_versions.sql'), /activation rewrote paused archive frozen_revision_no/);
  assert.doesNotMatch(src('supabase/tests/program_versions.sql'), /former coach activation was allowed/);
  assert.match(src('src/stores/programStore.ts'), /rpc\('delete_program'/);
  assert.doesNotMatch(found.sql, /CREATE TABLE public\.(mesocycles|program_versioning|program_cycles)/);
  assert.doesNotMatch(found.sql, /CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.doesNotMatch(found.sql, /CREATE OR REPLACE FUNCTION public\.transition_client_to_solo/);

  assert.match(src('src/features/programs/hooks/useProgramCivilClock.ts'), /civilDateInTimeZone/);
  assert.match(src('src/components/dashboard/Dashboard.tsx'), /useProgramCivilClock/);
  assert.match(src('src/components/calendar/CalendarPage.tsx'), /useProgramCivilClock/);
  assert.match(src('src/components/programs/ClientProgramPage.tsx'), /effectiveVersionStart/);
  assert.match(src('src/lib/clientGym.ts'), /phaseAnchorDate\(/);
  assert.match(src('src/stores/programStore.ts'), /activated_at, superseded_at, version_start_on/);
  assert.match(src('src/stores/programStore.ts'), /programFromFrozenRevision/);
  assert.match(src('src/stores/programStore.ts'), /hydrateAssignmentProgram/);
  assert.doesNotMatch(src('src/stores/programStore.ts'), /pauseAssignment/);
  assert.match(src('src/lib/utils.ts'), /civilDateOrdinal/);
  assert.match(src('src/features/programs/domain/programPhases.ts'), /PROGRAM_EXERCISE_MAX_SETS = 20/);
  assert.match(src('src/features/programs/domain/programPhases.ts'), /laterCivilDate/);
  assert.match(src('src/stores/workoutStore.ts'), /prescription_source: 'user'/);
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
  assert.match(src('supabase/tests/program_hardening.sql'), /v_today := \(now\(\) AT TIME ZONE 'UTC'\)::date/);
  assert.match(src('supabase/tests/program_hardening.sql'), /future schedule mutated live anchor/);
  assert.match(src('supabase/tests/program_hardening.sql'), /today schedule did not apply immediately/);
  assert.match(src('supabase/tests/program_hardening.sql'), /past activation date was allowed/);
  assert.match(src('supabase/tests/program_hardening.sql'), /Toronto-past activation date was allowed/);
  assert.match(src('supabase/tests/program_hardening.sql'), /unexpected authenticated program DEFINER/);
  assert.match(src('supabase/tests/program_hardening.sql'), /actor_owns_program\(uuid\)/);
  assert.match(src('supabase/tests/program_hardening.sql'), /legitimate start left program_id unset/);
  assert.match(src('supabase/tests/program_hardening.sql'), /off-plan workout carried program provenance/);
  assert.match(src('supabase/tests/program_hardening.sql'), /workout provenance FKs are not DEFERRABLE INITIALLY IMMEDIATE/);
  assert.match(src('supabase/tests/program_hardening.sql'), /active assignment without active_revision_no after backfill/);
  assert.match(src('supabase/tests/program_hardening.sql'), /Replay the candidate backfill/);
  assert.match(src('supabase/tests/program_hardening.sql'), /00000000009c/);
  assert.doesNotMatch(src('supabase/tests/program_hardening.sql'), /00009w/);
  assert.match(src('supabase/tests/program_hardening.sql'), /Self-assign on 000002/);
  assert.match(src('supabase/tests/program_hardening.sql'), /authenticated still has % on %/);
  assert.match(src('supabase/tests/program_hardening.sql'), /assignment start_date Data API update was allowed/);
  assert.match(src('supabase/tests/program_hardening.sql'), /direct fake prescription_source=program was allowed/);
  assert.match(src('supabase/tests/program_hardening.sql'), /21 sets save was allowed/);
  assert.match(src('supabase/tests/program_hardening.sql'), /mixed phase durations were allowed/);
  assert.match(src('supabase/tests/program_hardening.sql'), /late assignment should be week 1/);
  assert.match(src('supabase/tests/program_hardening.sql'), /get_frozen_program_archive/);
  assert.match(src('supabase/tests/program_hardening.sql'), /ambiguous adopt_client_program\(uuid,uuid,text\) still exists/);
  assert.match(src('supabase/tests/program_hardening.sql'), /adopt_client_assignment/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /fn_exec\('adopt_client_assignment'\)/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /NOT pg_temp\.fn_exec\('adopt_client_program'\)/);
  assert.match(src('supabase/tests/program_hardening.sql'), /program_not_started/);
  assert.match(src('supabase/tests/program_hardening.sql'), /activation_date_in_past/);
  assert.match(src('supabase/tests/program_hardening.sql'), /active client SELECT unscheduled saved revision/);
  assert.match(src('supabase/tests/program_hardening.sql'), /freeze trigger does not lock programs FOR UPDATE/);
  assert.match(src('supabase/tests/program_hardening.sql'), /program hardening: live graph active-only, revision drafts, not-started, past schedule, freeze FOR UPDATE, archive RPC/);
  assert.match(src('supabase/tests/program_shared_archive.sql'), /shared program archive: A leaves, B continues, frozen snapshot/);
  assert.match(src('supabase/tests/program_shared_archive.sql'), /paused A still reads live programs/);
  assert.match(src('supabase/tests/program_shared_archive.sql'), /set local role authenticated/);
  assert.match(src('supabase/tests/program_shared_archive.sql'), /shared program archive: paused A cannot read live graph or drafts/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /coach switch archive: B cannot read paused live or drafts; adopt copies frozen A/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /coach switch archive: adopt paused copies Push A not live Push B/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /coach switch archive: adopt exact assignment active\+paused copies own revision/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /coach switch archive: adopt exact assignment two paused copies own frozen revision/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /coach switch archive: adopt refuses other coach, former coach, missing, unfrozen/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /coach B still reads paused live programs/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /adopt_client_assignment copied live\/draft graph/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /cas 1 adopt paused copied active revision 2/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /cas 2 adopt older paused followed updated_at DESC/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /former coach adopt was allowed/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /other coach adopt was allowed/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /missing assignment adopt was allowed/);
  assert.match(src('supabase/tests/program_coach_switch.sql'), /paused adopt without frozen_revision_no was allowed/);
  assert.match(src('.github/workflows/ci.yml'), /program_coach_switch\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /adopt paused copies Push A not live Push B/);
  assert.match(src('.github/workflows/ci.yml'), /adopt exact assignment active\+paused copies own revision/);
  assert.match(src('.github/workflows/ci.yml'), /adopt exact assignment two paused copies own frozen revision/);
  assert.match(src('.github/workflows/ci.yml'), /adopt refuses other coach, former coach, missing, unfrozen/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /paused live graph hidden; assignment still readable/);
  assert.match(src('supabase/tests/client_departure.sql'), /paused client still reads live program/);
  assert.match(src('.github/workflows/ci.yml'), /program_shared_archive\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /test-program-freeze-lock\.sh/);
  assert.match(src('scripts/test-program-freeze-lock.sh'), /pg_advisory_xact_lock/);
  assert.match(src('scripts/test-program-freeze-lock.sh'), /activate_program_version/);
  assert.match(src('scripts/test-program-freeze-lock.sh'), /client_end_coach_link/);
  assert.match(src('scripts/test-program-freeze-lock.sh'), /Cas A departure did not wait on in-flight activation/);
  assert.match(src('scripts/test-program-freeze-lock.sh'), /Cas B activation did not wait on in-flight departure/);
  assert.match(src('scripts/test-program-freeze-lock.sh'), /save_program serializes/);
  assert.match(src('.github/workflows/ci.yml'), /program hardening: provenance immutability/);
  assert.match(src('.github/workflows/ci.yml'), /program hardening: allowlist ACL/);
  assert.match(src('.github/workflows/ci.yml'), /live graph active-only/);
  assert.match(src('.github/workflows/ci.yml'), /test-program-freeze-lock\.sh/);
  assert.match(src('supabase/migrations.pending.json'), /20260920014500/);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260920014500/);
  assert.match(src('docs/CHANTIER.md'), /P3 hardening/);
});
