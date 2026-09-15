import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('directory writes go through RPCs; coach accept activates the coaching link without billing', () => {
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.request_coaching');
  const mig = latest.sql;
  assert.match(latest.file, /_marketplace_audit_hardening\.sql$/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.request_coaching\(uuid, text, text, integer, uuid\) TO authenticated/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.request_coaching\(uuid, text, text, integer, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.respond_coaching_request\(uuid, text\) TO authenticated/);
  const activation = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.activate_coaching_relationship').sql;
  assert.match(activation, /REVOKE ALL ON FUNCTION public\.activate_coaching_relationship\(uuid, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(mig, /GRANT EXECUTE ON FUNCTION public\.activate_coaching_relationship\(uuid, uuid\) TO authenticated/);
  assert.match(activation, /INSERT INTO public\.coach_client_links/);
  assert.match(mig, /source, consent_version, scopes/);
  assert.match(mig, /directory_request/);
  assert.doesNotMatch(mig, /INSERT INTO public\.subscriptions/);
  assert.doesNotMatch(mig, /stripe/i);
  assert.doesNotMatch(mig, /oauth/i);
  const sqlTest = src('supabase/tests/coach_marketplace.sql');
  assert.match(sqlTest, /acceptance did not grant dossier access/);
  assert.match(sqlTest, /acceptance did not create a coaching link/);
  assert.match(sqlTest, /accepted request withdrawn without ending the link/);
  assert.match(sqlTest, /direct write allowed/);
  const matrix = src('supabase/tests/rls_matrix.sql');
  assert.match(matrix, /MARKETPLACE_GRANTS/);
  assert.match(matrix, /activate_coaching_relationship/);
});

test('the directory is reachable without a 6th bottom tab and skips intake, not the assigned questionnaire', () => {
  const app = src('src/App.tsx');
  const marketplaceRoute = app.indexOf('path="/coaches"');
  const intake = app.indexOf('<KinesiologyIntakeFlow />');
  assert.doesNotMatch(app, /activeAssignment\?\.response && !activeAssignment\.response\.completed_at/);
  assert.ok(marketplaceRoute > 0 && intake > marketplaceRoute, 'marketplace must skip kinesiology intake');
  assert.match(app, /entry_intent === 'find_coach'/);
  assert.match(app, /mode="directory"/);

  const bottom = src('src/app/layout/BottomNav.tsx');
  assert.doesNotMatch(bottom, /\/coaches/);
  assert.doesNotMatch(bottom, /\/coach\/profile/);

  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /path: '\/coaches'/);
  assert.match(nav, /path: '\/coach\/profile'/);
  assert.match(nav, /path: '\/coaching-requests'/);
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  assert.doesNotMatch(mobileFn, /directory/);
  assert.doesNotMatch(mobileFn, /coachOffer/);

  const picker = src('src/components/onboarding/EntryIntentionPage.tsx');
  assert.match(picker, /navigate\(intent === 'find_coach' \? '\/coaches' : '\/dashboard'/);

  const page = src('src/components/marketplace/MarketplacePage.tsx');
  assert.match(page, /DIRECT_INVITE_CONSENT_SCOPES/);
  assert.match(page, /track\('coaching_request_accepted'/);
  assert.match(page, /navigate\(`\/clients\/\$\{/);
  assert.doesNotMatch(page, /agreementOnly/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /coach_marketplace\.sql/);
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.request_coaching');
  const lock = src('supabase/schema_migrations.lock.json');
  const version = latest.file.slice(0, 14);
  assert.match(lock, new RegExp(`"version": "${version}"`));
  assert.match(lock, /"name": "coach_marketplace"/);
  assert.match(lock, /"name": "marketplace_activate_link"/);
});
