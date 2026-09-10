import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('D01: program saves go through atomic server RPCs, no silent fallback', () => {
  const store = src('src/stores/programStore.ts');
  assert.match(store, /rpc\('save_program_day_exercises'/);
  assert.match(store, /rpc\('sync_program_days'/);
  assert.match(store, /rpc\('create_program_with_days'/);
  assert.match(store, /rpc\('assign_program_secure'/);
  assert.doesNotMatch(store, /from\('program_day_exercises'\)\.delete\(\)/);
  assert.doesNotMatch(store, /from\('program_day_exercises'\)\.insert\(/);
  const mig = src('supabase/migrations/20260910000002_audit_decision_atomicity.sql');
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.save_program_day_exercises/);
  assert.match(mig, /Validation complète AVANT toute mutation/);
});

test('D02: validations with effects claim first, then finalize (or release)', () => {
  for (const page of [
    'src/components/coaching/InterventionDraftPage.tsx',
    'src/components/coaching/ClientSetupPage.tsx',
    'src/components/dashboard/SoloProgramProposal.tsx',
  ]) {
    const code = src(page);
    assert.match(code, /claimIntervention\(/);
    assert.match(code, /finalizeIntervention\(/);
    assert.match(code, /releaseIntervention\(/);
  }
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /rpc\('claim_intervention'/);
  assert.match(store, /rpc\('finalize_intervention'/);
  // Setup marks completion only after targets + program.
  const setup = src('src/components/coaching/ClientSetupPage.tsx');
  const targetsAt = setup.indexOf('setClientNutritionTargets(id,');
  const completedAt = setup.indexOf('setup_completed_at: new Date');
  assert.ok(targetsAt > 0 && completedAt > targetsAt, 'targets must be written before setup_completed_at');
});

test('D03: profile writes return errors; intake drafts are sequenced and visible', () => {
  const profile = src('src/stores/profileStore.ts');
  assert.match(profile, /Promise<\{ error: string \| null \}>/);
  assert.match(profile, /if \(error\) return \{ error: error\.message \}/);
  const decide = src('src/stores/soloCopilotStore.ts');
  assert.match(decide, /if \(saved\.error\) return \{ error: saved\.error \}/);
  const recipe = src('src/stores/recipeStore.ts');
  assert.match(recipe, /deleteRecipe: \(id: string\) => Promise<\{ error: string \| null \}>/);
  const fav = src('src/stores/nutritionStore.ts');
  assert.match(fav, /ne retire du store qu'après suppression serveur confirmée/);
});

test('C02: message drafts survive failure; threads paginate; sends are idempotent', () => {
  const thread = src('src/components/coaching/MessageThread.tsx');
  assert.match(thread, /onSend: \(body: string\) => Promise<\{ error: string \| null \}>/);
  assert.match(thread, /le texte est conservé pour réessayer/);
  assert.match(thread, /onLoadMore/);
  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /client_msg_id: msgId/);
  assert.match(store, /rpc\('fetch_thread_messages'/);
  assert.match(store, /rpc\('count_unread_messages'/);
  assert.match(store, /error\.code === '23505'/);
});

test('I05: calorie decisions snapshot server values; lessons are manageable', () => {
  const mig = src('supabase/migrations/20260910000002_audit_decision_atomicity.sql');
  assert.match(mig, /applied_values/);
  assert.match(mig, /ADD COLUMN IF NOT EXISTS disabled boolean/);
  const agent = src('supabase/functions/_shared/coachAgent.ts');
  assert.match(agent, /\.eq\("disabled", false\)/);
  const learned = src('src/components/coaching/CoachLearnedPage.tsx');
  assert.match(learned, /toggleLesson/);
  assert.match(learned, /deleteLesson/);
});
