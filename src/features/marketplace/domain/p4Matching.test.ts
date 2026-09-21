import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  blankMatchProfile,
  evaluateCoachMatch,
  intentIsReady,
  listedRateCopy,
  listedRateDecision,
  normalizeSearchIntent,
  shortlistMatches,
  type CoachMatchProfile,
  type MarketplaceSearchIntent,
} from './marketplaceMatch';
import { MARKET_DISCIPLINES, type CoachPublicProfile } from './marketplace';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function profile(overrides: Partial<CoachMatchProfile> = {}): CoachMatchProfile {
  return {
    coach_id: overrides.coach_id ?? 'c4200000-0000-4000-8000-000000000001',
    public_name: 'Coach',
    introduction: '',
    method: '',
    offer: '',
    disciplines: ['strength'],
    languages: ['fr'],
    formats: ['online'],
    area: '',
    area_city: '',
    area_region: '',
    area_country: '',
    published: true,
    accepting_clients: true,
    updated_at: '',
    contact_frequency: 'weekly',
    coaching_style: 'collaborative',
    autonomy: 'medium',
    experience_levels: ['beginner'],
    indicative_price_cents: 4000,
    indicative_price_period: 'month',
    indicative_price_currency: 'EUR',
    ...overrides,
  };
}

function intent(overrides: Partial<MarketplaceSearchIntent> = {}): MarketplaceSearchIntent {
  return normalizeSearchIntent({
    discipline: 'strength',
    language: 'fr',
    format: 'online',
    contact_frequency: 'weekly',
    coaching_style: 'collaborative',
    autonomy: 'medium',
    experience_level: 'beginner',
    ...overrides,
  });
}

test('blocking mismatches make a coach ineligible without a compatibility percent', () => {
  const language = evaluateCoachMatch(profile({ languages: ['en'] }), intent());
  assert.equal(language.eligible, false);
  assert.equal(language.matched_requirements.includes('language'), false);
  const format = evaluateCoachMatch(profile({ formats: ['in_person'], area: 'Lyon' }), intent({ format: 'online' }));
  assert.equal(format.eligible, false);
  const area = evaluateCoachMatch(
    profile({ formats: ['in_person'], area_city: 'Paris', area_country: 'FR' }),
    intent({ format: 'in_person', area_city: 'Lyon', area_country: 'FR' }),
  );
  assert.equal(area.eligible, false);
  const overBudget = evaluateCoachMatch(profile({ indicative_price_cents: 9000 }), intent({ budget_max_cents: 5000, budget_period: 'month', budget_currency: 'EUR' }));
  assert.equal(overBudget.eligible, false);
});

test('missing listed rate stays eligible and is reported as missing information', () => {
  const row = evaluateCoachMatch(
    profile({ indicative_price_cents: null, indicative_price_period: 'on_request' }),
    intent({ budget_max_cents: 5000, budget_period: 'month', budget_currency: 'EUR' }),
  );
  assert.equal(row.eligible, true);
  assert.deepEqual(row.missing_information, ['price']);
  assert.equal(row.matched_requirements.includes('budget'), false);
});

test('in-person without city and country is not ready and is ineligible', () => {
  const row = evaluateCoachMatch(
    profile({ formats: ['in_person'], area_city: 'Lyon', area_country: 'FR' }),
    intent({ format: 'in_person', area_city: '', area_country: '' }),
  );
  assert.equal(row.eligible, false);
  assert.equal(intentIsReady(intent({ format: 'in_person' })), false);
  assert.equal(intentIsReady(intent({ format: 'in_person', area_city: 'Lyon', area_country: 'FR' })), true);
});

test('in-person matching uses city and country equality, not substrings', () => {
  const parisFr = evaluateCoachMatch(
    profile({ formats: ['in_person'], area_city: 'Paris', area_country: 'FR' }),
    intent({ format: 'in_person', area_city: 'Paris', area_country: 'FR' }),
  );
  assert.equal(parisFr.eligible, true);
  const parisTexas = evaluateCoachMatch(
    profile({ formats: ['in_person'], area_city: 'Paris', area_region: 'Texas', area_country: 'US' }),
    intent({ format: 'in_person', area_city: 'Paris', area_country: 'FR' }),
  );
  assert.equal(parisTexas.eligible, false);
  const york = evaluateCoachMatch(
    profile({ formats: ['in_person'], area_city: 'New York', area_country: 'US' }),
    intent({ format: 'in_person', area_city: 'York', area_country: 'US' }),
  );
  assert.equal(york.eligible, false);
});

