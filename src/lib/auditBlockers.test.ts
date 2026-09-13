import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { latestMigrationContaining } from './migrationScan';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('D01: create_program_complete is the only create path and snapshots', () => {
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.create_program_complete').sql;
  assert.match(mig, /p_assign_client_id uuid DEFAULT NULL/);
  assert.match(mig, /PERFORM public\.snapshot_program_revision/);
  assert.match(mig, /Toute erreur annule tout/);
  const store = src('src/stores/programStore.ts');
  assert.match(store, /rpc\('create_program_complete'/);
  const coaching = src('src/stores/coachingStore.ts');
  assert.match(coaching, /assignClientId: clientId/);
});

test('D02: apply_intervention persists idempotency_key and client_msg_id', () => {
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.apply_intervention').sql;
  assert.match(mig, /idempotency_key/);
  assert.match(mig, /client_msg_id/);
  assert.match(mig, /pg_advisory_xact_lock/);
  assert.match(mig, /replayed/);
  assert.match(mig, /assert_client_target/);
  assert.match(mig, /Not authorized for this client/);
  const store = src('src/stores/coachingStore.ts');
  assert.doesNotMatch(store, /clearInterventionKeys/);
});

test('apply_intervention p_id NULL requires self or an active locked link before any write', () => {
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.assert_client_target').sql;
  assert.match(mig, /p_client = auth\.uid\(\)/);
  assert.match(mig, /FOR SHARE/);
  assert.match(mig, /Not authorized for this client/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.assert_client_target/);
  const apply = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.apply_intervention').sql;
  assert.match(apply, /IF p_id IS NULL THEN/);
  assert.match(apply, /PERFORM public\.assert_client_target\(v_client\)/);
  const matrix = src('supabase/tests/rls_matrix.sql');
  assert.match(matrix, /RPC_APPLY_NULL_CROSS/);
  assert.match(matrix, /idem-null-cross/);
  assert.match(matrix, /n_idm2 = 0/);
});

test('D07: workout drain never drops ops after 3 failures and never slices to 200', () => {
  const queue = src('src/lib/offlineQueue.ts');
  assert.doesNotMatch(queue, /slice\(-200\)/);
  assert.match(queue, /moveOfflineOpToDeadLetter/);
  assert.match(queue, /error: 'no_account' \| 'quota'/);
  const store = src('src/stores/workoutStore.ts');
  assert.match(store, /persistIdMap/);
  assert.match(store, /nextAttempts >= 3/);
  assert.match(store, /moveOfflineOpToDeadLetter/);
  assert.doesNotMatch(store, /removeOfflineOp\(op\.id.*nextAttempts/);
});

test('replay local: Git-clock files skip tables that never existed', () => {
  const rls = src('supabase/migrations/20260824233734_optimize_rls_policies_select_auth_uid.sql');
  assert.match(rls, /to_regclass\('public\.calorie_adjustment_suggestions'\)/);
  const push = src('supabase/migrations/20260824233919_push_notifications.sql');
  assert.match(push, /to_regclass\('public\.user_profiles'\)/);
  const checkins = src('supabase/migrations/20260824234036_add_daily_checkins_and_extend_coaching.sql');
  assert.match(checkins, /to_regclass\('public\.coaching_recommendations'\)/);
  const perf = src('supabase/migrations/20260824233846_performance_and_integrity.sql');
  assert.doesNotMatch(perf, /ADD CONSTRAINT IF NOT EXISTS chk_/);
  assert.match(perf, /CREATE OR REPLACE FUNCTION public\.update_updated_at/);
});
