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

test('M1 keeps user_roles as the write source and does not grant workspace privileges', () => {
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.get_my_account_context').sql;
  assert.match(mig, /user_roles remains the write source|user_roles reste la source/i);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.get_my_account_context\(\) TO authenticated/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.sync_legacy_coach_capability\(\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(mig, /GRANT EXECUTE ON FUNCTION public\.sync_legacy_coach_capability/);
  assert.doesNotMatch(mig, /stripe/i);
  assert.doesNotMatch(mig, /subscription/);
});

test('workspace switcher is display-only; CoachOnly still uses server capability', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /get_my_account_context/);
  assert.match(store, /selectAccountWorkspace/);
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /canActAsCoach/);
  assert.match(app, /canUsePersonalTools/);
  assert.doesNotMatch(app, /activeWorkspace === 'coaching'.*CoachOnly/);
  const switcher = src('src/app/layout/WorkspaceSwitcher.tsx');
  assert.match(switcher, /selectAccountWorkspace/);
  assert.doesNotMatch(switcher, /setCoachingRole/);
  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /account_capabilities\.sql/);
  const lock = src('supabase/schema_migrations.lock.json');
  assert.match(lock, /"version": "20260913191435"/);
  assert.match(lock, /"name": "account_capabilities"/);
});
