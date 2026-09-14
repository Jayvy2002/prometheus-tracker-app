import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureSession, setSessionOwner } from './sessionScope';

test('a completed logout invalidates old requests even after the same account returns', () => {
  setSessionOwner('account-a');
  const beforeLogout = captureSession();
  assert.equal(beforeLogout(), true);
  setSessionOwner(null);
  setSessionOwner('account-a');
  assert.equal(beforeLogout(), false);
  assert.equal(captureSession('account-b')(), false);
  const refreshed = captureSession();
  setSessionOwner('account-a');
  assert.equal(refreshed(), true);
  setSessionOwner(null);
});
