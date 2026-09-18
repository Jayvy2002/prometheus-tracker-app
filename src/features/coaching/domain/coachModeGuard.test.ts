import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  COACH_HAS_ACTIVE_CLIENTS,
  isCoachHasActiveClientsError,
  mapCoachingRoleError,
} from './coachModeGuard';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import { coachingStoreSource } from '../../../lib/coachingStoreSource';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/stores/coachingStore.ts') return coachingStoreSource();
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('maps the SQL exception to a stable client code', () => {
  assert.equal(isCoachHasActiveClientsError(null), false);
  assert.equal(isCoachHasActiveClientsError('coach_has_active_clients'), true);
  assert.equal(isCoachHasActiveClientsError('ERROR: coach_has_active_clients'), true);
  assert.equal(mapCoachingRoleError('permission denied'), 'permission denied');
  assert.equal(mapCoachingRoleError('ERROR: coach_has_active_clients'), COACH_HAS_ACTIVE_CLIENTS);
});

test('latest set_coaching_role refuses none while coach_id links are active', () => {
  const found = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.set_coaching_role');
  assert.equal(found.file, '20260917235400_independent_coach_capability.sql');
  assert.match(found.sql, /SECURITY DEFINER/);
  assert.match(found.sql, /SET search_path = ''/);
  assert.match(found.sql, /RAISE EXCEPTION 'coach_has_active_clients'/);
  assert.match(found.sql, /coach_id = v_uid AND status = 'active'/);
  assert.match(found.sql, /GRANT EXECUTE ON FUNCTION public\.set_coaching_role\(text\) TO authenticated/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.set_coaching_role\(text\) FROM PUBLIC, anon/);
});

test('disable coach mode counts coach_id links and never calls none while they exist', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /countActiveCoachLinks/);
  assert.match(store, /\.eq\('coach_id', accountId\)/);
  assert.match(store, /\.eq\('status', 'active'\)/);
  const disable = store.slice(store.indexOf('disableCoachMode: async'));
  assert.match(disable, /countActiveCoachLinks/);
  assert.match(disable, /COACH_HAS_ACTIVE_CLIENTS/);
  assert.match(store, /mapCoachingRoleError/);
});

test('profile confirms disable with the client count and does not dump nav.clients', () => {
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.match(profile, /coaching\.disableMode/);
  assert.match(profile, /countActiveCoachLinks/);
  assert.match(profile, /selectAccountWorkspace\('coaching'\)/);
  assert.match(profile, /navigate\('\/clients'\)/);
  assert.doesNotMatch(profile, /nav\.clients/);
  assert.match(src('src/i18n/locales/fr.ts'), /disableMode:/);
  assert.match(src('src/i18n/locales/en.ts'), /disableMode:/);
  assert.match(src('.github/workflows/ci.yml'), /set_coaching_role_roster\.sql/);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260914221500"/);
});
