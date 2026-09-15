import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { latestMigrationContaining } from './migrationScan';

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
  peekDeadLetterOps,
  peekAllOfflineOps,
  removeOfflineOp,
  markOfflineOpFailed,
  moveOfflineOpToDeadLetter,
  retryDeadLetterOp,
  loadIdMap,
  persistIdMap,
  clearOfflineQueue,
  isTransportError,
  offlineOpLabelKey,
} = await import('./offlineQueue');
const { setSessionOwner } = await import('./sessionScope');

test('D07: queue is namespaced per account and survives reload', () => {
  store.clear();
  setSessionOwner('a1');
  const queued = enqueueOfflineOp('set.update', { id: 's1' });
  assert.equal(queued.ok, true);
  if (!queued.ok) throw new Error('expected enqueue');
  assert.ok(queued.op.id);
  assert.equal(peekOfflineOps().length, 1);
  setSessionOwner('b2');
  assert.equal(peekOfflineOps().length, 0);
  const opB = enqueueOfflineOp('set.update', { id: 's9' });
  assert.ok(opB.ok);
  setSessionOwner('a1');
  assert.equal(peekOfflineOps().length, 1);
  assert.equal(peekOfflineOps()[0].payload.id, 's1');
  markOfflineOpFailed(queued.op.id, 'boom');
  assert.equal(peekOfflineOps()[0].attempts, 1);
  removeOfflineOp(queued.op.id);
  assert.equal(peekOfflineOps().length, 0);
  setSessionOwner('b2');
  assert.equal(peekOfflineOps().length, 1);
  clearOfflineQueue('b2');
  assert.equal(peekOfflineOps().length, 0);
  setSessionOwner(null);
});

test('UX16: queued mutations have everyday-language keys, not set.add', () => {
  assert.equal(offlineOpLabelKey('set.add'), 'workout.offlineOp.setAdd');
  assert.equal(offlineOpLabelKey('workout.create'), 'workout.offlineOp.create');
  assert.equal(offlineOpLabelKey('mystery'), 'workout.offlineOp.generic');
  const fr = src('src/i18n/locales/fr/workout.ts');
  assert.match(fr, /conservées sur cet appareil/);
  assert.match(fr, /setAdd: 'Ajouter une série'/);
});

test('D07: transport errors are distinguished from app errors', () => {
  assert.equal(isTransportError(new Error('Failed to fetch')), true);
  assert.equal(isTransportError(new Error('Load failed')), true);
  assert.equal(isTransportError({ message: 'Network request failed' }), true);
  assert.equal(isTransportError(new Error('new row violates row-level security')), false);
  assert.equal(isTransportError({ message: 'duplicate key value', code: '23505' }), false);
});

test('D07: workout mutations go through the queue with stable client ids', () => {
  const storeSrc = src('src/stores/workoutStore.ts') + src('src/features/workout/data/loadFullWorkout.ts') + src('src/features/workout/data/replayOfflineOp.ts') + src('src/features/workout/data/offlineIds.ts');
  assert.match(storeSrc, /guardedMutation\(/);
  assert.match(storeSrc, /syncOfflineQueue/);
  assert.match(storeSrc, /replayOfflineOp/);
  assert.match(storeSrc, /client_op_id/);
  assert.match(storeSrc, /offlineTempId\(op\.id\)/);
  assert.match(storeSrc, /pendingOps/);
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /useOnline\(\)/);
  assert.match(form, /workout\.syncPending/);
  assert.match(form, /peekDeadLetterOps/);
  assert.match(form, /workout\.syncDeadLetter/);
  assert.match(form, /workout\.syncQuota/);
  assert.match(form, /offlineOpLabelKey/);
  assert.doesNotMatch(form, /\{op\.type\}/);
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /syncOfflineQueue\(\)/);
  assert.match(app, /window\.addEventListener\('online'/);
  const mig = latestMigrationContaining('workouts_client_op_uidx').sql;
  assert.match(mig, /client_op_id/);
  assert.match(mig, /workouts_client_op_uidx/);
});

test('D07: temp→real id map is persisted across reloads', () => {
  store.clear();
  setSessionOwner('a1');
  persistIdMap(new Map([['local-1', 'real-1'], ['local-2', 'real-2']]), 'a1');
  const loaded = loadIdMap('a1');
  assert.equal(loaded.get('local-1'), 'real-1');
  assert.equal(loaded.get('local-2'), 'real-2');
  setSessionOwner(null);
});

test('D07: three failures move to a retryable dead-letter, never drop the op', () => {
  store.clear();
  setSessionOwner('a1');
  const queued = enqueueOfflineOp('set.update', { id: 'dead' });
  assert.equal(queued.ok, true);
  if (!queued.ok) throw new Error('expected enqueue');
  moveOfflineOpToDeadLetter(queued.op.id, 'fail 3', 'a1');
  assert.equal(peekOfflineOps('a1').length, 0);
  assert.equal(peekDeadLetterOps('a1').length, 1);
  assert.equal(peekAllOfflineOps('a1').length, 1);
  retryDeadLetterOp(queued.op.id, 'a1');
  assert.equal(peekOfflineOps('a1').length, 1);
  assert.equal(peekDeadLetterOps('a1').length, 0);
  setSessionOwner(null);
});

test('D07: queue is not truncated at 200 and quota is explicit', () => {
  store.clear();
  setSessionOwner('a1');
  for (let i = 0; i < 201; i++) {
    const queued = enqueueOfflineOp('set.update', { i }, 'a1');
    assert.equal(queued.ok, true);
  }
  assert.equal(peekAllOfflineOps('a1').length, 201);
  const original = store.get('prometheus_offline_queue_a1');
  const ls = globalThis.localStorage as Storage;
  ls.setItem = () => {
    const err = new Error('QuotaExceededError');
    err.name = 'QuotaExceededError';
    throw err;
  };
  const blocked = enqueueOfflineOp('set.update', { i: 999 }, 'a1');
  assert.equal(queuedOk(blocked), false);
  if (blocked.ok) throw new Error('expected quota');
  assert.equal(blocked.error, 'quota');
  ls.setItem = (k: string, v: string) => { store.set(k, v); };
  // File inchangée après le refus quota.
  assert.equal(store.get('prometheus_offline_queue_a1'), original);
  setSessionOwner(null);
});

function queuedOk(result: { ok: boolean }): result is { ok: true } {
  return result.ok;
}
