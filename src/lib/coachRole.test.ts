import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCoachedAthlete, isSoloAthlete } from './coachRole';
import { resolveLegacyAccountContext } from './accountContext';

test('coached clients never get coach chrome; solo can still enable coach mode', () => {
  assert.equal(isCoachedAthlete('client', { id: 'coach-1' }), true);
  assert.equal(isCoachedAthlete('client', null), true);
  assert.equal(isCoachedAthlete('none', { id: 'coach-1' }), true);
  assert.equal(isCoachedAthlete('none', null), false);
  assert.equal(isCoachedAthlete('coach', null), false);
  assert.equal(isCoachedAthlete('coach', { id: 'other' }), false);
  assert.equal(isSoloAthlete('none', null), true);
  assert.equal(isSoloAthlete('client', null), false);
  assert.equal(isSoloAthlete('coach', null), false);
});

test('account context keeps all legacy role/link combinations compatible', () => {
  for (const role of ['none', 'client', 'coach'] as const) {
    for (const link of [undefined, null, {}, { id: 'coach-1' }]) {
      const context = resolveLegacyAccountContext(role, link);
      assert.equal(context.capabilities.coach, role === 'coach');
      assert.equal(context.personalToolsAvailable, role !== 'coach');
      assert.equal(context.defaultWorkspace, role === 'coach' ? 'coaching' : 'personal');
      assert.equal(context.personalCoaching === 'coached', role === 'client' || (!!link && role !== 'coach'));
      assert.equal(context.personalCoaching === 'solo', role === 'none' && !link);
    }
  }
});

test('unresolved role must not expose professional or personal actions', () => {
  for (const role of ['none', 'client', 'coach'] as const) {
    const context = resolveLegacyAccountContext(role, { id: 'stale-coach' }, false);
    assert.equal(context.ready, false);
    assert.equal(context.capabilities.coach, false);
    assert.equal(context.personalToolsAvailable, false);
    assert.equal(context.personalCoaching, 'unresolved');
  }
});

test('legacy professional role does not invent a personal solo or coaching relationship', () => {
  assert.equal(resolveLegacyAccountContext('coach', null).personalCoaching, 'unresolved');
  assert.equal(resolveLegacyAccountContext('coach', { id: 'another-coach' }).personalCoaching, 'unresolved');
});

test('a missing preview does not grant solo authority to a linked client', () => {
  assert.equal(resolveLegacyAccountContext('client', null).personalCoaching, 'coached');
  assert.equal(isSoloAthlete('client', null), false);
});

test('a stale none role with a coach remains restricted until reconciliation', () => {
  assert.equal(resolveLegacyAccountContext('none', { id: 'coach-1' }).personalCoaching, 'coached');
  assert.equal(isSoloAthlete('none', { id: 'coach-1' }), false);
});

test('departure projection does not mutate previous account context', () => {
  const before = resolveLegacyAccountContext('client', { id: 'coach-1' });
  const after = resolveLegacyAccountContext('none', null);
  assert.equal(before.personalCoaching, 'coached');
  assert.equal(after.personalCoaching, 'solo');
  assert.equal(after.capabilities.coach, false);
});
