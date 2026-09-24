import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { latestMigrationContaining, migrationsSql } from './migrationScan';
import { coachingStoreSource } from './coachingStoreSource';

const src = (p: string) => p === 'src/stores/coachingStore.ts' ? coachingStoreSource() : readFileSync(resolve(process.cwd(), p), 'utf8');

test('D01: program saves go through atomic server RPCs, no silent fallback', () => {
  const store = src('src/stores/programStore.ts');
  assert.match(store, /rpc\('save_program'/);
  assert.match(store, /rpc\('create_program_complete'/);
  assert.match(store, /rpc\('assign_program_secure'/);
  assert.doesNotMatch(store, /rpc\('save_program_day_exercises'/);
  assert.doesNotMatch(store, /rpc\('sync_program_days'/);
  assert.doesNotMatch(store, /from\('program_day_exercises'\)\.delete\(\)/);
  assert.doesNotMatch(store, /from\('program_day_exercises'\)\.insert\(/);
  const createFn = store.slice(store.indexOf('createProgram: async'));
  assert.doesNotMatch(createFn.slice(0, 900), /from\('programs'\)\s*\.insert/);
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.create_program_complete').sql;
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.create_program_complete/);
  assert.match(mig, /Validation complète AVANT toute mutation/);
});

test('D02: validations with effects apply once via applyIntervention', () => {
  for (const page of [
    'src/components/coaching/InterventionDraftPage.tsx',
    'src/components/coaching/ClientSetupPage.tsx',
    'src/components/dashboard/SoloProgramProposal.tsx',
  ]) {
    const code = src(page);
    assert.match(code, /applyIntervention\(/);
    assert.doesNotMatch(code, /claimIntervention\(/);
    assert.doesNotMatch(code, /finalizeIntervention\(/);
  }
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /rpc\('apply_intervention'/);
  assert.match(store, /loadOrCreateInterventionKeys/);
  assert.match(store, /p_client_msg_id: effects\.message \? keys\.clientMsgId : null/);
  const keys = src('src/lib/idempotencyKeys.ts');
  assert.match(keys, /prometheus_idempotency/);
  assert.match(keys, /clientMsgId/);
  // Setup marks completion only after targets + program, inside the same RPC payload.
  const setup = src('src/components/coaching/ClientSetupPage.tsx');
  assert.match(setup, /setup_completed_at: new Date/);
  assert.match(setup, /applyIntervention\(/);
});

test('D03: profile writes return errors; intake drafts are sequenced and visible', () => {
  const profile = src('src/stores/profileStore.ts');
  assert.match(profile, /Promise<\{ error: string \| null \}>/);
  assert.match(profile, /if \(error\) return \{ error: error\.message \}/);
  const decide = src('src/stores/soloCopilotStore.ts');
  assert.match(decide, /if \(committed\.error\)/);
  assert.match(decide, /commit_solo_weekly_review_decision_unavailable/);
  assert.doesNotMatch(decide, /updateProfile/);
  const recipe = src('src/stores/recipeStore.ts');
  assert.match(recipe, /deleteRecipe: \(id: string\) => Promise<\{ error: string \| null \}>/);
  const fav = src('src/stores/nutritionStore.ts');
  // D03: the favourite leaves the store only after the server delete succeeded.
  const removeFav = fav.slice(fav.indexOf("from('food_favorites').delete()"));
  assert.ok(removeFav.indexOf('if (error)') < removeFav.indexOf('favorites: s.favorites.filter'));
  assert.ok(removeFav.indexOf('if (error)') >= 0);
});

test('C02: message drafts survive failure; threads paginate; sends are idempotent', () => {
  const thread = src('src/components/coaching/MessageThread.tsx');
  assert.match(thread, /onSend: \(body: string, extras: ThreadSendExtras\) => Promise<\{ error: string \| null \}>/);
  // C02: on a failed send the draft is kept — the error branch returns before any clear.
  const sendBlock = thread.slice(thread.indexOf('const result = await onSend(trimmed, extras);'));
  assert.ok(sendBlock.length > 0 && thread.includes('const result = await onSend(trimmed, extras);'));
  assert.ok(sendBlock.indexOf('if (result.error)') < sendBlock.indexOf("setBody('')"));
  assert.match(sendBlock.slice(sendBlock.indexOf('if (result.error)'), sendBlock.indexOf("setBody('')")), /return;/);
  assert.match(thread, /onLoadMore/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /client_msg_id: msgId/);
  assert.match(store, /rpc\('fetch_thread_messages'/);
  assert.match(store, /rpc\('count_unread_messages'/);
  assert.match(store, /error\.code === '23505'/);
});

test('I05: calorie decisions snapshot server values; lessons are manageable', () => {
  const mig = migrationsSql();
  assert.match(mig, /applied_values/);
  assert.match(mig, /ADD COLUMN IF NOT EXISTS disabled boolean/);
  const agent = src('supabase/functions/_shared/coachAgent.ts');
  assert.match(agent, /\.eq\("disabled", false\)/);
  const learned = src('src/components/coaching/CoachLearnedPage.tsx');
  assert.match(learned, /toggleLesson/);
  assert.match(learned, /deleteLesson/);
});
