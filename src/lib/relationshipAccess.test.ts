import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRelationshipAccess, type RelationshipAccess } from './relationshipAccess';

function deferred() { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(r => { resolve = r; }); return { promise, resolve }; }
test('a stale authorized response cannot reopen a revoked dossier', async () => {
  const pending = deferred(); const states: RelationshipAccess[] = [];
  const access = createRelationshipAccess(() => pending.promise, s => states.push(s));
  const read = access.check(); access.invalidate('ended'); pending.resolve(true); await read;
  assert.deepEqual(states, ['checking', 'ended']);
});
test('failed revalidation hides private content and allows an explicit retry', async () => {
  const states: RelationshipAccess[] = []; let fail = false;
  const access = createRelationshipAccess(async () => { if (fail) throw Error('offline'); return true; }, s => states.push(s));
  await access.check(); fail = true; await access.check(false); fail = false; await access.check();
  assert.deepEqual(states, ['checking', 'allowed', 'unavailable', 'checking', 'allowed']);
});
test('a prior account or route cannot publish after disposal', async () => {
  const pending = deferred(); const states: RelationshipAccess[] = [];
  const access = createRelationshipAccess(() => pending.promise, s => states.push(s));
  const read = access.check(); access.dispose(); pending.resolve(true); await read; await access.check();
  assert.deepEqual(states, ['checking']);
});
test('newer absence of a relationship wins over an older success', async () => {
  const pending = deferred(); const states: RelationshipAccess[] = []; let first = true;
  const access = createRelationshipAccess(() => { if (first) { first = false; return pending.promise; } return Promise.resolve(false); }, s => states.push(s));
  const old = access.check(); await access.check(); pending.resolve(true); await old;
  assert.equal(states.at(-1), 'ended');
});
