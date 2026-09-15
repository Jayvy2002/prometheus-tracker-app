import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { coachingStoreSource } from './coachingStoreSource';

function src(rel: string): string {
  if (rel === 'src/stores/coachingStore.ts') return coachingStoreSource();
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
  const agent = src('src/features/coaching/domain/coachAgent.ts');
  assert.doesNotMatch(agent, /COACH_AGENT_ALIAS_FUNCTION/);
  const ask = src('supabase/functions/ask-second/index.ts');
  assert.match(ask, /status: 410/);
  assert.doesNotMatch(ask, /handleCoachAgentHttp/);
  const plan = src('supabase/functions/suggest-client-plan/index.ts');
  assert.match(plan, /status: 410/);
});

test('an active coach link survives a missing coach-card RPC', () => {
  const store = src('src/stores/coachingStore.ts');
  const fn = store.slice(store.indexOf('get_my_coach_card'));
  assert.match(fn, /previous\?\.full_name/);
  assert.match(fn, /link\.coach_id/);
  assert.doesNotMatch(fn.slice(0, 800), /myCoach: null/);
});

test('21c: façade assembles slices and no longer owns method bodies', () => {
  const facade = readFileSync(resolve(process.cwd(), 'src/stores/coachingStore.ts'), 'utf8');
  assert.match(facade, /createRoleSlice/);
  assert.match(facade, /createClientsSlice/);
  assert.match(facade, /createMessagesSlice/);
  assert.match(facade, /createQuestionnairesSlice/);
  assert.match(facade, /createInterventionsSlice/);
  assert.match(facade, /createTrackingSlice/);
  assert.doesNotMatch(facade, /fetchMyRole: async/);
  assert.match(facade, /from '\.\.\/features\/coaching\/model\/sessionTokens'/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /fetchMyRole: async/);
  assert.match(store, /sendCoachMessage: async/);
  assert.match(store, /applyIntervention: async/);
});
