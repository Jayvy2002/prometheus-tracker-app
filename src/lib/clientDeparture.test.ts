import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';
import { coachingStoreSource } from './coachingStoreSource';

function src(rel: string): string {
  if (rel === 'src/stores/coachingStore.ts') return coachingStoreSource();
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('client_end_coach_link uses the shared transition, locks the link, and stays private', () => {
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.client_end_coach_link');
  assert.equal(latest.file, '20260920014500_p3_hardening.sql');
  const start = latest.sql.indexOf('CREATE OR REPLACE FUNCTION public.client_end_coach_link()');
  const fn = latest.sql.slice(start, start + 2200);
  assert.match(fn, /CREATE OR REPLACE FUNCTION public\.client_end_coach_link\(\)/);
  assert.match(fn, /transition_client_to_solo\(v_coach_id, v_uid\)/);
  assert.match(fn, /lock_client_assignment_programs\(v_uid, NULL\)/);
  assert.match(latest.sql, /REVOKE ALL ON FUNCTION public\.client_end_coach_link\(\) FROM PUBLIC, anon/);
  assert.match(latest.sql, /GRANT EXECUTE ON FUNCTION public\.client_end_coach_link\(\) TO authenticated/);
  assert.doesNotMatch(fn, /CREATE OR REPLACE FUNCTION public\.transition_client_to_solo/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(latest.sql, /subscription/);

  const origin = src('supabase/migrations/20260913184325_client_end_coach_link.sql')
    + src('supabase/migrations/20260918182954_commercial_durations.sql');
  assert.match(origin, /auth\.uid\(\) = p_client_id/);
  assert.match(origin, /REVOKE ALL ON FUNCTION public\.transition_client_to_solo/);
  assert.doesNotMatch(origin, /GRANT EXECUTE ON FUNCTION public\.transition_client_to_solo\(uuid, uuid\) TO authenticated/);
  assert.match(origin, /coach_relationship_notices/);
  assert.match(origin, /coach_relationship_endings/);
});

test('the athlete can leave from Profil; the coach sees a private notice; dossier UI fails closed', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /rpc\('client_end_coach_link'\)/);
  assert.doesNotMatch(store, /rpcMissing/);
  assert.match(store, /endMyCoachLink/);
  assert.match(store, /applyCoachingDeparture/);

  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.match(profile, /ClientCoachRelationshipPanel/);
  assert.match(profile, /coached && myCoach/);

  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /ActiveRelationshipBoundary/);
  assert.match(app, /returningFromCoaching/);
  assert.match(app, /path="\/clients\/:id"/);

  const dash = src('src/components/coaching/CoachDashboard.tsx');
  assert.match(dash, /CoachRelationshipNotices/);

  const leave = src('src/components/coaching/ClientCoachRelationshipPanel.tsx');
  assert.match(leave, /coaching\.leave\.kept/);
  assert.match(leave, /coaching\.leave\.stopped/);
  assert.match(leave, /coaching\.leave\.paused/);
  assert.match(leave, /coaching\.leave\.notTransferred/);
  assert.doesNotMatch(leave, /billing/);
  assert.doesNotMatch(leave, /stripe/i);

  const fr = src('src/i18n/locales/fr/coaching.ts');
  assert.match(fr, /Tu gardes/);
  assert.match(fr, /Ça s’arrête/);
  assert.match(fr, /Ça ne se transmet pas/);
  const en = src('src/i18n/locales/en/coaching.ts');
  assert.match(en, /You keep/);
  assert.match(en, /This stops/);
  assert.match(en, /This is not transferred/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /supabase\/tests\/client_departure\.sql/);
  assert.match(ci, /commercial_durations\.sql/);
  const lock = src('supabase/schema_migrations.lock.json');
  assert.match(lock, /"version": "20260913184325"/);
  assert.match(lock, /"name": "client_end_coach_link"/);
  const departure = src('supabase/tests/client_departure.sql');
  assert.match(departure, /solo trial not stamped to 14 days/);
  assert.match(departure, /solo trial shortened or rewritten/);
});
