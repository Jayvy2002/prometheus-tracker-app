import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createAccountRequestGuard } from './accountRequestGuard';
import { setSessionOwner } from './sessionScope';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('fetchMyRole: error keeps previous role, never writes coachingRole none', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /nextRoleAfterFetch/);
  const fetch = store.slice(store.indexOf('fetchMyRole: async'));
  const fn = fetch.slice(0, fetch.indexOf('setCoachingRole:'));
  assert.match(fn, /toast\(i18n\.t\('errors\.loadRole'\)/);
  assert.doesNotMatch(fn, /coachingRole:\s*'none'/);
  assert.match(fn, /coachingRoleError/);
  assert.match(fn, /previousRoleForFetch/);
  assert.match(fn, /persistRememberedCoachingRole\(/);
});

test('targets RPC is the only client kcal write path in the store', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /coach_set_client_nutrition_targets/);
  const inbox = src('src/components/coaching/CoachInboxPage.tsx');
  assert.doesNotMatch(inbox, /setClientNutritionTargets/);
  const goals = src('src/components/profile/GoalsForm.tsx');
  assert.match(goals, /stripSelfServeNutritionTargets/);
});

test('send Relancer writes coach_messages; kcal send stays on the draft page', () => {
  const store = src('src/stores/coachingStore.ts');
  const send = store.slice(store.indexOf('sendCoachMessage: async'));
  const fn = send.slice(0, send.indexOf('sendClientReply:'));
  assert.match(fn, /from\('coach_messages'\)/);
  assert.match(fn, /\.insert\(/);
  const inbox = src('src/components/coaching/InterventionInboxCard.tsx');
  assert.match(inbox, /inboxPrimaryIsSend/);
  assert.match(inbox, /coaching\.queue\.openDraft/);
  const draft = src('src/components/coaching/InterventionDraftPage.tsx');
  assert.match(draft, /showCalories = row\.kind === 'calorie_adjustment'/);
  assert.match(draft, /effects\.calories/);
  assert.match(draft, /incompleteCals/);
});

test('coached tracking default is off until fetch; invite seeds the row', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /ALL_OFF_TRACKING/);
  assert.match(store, /viewerTrackingAfterFetch/);
  assert.match(store, /role === 'client'/);
  const tracking = src('src/lib/clientTracking.ts');
  assert.match(tracking, /Coached \+ no row = all off/);
  const sql = src('supabase/migrations/20260831235414_audit_coach_owned_targets.sql');
  assert.match(sql, /INSERT INTO client_tracking_config/);
  assert.match(sql, /accept_coach_invite/);
  assert.match(sql, /setup_completed_at IS NOT NULL/);
});

test('resolveIntervention only touches pending rows and reports already_resolved', () => {
  const store = src('src/stores/coachingStore.ts');
  const fn = store.slice(store.indexOf('resolveIntervention: async'), store.indexOf('askCoachAgent: async'));
  assert.match(fn, /\.eq\('status', 'pending'\)/);
  assert.match(fn, /\.select\('id'\)/);
  assert.match(fn, /already_resolved/);
});

test('single coach-agent invoke — no ask-second alias, no suggest-client-plan', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /COACH_AGENT_FUNCTION/);
  assert.doesNotMatch(store, /ask-second/);
  assert.doesNotMatch(store, /suggest-client-plan/);
  const agent = src('src/lib/coachAgent.ts');
  assert.doesNotMatch(agent, /COACH_AGENT_ALIAS_FUNCTION/);
  const ask = src('supabase/functions/ask-second/index.ts');
  assert.match(ask, /status: 410/);
  assert.doesNotMatch(ask, /handleCoachAgentHttp/);
  const plan = src('supabase/functions/suggest-client-plan/index.ts');
  assert.match(plan, /status: 410/);
});

test('role requests reject another account and logout responses', () => {
  const guard = createAccountRequestGuard();
  setSessionOwner('A');
  const first = guard.begin('A')!;
  setSessionOwner('B');
  assert.equal(first(), false);
  assert.equal(guard.begin('A'), null);
  const second = guard.begin('B')!;
  setSessionOwner(null);
  assert.equal(second(), false);
});

test('newer request wins even if the earlier request resolves last', async () => {
  const guard = createAccountRequestGuard();
  setSessionOwner('A');
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const first = guard.begin('A')!;
  const applied: string[] = [];
  const oldRead = delayed.then(() => { if (first()) applied.push('old'); });
  const second = guard.begin('A')!;
  if (second()) applied.push('new');
  release();
  await oldRead;
  assert.deepEqual(applied, ['new']);
  setSessionOwner(null);
});

test('reset invalidates pending reads even when the same account signs back in', () => {
  const guard = createAccountRequestGuard();
  setSessionOwner('A');
  const before = guard.begin('A')!;
  guard.invalidate();
  setSessionOwner(null);
  setSessionOwner('A');
  assert.equal(before(), false);
  assert.equal(guard.begin('A')!(), true);
  setSessionOwner(null);
});

test('stale account caller does not cancel the current account request', () => {
  const guard = createAccountRequestGuard();
  setSessionOwner('B');
  const current = guard.begin('B')!;
  assert.equal(guard.begin('A'), null);
  assert.equal(current(), true);
  setSessionOwner(null);
});

test('role mutation invalidates an older read', () => {
  const guard = createAccountRequestGuard();
  setSessionOwner('A');
  const read = guard.begin('A')!;
  guard.invalidate();
  assert.equal(read(), false);
  setSessionOwner(null);
});

test('role read integration guards errors, state and persistence and resets requests', () => {
  const store = src('src/stores/coachingStore.ts');
  const fetch = store.slice(store.indexOf('fetchMyRole: async'), store.indexOf('setCoachingRole: async'));
  assert.match(fetch, /roleRequests.begin\(userId\)/);
  assert.equal(fetch.split('if (!isCurrent()) return;').length - 1, 2);
  assert.ok(fetch.indexOf('if (!isCurrent()) return;') < fetch.indexOf('persistRememberedCoachingRole('));
  const reset = store.slice(store.lastIndexOf('clear: () =>'));
  assert.match(reset, /roleRequests.invalidate\(\)/);
  const mutation = store.slice(store.indexOf('setCoachingRole: async'), store.indexOf('applyIntendedCoachingRole: async'));
  assert.match(mutation, /roleRequests.invalidate\(\)/);
});
