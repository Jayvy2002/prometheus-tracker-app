import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directInviteConsentArgs, DIRECT_INVITE_CONSENT_SCOPES, DIRECT_INVITE_CONSENT_VERSION } from './relationshipConsent';

test('direct invitation sends one explicit, versioned and duplicate-free scope', () => {
  const args = directInviteConsentArgs();
  assert.equal(args.p_consent_version, 1);
  assert.equal(DIRECT_INVITE_CONSENT_VERSION, 1);
  assert.deepEqual(args.p_scopes, [...DIRECT_INVITE_CONSENT_SCOPES]);
  assert.equal(new Set(args.p_scopes).size, args.p_scopes.length);
  assert.deepEqual(args.p_scopes, [...args.p_scopes].sort());
});