test('shortlist keeps only eligible coaches, ordered by preferences, capped at five', () => {
  const rows = [
    profile({ coach_id: '6', contact_frequency: '', coaching_style: '', autonomy: '', experience_levels: [] }),
    profile({ coach_id: '1', languages: ['en'] }),
    profile({ coach_id: '2' }),
    profile({ coach_id: '3', contact_frequency: 'weekly', coaching_style: '', autonomy: '', experience_levels: [] }),
    profile({ coach_id: '4', contact_frequency: '', coaching_style: '', autonomy: '', experience_levels: [] }),
    profile({ coach_id: '5', contact_frequency: '', coaching_style: '', autonomy: '', experience_levels: [] }),
    profile({ coach_id: '7', contact_frequency: '', coaching_style: '', autonomy: '', experience_levels: [] }),
  ];
  const shortlist = shortlistMatches(rows, intent());
  assert.equal(shortlist.length, 5);
  assert.deepEqual(shortlist.map(row => row.coach_id), ['2', '3', '4', '5', '6']);
  assert.equal(shortlist.every(row => row.eligible), true);
  assert.equal(shortlist.some(row => row.coach_id === '1'), false);
});

test('an empty eligible set stays empty instead of filling with incompatibles', () => {
  const shortlist = shortlistMatches([profile({ languages: ['en'] }), profile({ disciplines: ['powerlifting'] })], intent());
  assert.deepEqual(shortlist, []);
});

test('intent readiness requires blocking discipline, language and format', () => {
  assert.equal(intentIsReady(intent()), true);
  assert.equal(intentIsReady(normalizeSearchIntent({ discipline: 'strength', language: 'fr' })), false);
  assert.deepEqual(listedRateCopy(profile()), { amount: '40.00', period: 'month', currency: 'EUR' });
  assert.deepEqual(listedRateCopy(profile({ indicative_price_cents: 4050 })), { amount: '40.50', period: 'month', currency: 'EUR' });
  assert.equal(listedRateCopy(profile({ indicative_price_period: 'on_request' })), null);
  const base = { coach_id: 'c', public_name: 'A', introduction: '', method: '', offer: '', disciplines: [], languages: [], formats: [], area: '', published: false, accepting_clients: false, updated_at: '' } as CoachPublicProfile;
  assert.equal(blankMatchProfile(base).indicative_price_period, 'on_request');
  assert.equal(blankMatchProfile(base).area_city, '');
});

