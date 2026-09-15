import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';
import {
  DIRECT_INVITE_CONSENT_SCOPES,
  DIRECT_INVITE_CONSENT_VERSION,
  directInviteConsentArgs,
} from './relationshipConsent';
import { coachingStoreSource } from './coachingStoreSource';
import { i18nLocaleSource } from './i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/stores/coachingStore.ts') return coachingStoreSource();
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('direct invitation sends one explicit, versioned and duplicate-free scope set', () => {
  const args = directInviteConsentArgs();
  assert.equal(args.p_consent_version, 1);
  assert.equal(DIRECT_INVITE_CONSENT_VERSION, 1);
  assert.deepEqual(args.p_scopes, [...DIRECT_INVITE_CONSENT_SCOPES]);
  assert.equal(new Set(args.p_scopes).size, args.p_scopes.length);
  assert.deepEqual(args.p_scopes, [...args.p_scopes].sort());
});

test('M2b adds the 3-arg accept RPC without revoking the 1-arg overload', () => {
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.accept_coach_invite(').sql;
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.accept_coach_invite\(\s*p_token text,\s*p_consent_version integer,\s*p_scopes text\[\]/);
  assert.match(mig, /public\.accept_coach_invite\(p_token\)/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.accept_coach_invite\(text, integer, text\[\]\) TO authenticated/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.accept_coach_invite\(text\) TO authenticated/);
  assert.doesNotMatch(mig, /REVOKE ALL ON FUNCTION public\.accept_coach_invite\(text\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(mig, /stripe/i);
  assert.doesNotMatch(mig, /subscription/);
});

test('InvitePage records versioned consent; the store no longer calls the 1-arg RPC', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /directInviteConsentArgs/);
  assert.match(store, /rpc\('accept_coach_invite'/);
  assert.doesNotMatch(store, /rpc\('accept_coach_invite',\s*\{\s*p_token: token\s*\}\)/);

  const page = src('src/components/coaching/InvitePage.tsx');
  assert.match(page, /coaching\.invite\.sharing/);
  assert.match(page, /coaching\.invite\.consentAck/);
  assert.match(page, /DIRECT_INVITE_CONSENT_SCOPES/);
  assert.doesNotMatch(page, /billing/);
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /progress_photos: 'Photos de progression — y compris celles déjà enregistrées avant ce suivi'/);
  assert.match(en, /progress_photos: 'Progress photos — including those already saved before this coaching relationship'/);

  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.doesNotMatch(app, /await acceptInvite\(token\)/);
  assert.match(app, /Consent is explicit/);
  assert.match(app, /\/invite\/\$\{pendingInvite\}/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /supabase\/tests\/relationship_consent\.sql/);
  const lock = src('supabase/schema_migrations.lock.json');
  assert.match(lock, /"version": "20260913185941"/);
  assert.match(lock, /"name": "relationship_consent"/);
});
