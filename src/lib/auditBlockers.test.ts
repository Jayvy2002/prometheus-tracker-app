import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { latestMigrationContaining } from './migrationScan';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('D01: create_program_complete is the only create path and snapshots', () => {
  const mig = latestMigrationContaining('create_program_complete').sql;
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
  const store = src('src/stores/coachingStore.ts');
  assert.doesNotMatch(store, /clearInterventionKeys/);
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
