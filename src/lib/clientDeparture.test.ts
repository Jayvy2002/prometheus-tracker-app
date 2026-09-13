import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('client_end_coach_link uses the shared transition, locks the link, and stays private', () => {
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.client_end_coach_link').sql;
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.client_end_coach_link\(\)/);
  assert.match(mig, /transition_client_to_solo/);
  assert.match(mig, /FOR UPDATE/);
  assert.match(mig, /auth\.uid\(\) = p_client_id/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.client_end_coach_link\(\) FROM PUBLIC, anon/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.client_end_coach_link\(\) TO authenticated/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.transition_client_to_solo/);
  assert.doesNotMatch(mig, /GRANT EXECUTE ON FUNCTION public\.transition_client_to_solo\(uuid, uuid\) TO authenticated/);
  assert.match(mig, /coach_relationship_notices/);
  assert.match(mig, /coach_relationship_endings/);
  assert.doesNotMatch(mig, /stripe/i);
  assert.doesNotMatch(mig, /subscription/);
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

  const app = src('src/App.tsx');
  assert.match(app, /ActiveRelationshipBoundary/);
  assert.match(app, /returningFromCoaching/);
  assert.match(app, /path="\/clients\/:id"/);

  const dash = src('src/components/coaching/CoachDashboard.tsx');
  assert.match(dash, /CoachRelationshipNotices/);

  const leave = src('src/components/coaching/ClientCoachRelationshipPanel.tsx');
  assert.match(leave, /coaching\.leave\.kept/);
  assert.doesNotMatch(leave, /billing/);
  assert.doesNotMatch(leave, /stripe/i);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /supabase\/tests\/client_departure\.sql/);
  const lock = src('supabase/schema_migrations.lock.json');
  assert.match(lock, /"version": "20260913184325"/);
  assert.match(lock, /"name": "client_end_coach_link"/);
});
