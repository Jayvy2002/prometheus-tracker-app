import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

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
  assert.match(draft, /setClientNutritionTargets/);
  assert.match(draft, /incompleteCals/);
});

test('coached tracking default is off until fetch; invite seeds the row', () => {
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /ALL_OFF_TRACKING/);
  assert.match(store, /viewerTrackingAfterFetch/);
  assert.match(store, /role === 'client'/);
  const tracking = src('src/lib/clientTracking.ts');
  assert.match(tracking, /Coached \+ no row = all off/);
  const sql = src('supabase/migrations/20260831000002_audit_coach_owned_targets.sql');
  assert.match(sql, /INSERT INTO client_tracking_config/);
  assert.match(sql, /accept_coach_invite/);
  assert.match(sql, /setup_completed_at IS NOT NULL/);
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
