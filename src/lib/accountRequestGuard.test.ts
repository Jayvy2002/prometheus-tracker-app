import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createAccountMutationGuard, createAccountRequestGuard } from './accountRequestGuard';
import { setSessionOwner } from './sessionScope';

afterEach(() => setSessionOwner(null));

test('a read never revives after logout or another account, even without store reset', () => {
  for (const intermediate of [null, 'B']) {
    setSessionOwner('A');
    const guard = createAccountRequestGuard();
    const current = guard.begin('A')!;
    assert.equal(current(), true);
    setSessionOwner(intermediate);
    assert.equal(current(), false);
    setSessionOwner('A');
    assert.equal(current(), false);
    assert.equal(guard.begin('A')!(), true);
  }
});

test('refreshing the same owner preserves reads and the mutation lock', () => {
  setSessionOwner('A');
  const read = createAccountRequestGuard().begin('A')!;
  const guard = createAccountMutationGuard();
  const write = guard.begin('A')!;
  setSessionOwner('A');
  assert.equal(read(), true);
  assert.equal(write.isCurrent(), true);
  assert.equal(guard.pending(), true);
  assert.equal(guard.begin('A'), null);
  write.finish();
  assert.equal(guard.pending(), false);
});

test('old mutation completion cannot release a new session lock', () => {
  for (const intermediate of [null, 'B']) {
    setSessionOwner('A');
    const guard = createAccountMutationGuard();
    const old = guard.begin('A')!;
    setSessionOwner(intermediate);
    setSessionOwner('A');
    assert.equal(old.isCurrent(), false);
    assert.equal(guard.pending(), false);
    const fresh = guard.begin('A')!;
    old.finish();
    assert.equal(fresh.isCurrent(), true);
    assert.equal(guard.pending(), true);
    assert.equal(guard.begin('A'), null);
    fresh.finish();
    assert.equal(guard.pending(), false);
  }
});

test('stale callers, superseded reads and explicit invalidation remain rejected', () => {
  setSessionOwner('A');
  const reads = createAccountRequestGuard();
  const first = reads.begin('A')!;
  assert.equal(reads.begin('B'), null);
  assert.equal(first(), true);
  const second = reads.begin('A')!;
  assert.equal(first(), false);
  reads.invalidate();
  assert.equal(second(), false);
  const writes = createAccountMutationGuard();
  assert.equal(writes.begin('B'), null);
  const old = writes.begin('A')!;
  writes.invalidate();
  const fresh = writes.begin('A')!;
  old.finish();
  assert.equal(old.isCurrent(), false);
  assert.equal(fresh.isCurrent(), true);
  assert.equal(writes.pending(), true);
});
