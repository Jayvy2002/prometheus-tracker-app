import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { entitlementAccess, parseMyEntitlements, showsEndDate } from './entitlements';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const AT = new Date('2026-09-23T12:00:00Z');
const FUTURE = '2026-09-30T12:00:00Z';
const PAST = '2026-09-20T12:00:00Z';

test('access rules mirror public.entitlement_access', () => {
  assert.equal(entitlementAccess(null, null, null, AT), 'none');
  assert.equal(entitlementAccess('beta', null, null, AT), 'beta');
  assert.equal(entitlementAccess('beta', PAST, null, AT), 'expired');
  assert.equal(entitlementAccess('active', null, null, AT), 'paid');
  assert.equal(entitlementAccess('active', PAST, null, AT), 'expired');
  // Canceled keeps what was paid until the period ends.
  assert.equal(entitlementAccess('canceled', FUTURE, null, AT), 'paid');
  assert.equal(entitlementAccess('canceled', null, null, AT), 'expired');
  assert.equal(entitlementAccess('trial', FUTURE, null, AT), 'trial');
  assert.equal(entitlementAccess('trial', PAST, null, AT), 'expired');
  // Only a stamped grace keeps a past_due account open.
  assert.equal(entitlementAccess('past_due', null, FUTURE, AT), 'grace');
  assert.equal(entitlementAccess('past_due', null, PAST, AT), 'expired');
  assert.equal(entitlementAccess('past_due', null, null, AT), 'expired');
});

test('an unreadable answer is « none », never « paid »', () => {
  const empty = parseMyEntitlements(null);
  assert.equal(empty.solo.access, 'none');
  assert.equal(empty.coach.access, 'none');
  assert.equal(empty.coach.clientLimit, null);
  const odd = parseMyEntitlements({ solo: { access: 'premium' }, coach: { access: 'paid', active_clients: -2, client_limit: 0 } });
  assert.equal(odd.solo.access, 'none');
  assert.equal(odd.coach.access, 'paid');
  assert.equal(odd.coach.activeClients, 0);
  assert.equal(odd.coach.clientLimit, null);
  const full = parseMyEntitlements({
    solo: { access: 'trial', source: 'trial', ends_at: FUTURE, billing_status: null },
    coach: { access: 'grace', source: 'billing', ends_at: FUTURE, client_limit: 5, active_clients: 6, over_limit: true },
  });
  assert.equal(full.solo.access, 'trial');
  assert.equal(showsEndDate(full.solo), true);
  assert.deepEqual([full.coach.clientLimit, full.coach.activeClients, full.coach.overLimit], [5, 6, true]);
  assert.equal(showsEndDate(parseMyEntitlements({ solo: { access: 'none', ends_at: FUTURE } }).solo), false);
});

test('SQL contract: separate table, service-only writes, own reads, coach grace from P1.5', () => {
  const sql = src('supabase/migrations/20260924205000_p6_entitlements.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.account_entitlements/);
  assert.match(sql, /REVOKE ALL ON public\.account_entitlements FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.account_entitlements TO authenticated/);
  assert.match(sql, /USING \(user_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_account_entitlement\([^)]*\) TO service_role;/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.set_account_entitlement\([^)]*\) TO [^;]*authenticated/);
  assert.match(sql, /now\(\) \+ public\.coach_grace_interval\(\)/);
  assert.match(sql, /solo_trial_ends_at/);
  // Identity and relations are read, never written.
  assert.doesNotMatch(sql, /UPDATE public\.user_roles|INSERT INTO public\.user_roles|UPDATE public\.coach_client_links/);
  assert.doesNotMatch(sql, /user_capabilities/);
  // The legacy free/premium model is not an input.
  assert.doesNotMatch(sql, /FROM public\.subscriptions|role = 'premium'/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string }> };
  assert.ok(pending.pending.some(row => row.version === '20260924205000'));
  assert.match(src('.github/workflows/ci.yml'), /supabase\/tests\/p6_entitlements\.sql/);
});

test('no price is invented and nothing gates on an entitlement yet (P6.2 decides)', () => {
  const card = src('src/components/profile/AccessCard.tsx');
  const fr = src('src/i18n/locales/fr/common.ts');
  const en = src('src/i18n/locales/en/common.ts');
  for (const text of [card, fr.slice(fr.indexOf('entitlements: {'), fr.indexOf('entryIntention: {')), en.slice(en.indexOf('entitlements: {'), en.indexOf('entryIntention: {'))]) {
    assert.doesNotMatch(text, /€|\$\s?\d|\d\s?\$|CAD|EUR|USD|\/mois|\/month|checkout|stripe/i);
  }
  assert.doesNotMatch(card, /navigate\(|<Link/);
  // Only the read-only card reads entitlements in this sub-task.
  const root = resolve(process.cwd(), 'src');
  const users: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !full.includes(join('features', 'entitlements'))
        && /useMyEntitlements|fetchMyEntitlements|get_my_entitlements/.test(readFileSync(full, 'utf8'))) {
        users.push(full.slice(root.length + 1));
      }
    }
  };
  walk(root);
  assert.deepEqual(users, [join('components', 'profile', 'AccessCard.tsx')]);
  assert.match(src('src/components/profile/ProfilePage.tsx'), /<AccessCard userId=\{user\?\.id\} isCoach=\{canCoach\} \/>/);
});
