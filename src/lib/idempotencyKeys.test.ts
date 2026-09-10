import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOrCreateInterventionKeys, loadOrCreateMessageKey } from './idempotencyKeys';
import { setSessionOwner } from './sessionScope';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k) as string : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
} as Storage;

test('D02: intervention keys survive reload with the same client_msg_id', () => {
  store.clear();
  setSessionOwner('coach-1');
  const first = loadOrCreateInterventionKeys('int-1');
  const again = loadOrCreateInterventionKeys('int-1');
  assert.equal(again.claimKey, first.claimKey);
  assert.equal(again.idempotencyKey, first.idempotencyKey);
  assert.equal(again.clientMsgId, first.clientMsgId);
  setSessionOwner('coach-2');
  const other = loadOrCreateInterventionKeys('int-1');
  assert.notEqual(other.idempotencyKey, first.idempotencyKey);
  setSessionOwner(null);
});

test('D02: message keys stay stable for the same body and rotate on edit', () => {
  store.clear();
  setSessionOwner('coach-1');
  const a = loadOrCreateMessageKey('thread-1', 'hello');
  const b = loadOrCreateMessageKey('thread-1', 'hello');
  assert.equal(a, b);
  const c = loadOrCreateMessageKey('thread-1', 'hello world');
  assert.notEqual(a, c);
  setSessionOwner(null);
});