test('P4.2 matching is an explained shortlist, not a score, and stays off the sixth tab', () => {
  const sql = src('supabase/migrations/20260921021923_p4_explained_matching.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.marketplace_search_intents/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public.explain_marketplace_matches\(\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public.explain_marketplace_matches\(\) TO authenticated/);
  assert.match(sql, /LIMIT 5/);
  assert.match(sql, /marketplace_location_matches/);
  assert.match(sql, /coach_account_closed/);
  assert.match(sql, /'EUR', 'USD', 'CAD'/);
  assert.doesNotMatch(sql, /position\(lower\(btrim/);
  assert.doesNotMatch(sql, /v_req := v_req \|\| '/);
  assert.doesNotMatch(sql, /%\s*compatible|compatibility_score|92\s*%/);
  assert.doesNotMatch(sql, /subscription/);
  assert.doesNotMatch(sql, /stripe/i);
  assert.match(src('src/app/router/AppRoutes.tsx'), /path="\/coaches\/match"/);
  const routes = src('src/app/router/AppRoutes.tsx');
  assert.ok(routes.indexOf('path="/coaches/match"') < routes.indexOf('path="/coaches/:coachId"'));
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /path: '\/coaches\/match'/);
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  assert.doesNotMatch(mobileFn, /coachMatch/);
  assert.doesNotMatch(mobileFn, /\/coaches\/match/);
  assert.match(src('src/components/marketplace/MarketplacePage.tsx'), /\/coaches\/match/);
  assert.match(src('src/components/marketplace/CoachMatchPage.tsx'), /explainMarketplaceMatches/);
  assert.doesNotMatch(src('src/components/marketplace/CoachMatchPage.tsx'), /marketplace\.compatible/);
  assert.match(src('src/i18n/locales/fr/marketplace.ts'), /Aucun coach ne correspond aux exigences/);
  assert.match(src('src/i18n/locales/en/marketplace.ts'), /No coach matches these requirements/);
  assert.match(src('.github/workflows/ci.yml'), /p4_explained_matching\.sql/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /structured geo shortlist mismatch/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /in-person without city explained/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /shortlist exceeded five/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /missing_information' @> '\["price"\]'/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /^ROLLBACK;/m);
  assert.doesNotMatch(src('supabase/tests/p4_explained_matching.sql'), /^COMMIT;/m);
  assert.match(src('supabase/tests/rls_matrix.sql'), /explain_marketplace_matches/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string; name: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260921021923'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260921021923"/);
});

test('Vision core disciplines remain first-class and comparable budgets require period plus currency', () => {
  assert.deepEqual([...MARKET_DISCIPLINES], ['strength', 'bodybuilding', 'hypertrophy', 'powerlifting', 'general_fitness']);
  const bodybuilding = evaluateCoachMatch(profile({ disciplines: ['bodybuilding'] }), intent({ discipline: 'bodybuilding' }));
  assert.equal(bodybuilding.eligible, true);
  const hypertrophy = evaluateCoachMatch(profile({ disciplines: ['hypertrophy'] }), intent({ discipline: 'hypertrophy' }));
  assert.equal(hypertrophy.eligible, true);
  const sessionVsMonth = evaluateCoachMatch(
    profile({ indicative_price_period: 'session', indicative_price_cents: 9000, indicative_price_currency: 'EUR' }),
    intent({ budget_max_cents: 5000, budget_period: 'month', budget_currency: 'EUR' }),
  );
  assert.equal(sessionVsMonth.eligible, true);
  assert.deepEqual(sessionVsMonth.missing_information, ['price']);
  const programVsMonth = evaluateCoachMatch(
    profile({ indicative_price_period: 'program', indicative_price_cents: 4000, indicative_price_currency: 'EUR' }),
    intent({ budget_max_cents: 5000, budget_period: 'month', budget_currency: 'EUR' }),
  );
  assert.equal(programVsMonth.eligible, true);
  assert.deepEqual(programVsMonth.missing_information, ['price']);
  const otherCurrency = evaluateCoachMatch(
    profile({ indicative_price_currency: 'USD', indicative_price_cents: 20000 }),
    intent({ budget_max_cents: 5000, budget_period: 'month', budget_currency: 'EUR' }),
  );
  assert.equal(otherCurrency.eligible, true);
  assert.deepEqual(otherCurrency.missing_information, ['price']);
  assert.equal(listedRateDecision(5000, 'month', 'EUR', 4000, 'session', 'EUR'), 'missing');
  assert.equal(listedRateDecision(5000, 'month', 'EUR', 4000, 'month', 'USD'), 'missing');
  assert.equal(listedRateDecision(5000, 'month', 'EUR', 9000, 'month', 'EUR'), 'over');
  const sql = src('supabase/migrations/20260921021923_p4_explained_matching.sql');
  assert.match(sql, /bodybuilding/);
  assert.match(sql, /hypertrophy/);
  assert.match(sql, /indicative_price_currency/);
  assert.match(sql, /budget_period/);
  assert.match(sql, /marketplace_listed_rate_decision/);
  assert.doesNotMatch(sql, /€/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /bodybuilding shortlist mismatch/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /session vs month became ineligible/);
  assert.match(src('supabase/tests/p4_explained_matching.sql'), /different currency became ineligible/);
});
