import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('directory writes go through RPCs and accepted requests never create a coaching link or billing', () => {
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.request_coaching');
  const mig = latest.sql;
  assert.match(latest.file, /_coach_marketplace\.sql$/);
  assert.match(mig, /REVOKE ALL ON public\.coach_profiles FROM PUBLIC, anon, authenticated/);
  assert.match(mig, /GRANT SELECT ON public\.coach_profiles TO authenticated/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.request_coaching\(uuid, text, text, integer, uuid\) TO authenticated/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.request_coaching\(uuid, text, text, integer, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.respond_coaching_request\(uuid, text\) TO authenticated/);
  assert.match(mig, /accepted does not create coach_client_links/);
  assert.match(mig, /Agreement grants neither dossier access nor a paid subscription/);
  assert.doesNotMatch(mig, /INSERT INTO public\.coach_client_links/);
  assert.doesNotMatch(mig, /INSERT INTO public\.subscriptions/);
  assert.doesNotMatch(mig, /stripe/i);
  assert.doesNotMatch(mig, /oauth/i);
  const sqlTest = src('supabase/tests/coach_marketplace.sql');
  assert.match(sqlTest, /agreement granted dossier access/);
  assert.match(sqlTest, /acceptance created a coaching link/);
  assert.match(sqlTest, /direct write allowed/);
  const matrix = src('supabase/tests/rls_matrix.sql');
  assert.match(matrix, /MARKETPLACE_GRANTS/);
});

test('the directory is reachable without a 6th bottom tab and skips intake, not the assigned questionnaire', () => {
  const app = src('src/App.tsx');
  const firstQuestionnaire = app.indexOf('ClientQuestionnairePanel');
  const marketplaceRoute = app.indexOf('path="/coaches"');
  const intake = app.indexOf('<KinesiologyIntakeFlow />');
  assert.ok(firstQuestionnaire > 0 && marketplaceRoute > firstQuestionnaire, 'questionnaire gate must precede marketplace');
  assert.ok(intake > marketplaceRoute, 'marketplace must skip kinesiology intake');
  assert.match(app, /entry_intent === 'find_coach'/);
  assert.match(app, /mode="directory"/);

  const bottom = src('src/components/layout/BottomNav.tsx');
  assert.doesNotMatch(bottom, /path: '\/coaches'/);
  assert.doesNotMatch(bottom, /path: '\/coach\/profile'/);

  const side = src('src/components/layout/SideNav.tsx');
  assert.match(side, /path: '\/coaches'/);
  assert.match(side, /path: '\/coach\/profile'/);
  assert.match(side, /path: '\/coaching-requests'/);

  const picker = src('src/components/onboarding/EntryIntentionPage.tsx');
  assert.match(picker, /navigate\(intent === 'find_coach' \? '\/coaches' : '\/dashboard'/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /coach_marketplace\.sql/);
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.request_coaching');
  const lock = src('supabase/schema_migrations.lock.json');
  const version = latest.file.slice(0, 14);
  assert.match(lock, new RegExp(`"version": "${version}"`));
  assert.match(lock, /"name": "coach_marketplace"/);
});
