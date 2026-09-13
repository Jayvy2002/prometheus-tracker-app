import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('choose_account_intent stores a preference and never creates a coaching link', () => {
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.choose_account_intent').sql;
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.choose_account_intent\(text\) TO authenticated/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.choose_account_intent\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(mig, /set_coaching_role\('coach'\)/);
  assert.doesNotMatch(mig, /coach_client_links/);
  assert.doesNotMatch(mig, /onboarding_completed\s*=\s*true/);
  assert.doesNotMatch(mig, /stripe/i);
  assert.doesNotMatch(mig, /oauth/i);
  assert.doesNotMatch(mig, /subscription/);
});

test('login is identity-only; intention is chosen after auth', () => {
  const page = src('src/components/auth/AuthPage.tsx');
  assert.doesNotMatch(page, /setIntendedCoachingRole\(/);
  assert.match(page, /clearIntendedCoachingRole/);
  const app = src('src/App.tsx');
  assert.match(app, /EntryIntentionPage/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /choose_account_intent/);
  const picker = src('src/components/onboarding/EntryIntentionPage.tsx');
  assert.match(picker, /navigate\(intent === 'find_coach' \? '\/coaches' : '\/dashboard'/);
  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /account_entry_intent\.sql/);
  const lock = src('supabase/schema_migrations.lock.json');
  assert.match(lock, /"version": "20260913192450"/);
  assert.match(lock, /"name": "account_entry_intent"/);
});
