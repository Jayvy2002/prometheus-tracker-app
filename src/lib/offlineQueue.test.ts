import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k) as string : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
} as Storage;

const {
  enqueueOfflineOp,
  peekOfflineOps,
  removeOfflineOp,
  markOfflineOpFailed,
  clearOfflineQueue,
  isTransportError,
} = await import('./offlineQueue');
const { setSessionOwner } = await import('./sessionScope');

test('D07: queue is namespaced per account and survives reload', () => {
  store.clear();
  setSessionOwner('a1');
  const op = enqueueOfflineOp('set.update', { id: 's1' });
  assert.ok(op?.id);
  assert.equal(peekOfflineOps().length, 1);
  setSessionOwner('b2');
  assert.equal(peekOfflineOps().length, 0);
  const opB = enqueueOfflineOp('set.update', { id: 's9' });
  assert.ok(opB);
  setSessionOwner('a1');
  assert.equal(peekOfflineOps().length, 1);
  assert.equal(peekOfflineOps()[0].payload.id, 's1');
  markOfflineOpFailed(op?.id as string, 'boom');
  assert.equal(peekOfflineOps()[0].attempts, 1);
  removeOfflineOp(op?.id as string);
  assert.equal(peekOfflineOps().length, 0);
  setSessionOwner('b2');
  assert.equal(peekOfflineOps().length, 1);
  clearOfflineQueue('b2');
  assert.equal(peekOfflineOps().length, 0);
  setSessionOwner(null);
});

test('D07: transport errors are distinguished from app errors', () => {
  assert.equal(isTransportError(new Error('Failed to fetch')), true);
  assert.equal(isTransportError(new Error('Load failed')), true);
  assert.equal(isTransportError({ message: 'Network request failed' }), true);
  assert.equal(isTransportError(new Error('new row violates row-level security')), false);
  assert.equal(isTransportError({ message: 'duplicate key value', code: '23505' }), false);
});

test('D07: workout mutations go through the queue with stable client ids', () => {
  const storeSrc = src('src/stores/workoutStore.ts');
  assert.match(storeSrc, /guardedMutation\(/);
  assert.match(storeSrc, /syncOfflineQueue/);
  assert.match(storeSrc, /replayOfflineOp/);
  assert.match(storeSrc, /client_op_id/);
  assert.match(storeSrc, /offlineTempId\(op\.id\)/);
  assert.match(storeSrc, /pendingOps/);
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /useOnline\(\)/);
  assert.match(form, /workout\.syncPending/);
  const app = src('src/App.tsx');
  assert.match(app, /syncOfflineQueue\(\)/);
  assert.match(app, /window\.addEventListener\('online'/);
  const mig = src('supabase/migrations/20260910000005_audit_continuity.sql');
  assert.match(mig, /client_op_id/);
  assert.match(mig, /workouts_client_op_uidx/);
});
