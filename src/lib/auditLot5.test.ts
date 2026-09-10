import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('C01: observation tables are realtime-published; the 360 reloads on change', () => {
  const mig = src('supabase/migrations/20260910000005_audit_continuity.sql');
  assert.match(mig, /REPLICA IDENTITY FULL/);
  assert.match(mig, /supabase_realtime.*ADD TABLE/);
  assert.match(mig, /daily_checkins/);
  assert.match(mig, /weight_measurements/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /subscribeClientDossier/);
  assert.match(store, /dossierChannels/);
  const page = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(page, /subscribeClientDossier\(id/);
  assert.match(page, /dossierFetchedAt/);
  assert.match(page, /client360\.updatedAt/);
  assert.match(page, /client360\.loadError/);
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /visibilitychange/);
});

test('C03: coach deletion runs the business transition first, then paginated cleanup', () => {
  const mig = src('supabase/migrations/20260910000005_audit_continuity.sql');
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.transition_client_to_solo/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.close_coach_account/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.close_coach_account\(uuid\) TO service_role/);
  const edge = src('supabase/functions/delete-account/index.ts');
  assert.match(edge, /close_coach_account/);
  assert.match(edge, /auth\.admin\.deleteUser/);
  assert.ok(
    edge.indexOf('close_coach_account') < edge.indexOf('auth.admin.deleteUser'),
    'transition must run before Auth deletion',
  );
  assert.match(edge, /offset \+= LIST_PAGE/);
});

test('C04: assignment history follows the athlete; adoption is explicit', () => {
  const mig = src('supabase/migrations/20260910000005_audit_continuity.sql');
  assert.match(mig, /Coaches read client assignment history/);
  assert.match(mig, /Coaches read assigned programs/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.adopt_client_program/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /fetchClientAssignments/);
  assert.match(store, /adoptClientProgram/);
  const page = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(page, /client360\.historyTitle/);
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
  assert.doesNotMatch(edge, /\.\.\/_shared\/clock/);
  const cron = src('supabase/cron/schedule_daily_reminders.sql');
  assert.match(cron, /invoke_send_daily_reminders/);
  assert.match(cron, /REMINDERS_CRON_SECRET/);
  assert.doesNotMatch(cron, /SERVICE_ROLE_KEY/);
  const mig = src('supabase/migrations/20260910000006_audit_reminders_invoke.sql');
  assert.match(mig, /invoke_send_daily_reminders/);
  assert.match(mig, /vault\.decrypted_secrets/);
});
