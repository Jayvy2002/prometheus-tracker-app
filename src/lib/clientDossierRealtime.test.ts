import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { latestMigrationContaining, migrationsSql } from './migrationScan';
import { coachingStoreSource } from './coachingStoreSource';

const src = (p: string) => p === 'src/stores/coachingStore.ts' ? coachingStoreSource() : readFileSync(resolve(process.cwd(), p), 'utf8');

test('C01: observation tables are realtime-published; the 360 reloads on change', () => {
  const mig = migrationsSql();
  assert.match(mig, /REPLICA IDENTITY FULL/);
  assert.match(mig, /supabase_realtime.*ADD TABLE/);
  assert.match(mig, /daily_checkins/);
  assert.match(mig, /weight_measurements/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /subscribeClientDossier/);
  assert.match(store, /dossierChannels/);
  const page = src('src/components/coaching/ClientDetailPage.tsx') + src('src/features/coaching/hooks/useClientDossier.ts');
  assert.match(page, /subscribeClientDossier\(id/);
  assert.match(page, /dossierFetchedAt/);
  assert.match(page, /client360\.updatedAt/);
  assert.match(page, /client360\.loadError/);
  assert.match(page, /client360\.firstRunTitle/);
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /visibilitychange/);
});

test('C03: coach deletion runs the business transition first, then paginated cleanup', () => {
  const mig = migrationsSql();
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.transition_client_to_solo/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.close_coach_account/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.close_coach_account\(uuid\) TO service_role/);
  const close = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.close_coach_account(p_coach_id uuid)');
  assert.equal(close.file, '20260920014500_p3_hardening.sql');
  assert.match(close.sql, /remap_program_revision_snapshot/);
  assert.match(close.sql, /apply_program_revision_snapshot/);
  assert.match(close.sql, /lock_coach_relationship_lifecycle/);
  assert.match(close.sql, /lock_client_assignment_mutex/);
  assert.match(close.sql, /lock_programs_for_assignment_mutation/);
  assert.match(close.sql, /frozen_revision_no = v_rev/);
  const edge = src('supabase/functions/delete-account/index.ts');
  const cleanup = src('supabase/functions/delete-account/storageCleanup.ts');
  assert.match(edge, /close_coach_account/);
  assert.match(edge, /auth\.admin\.deleteUser/);
  assert.match(edge, /deleteAuthUserAfterStorageCleanup/);
  assert.match(edge, /storage_cleanup_failed/);
  assert.ok(
    edge.lastIndexOf('close_coach_account') < edge.lastIndexOf('deleteAuthUserAfterStorageCleanup'),
    'transition must run before Storage cleanup / Auth deletion',
  );
  assert.match(cleanup, /offset \+= /);
  assert.match(cleanup, /qualification-proofs/);
  assert.match(cleanup, /listOwnedStoragePaths/);
  assert.match(cleanup, /StorageCleanupError/);
  assert.doesNotMatch(edge, /best effort/);
  assert.match(edge, /P3 snapshot/);
});

test('C04: assignment history follows the athlete; adoption is exact assignment_id', () => {
  const mig = migrationsSql();
  assert.match(mig, /Coaches read client assignment history/);
  assert.match(mig, /Coaches read assigned programs/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.adopt_client_assignment/);
  assert.match(mig, /DROP FUNCTION IF EXISTS public\.adopt_client_program\(uuid, uuid, text\)/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /fetchClientAssignments/);
  assert.match(store, /adoptClientAssignment/);
  assert.doesNotMatch(store, /adoptClientProgram/);
  const page = src('src/components/coaching/ClientDetailPage.tsx') + src('src/features/coaching/hooks/useClientDossier.ts');
  assert.match(page, /client360\.historyTitle/);
  assert.match(page, /adoptClientAssignment\(a\.id\)/);
  assert.match(page, /adoptingId === a\.id/);
  assert.doesNotMatch(page, /adoptClientProgram/);
  assert.doesNotMatch(page, /setAdoptingId\(a\.program_id\)/);
  const athlete = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(athlete, /fetchPausedAssignments/);
  assert.match(athlete, /programs\.archivesTitle/);
});

test('Q01: notification status is real; reminders respect tracking and language', () => {
  const screen = src('src/components/profile/NotificationSettings.tsx');
  assert.match(screen, /subscribeToPush\(user\.id\)/);
  assert.match(screen, /setSubscribed\(ok\)/);
  assert.match(screen, /syncNotificationSettingsToDB\(user\.id, updated\)\.then/);
  assert.match(screen, /role="switch"/);
  const edge = src('supabase/functions/send-daily-reminders/index.ts');
  assert.match(edge, /track_workouts/);
  assert.match(edge, /startsWith\(['"]fr['"]\)/);
  assert.match(edge, /shouldSendDailyReminder/);
  assert.match(edge, /program_assignments/);
  assert.doesNotMatch(edge, /\.\.\/_shared\/clock/);
  const cron = src('supabase/cron/schedule_daily_reminders.sql');
  assert.match(cron, /invoke_send_daily_reminders/);
  assert.match(cron, /REMINDERS_CRON_SECRET/);
  assert.doesNotMatch(cron, /SERVICE_ROLE_KEY/);
  const mig = latestMigrationContaining('invoke_send_daily_reminders').sql;
  assert.match(mig, /invoke_send_daily_reminders/);
  assert.match(mig, /vault\.decrypted_secrets/);
});
