import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('directory writes go through RPCs; athlete confirm activates the coaching link without billing', () => {
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.request_coaching');
  const mig = latest.sql;
  assert.match(latest.file, /_marketplace_athlete_confirm\.sql$/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.request_coaching\(uuid, text, text, integer, uuid\) TO authenticated/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.request_coaching\(uuid, text, text, integer, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(mig, /GRANT EXECUTE ON FUNCTION public\.respond_coaching_request\(uuid, text\) TO authenticated/);
  const activation = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.activate_coaching_relationship').sql;
  assert.match(activation, /REVOKE ALL ON FUNCTION public\.activate_coaching_relationship\(uuid, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(mig, /GRANT EXECUTE ON FUNCTION public\.activate_coaching_relationship\(uuid, uuid\) TO authenticated/);
  assert.match(activation, /INSERT INTO public\.coach_client_links/);
  assert.match(mig, /p_status = 'confirmed'/);
  assert.match(mig, /athlete_confirmed/);
  assert.match(mig, /coach_accepted/);
  assert.match(mig, /'pending',\s*'accepted',\s*'coach_accepted'/);
  assert.match(mig, /IF v_result\.status = 'accepted'/);
  assert.doesNotMatch(mig, /SET status = 'athlete_confirmed'\s+WHERE status = 'accepted'/);
  assert.match(mig, /source, consent_version, scopes/);
  assert.match(mig, /directory_request/);
  const acceptedBlock = mig.slice(mig.indexOf("IF p_status = 'accepted'"), mig.indexOf("IF p_status = 'declined'"));
  assert.doesNotMatch(acceptedBlock, /activate_coaching_relationship/);
  assert.doesNotMatch(acceptedBlock, /coaching_relationship_consents/);
  const confirmedBlock = mig.slice(mig.indexOf("IF p_status = 'confirmed'"));
  assert.match(confirmedBlock, /activate_coaching_relationship/);
  assert.match(confirmedBlock, /athlete_confirmed/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public.activate_coaching_relationship\(uuid, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(mig, /INSERT INTO public\.subscriptions/);
  assert.doesNotMatch(mig, /stripe/i);
  assert.doesNotMatch(mig, /oauth/i);
  const sqlTest = src('supabase/tests/coach_marketplace.sql');
  assert.match(sqlTest, /coach accept granted dossier access/);
  assert.match(sqlTest, /coach accept created a coaching link/);
  assert.match(sqlTest, /athlete confirm did not create a coaching link/);
  assert.match(sqlTest, /confirmed request withdrawn without ending the link/);
  assert.match(sqlTest, /direct write allowed/);
  assert.match(sqlTest, /legacy accepted rewritten as athlete_confirmed/);
  assert.match(sqlTest, /legacy accepted replayed as athlete confirm/);
  assert.match(sqlTest, /legacy accepted link not readable/);
  assert.match(sqlTest, /legacy accepted reactivated/);
  assert.match(sqlTest, /legacy accepted stays accepted/);
  const audit = src('supabase/tests/marketplace_audit_hardening.sql');
  assert.match(audit, /legacy accepted rewritten as athlete_confirmed/);
  assert.match(audit, /legacy accepted reactivated/);
  assert.match(audit, /leftover accepted stays accepted/);
  const matrix = src('supabase/tests/rls_matrix.sql');
  assert.match(matrix, /MARKETPLACE_GRANTS/);
  assert.match(matrix, /activate_coaching_relationship/);
});

test('the directory is reachable without a 6th bottom tab and skips intake, not the assigned questionnaire', () => {
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
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
  assert.match(page, /track\('marketplace_athlete_confirmed'/);
  assert.match(page, /navigate\(`\/clients\/\$\{/);
  assert.doesNotMatch(page, /agreementOnly/);
  assert.match(page, /requestActivatesFollow/);
  assert.match(page, /normalizeJoinRequestStatus/);
  assert.match(page, /requestRelationshipCopyKey/);
  assert.match(page, /marketplace\.acceptContinuesProspect/);
  assert.match(page, /marketplace\.confirmActivatesFollow/);
  assert.doesNotMatch(page, /acceptActivatesFollow/);
  assert.doesNotMatch(page, /relationshipUnknownHistorical/);
  assert.match(page, /marketplace\.already_coached/);
  const api = src('src/features/marketplace/domain/marketplaceApi.ts');
  assert.match(api, /coach_client_links/);
  assert.match(api, /resolveRelationshipState/);
  assert.doesNotMatch(api, /coaching_relationship_consents/);
  assert.doesNotMatch(api, /relationship_state: consent/);

  const fr = src('src/i18n/locales/fr/marketplace.ts');
  assert.match(fr, /pas un paiement/);
  assert.match(fr, /Le suivi avec ce coach est actif/);
  assert.match(fr, /formulaire n’est pas ouvert/);
  assert.match(fr, /Suivi historique — ouvert à l’acceptation du coach/);
  assert.match(fr, /Confirmation de l’athlète enregistrée/);
  assert.match(fr, /Le statut actuel de ce suivi historique est indisponible/);
  const en = src('src/i18n/locales/en/marketplace.ts');
  assert.match(en, /not a payment/);
  assert.match(en, /Coaching with this coach is now active/);
  assert.match(en, /form stays closed/);
  assert.match(en, /Historical follow — opened when the coach accepted/);
  assert.match(en, /Athlete confirmation recorded/);
  assert.match(en, /The current status of this historical coaching relationship is unavailable/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /coach_marketplace\.sql/);
  assert.match(ci, /athlete confirm activates coaching/);
  assert.match(ci, /legacy accepted stays accepted/);
  assert.match(ci, /historical confirmation does not reactivate/);
  assert.match(ci, /concurrent confirmation/);
  const browser = src('scripts/test-questionnaire-browser.mjs');
  assert.match(browser, /Athlete confirmation recorded/);
  assert.match(browser, /This coaching relationship has ended/);
  assert.doesNotMatch(browser, /Confirmed — coaching is active/);
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.request_coaching');
  const lock = src('supabase/schema_migrations.lock.json');
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: unknown[] };
  const version = latest.file.slice(0, 14);
  assert.equal(latest.file, '20260918130232_marketplace_athlete_confirm.sql');
  assert.match(lock, new RegExp(`"version": "${version}"`));
  assert.equal(pending.pending.length, 0);
  assert.match(lock, /"name": "coach_marketplace"/);
  assert.match(lock, /"name": "marketplace_activate_link"/);
  assert.match(lock, /"name": "marketplace_athlete_confirm"/);
});
