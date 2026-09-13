import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRelationshipAccess, relationshipLinkChangeNeedsRecheck, type RelationshipAccess } from './relationshipAccess';

function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(r => { resolve = r; });
  return { promise, resolve };
}

test('a last-visit update on an active link does not require hiding the dossier', () => {
  assert.equal(relationshipLinkChangeNeedsRecheck({
    eventType: 'UPDATE',
    new: { status: 'active', last_visited_at: '2026-09-13T18:20:00Z' },
    old: { status: 'active', last_visited_at: null },
  }), false);
  assert.equal(relationshipLinkChangeNeedsRecheck({ eventType: 'INSERT', new: { status: 'active' } }), true);
  assert.equal(relationshipLinkChangeNeedsRecheck({
    eventType: 'UPDATE',
    new: { status: 'ended' },
    old: { status: 'active' },
  }), true);
});

test('the client 360 keeps the dossier visible while access is rechecked', () => {
  const boundary = readFileSync(resolve(process.cwd(), 'src/components/coaching/ActiveRelationshipBoundary.tsx'), 'utf8');
  assert.match(boundary, /relationshipLinkChangeNeedsRecheck/);
  assert.match(boundary, /check\(false\)/);
  assert.doesNotMatch(boundary, /invalidate\('checking'\)/);
  assert.doesNotMatch(boundary, /seenAllowed/);
  assert.match(boundary, /result\?\.scope === scope/);
  const page = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientDetailPage.tsx'), 'utf8');
  assert.match(page, /touchClientVisit\(id\)/);
});

test('a stale authorized response cannot reopen a revoked dossier', async () => {
  const pending = deferred();
  const states: RelationshipAccess[] = [];
  const access = createRelationshipAccess(() => pending.promise, s => states.push(s));
  const read = access.check();
  access.invalidate('ended');
  pending.resolve(true);
  await read;
  assert.deepEqual(states, ['checking', 'ended']);
});

test('failed revalidation hides private content and allows an explicit retry', async () => {
  const states: RelationshipAccess[] = [];
  let fail = false;
  const access = createRelationshipAccess(async () => {
    if (fail) throw Error('offline');
    return true;
  }, s => states.push(s));
  await access.check();
  fail = true;
  await access.check(false);
  fail = false;
  await access.check();
  assert.deepEqual(states, ['checking', 'allowed', 'unavailable', 'checking', 'allowed']);
});

test('a prior account or route cannot publish after disposal', async () => {
  const pending = deferred();
  const states: RelationshipAccess[] = [];
  const access = createRelationshipAccess(() => pending.promise, s => states.push(s));
  const read = access.check();
  access.dispose();
  pending.resolve(true);
  await read;
  await access.check();
  assert.deepEqual(states, ['checking']);
});

test('newer absence of a relationship wins over an older success', async () => {
  const pending = deferred();
  const states: RelationshipAccess[] = [];
  let first = true;
  const access = createRelationshipAccess(() => {
    if (first) {
      first = false;
      return pending.promise;
    }
    return Promise.resolve(false);
  }, s => states.push(s));
  const old = access.check();
  await access.check();
  pending.resolve(true);
  await old;
  assert.equal(states.at(-1), 'ended');
});
