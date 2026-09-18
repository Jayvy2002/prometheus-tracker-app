import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAccountSnapshot, parseAccountWorkspace, readAccountRole, resolveAccountContext } from './accountContext';

const coach = { user_id: 'A', coach_capability: true, legacy_coaching_role: 'coach', active_coach_id: null };

test('a coach may have an independent personal coaching relationship', () => {
  const solo = parseAccountSnapshot(coach, 'A');
  const coached = parseAccountSnapshot({ ...coach, active_coach_id: 'B' }, 'A');
  assert.ok(solo);
  assert.ok(coached);
  assert.equal(resolveAccountContext('coach', null, true, solo).personalCoaching, 'solo');
  const context = resolveAccountContext('coach', null, true, coached);
  assert.equal(context.personalCoaching, 'coached');
  assert.equal(context.capabilities.coach, true);
  assert.equal(context.personalToolsAvailable, true);
  assert.equal(context.activeWorkspace, 'coaching');
  assert.equal(resolveAccountContext('coach', null, true, coached, 'personal').activeWorkspace, 'personal');
  assert.equal(resolveAccountContext('coach', null, true, coached, 'coaching').activeWorkspace, 'coaching');
});

test('workspace choice is strict and only a server-confirmed coach can use it', () => {
  const snapshot = parseAccountSnapshot(coach, 'A');
  assert.equal(parseAccountWorkspace('personal'), 'personal');
  assert.equal(parseAccountWorkspace('coaching'), 'coaching');
  assert.equal(parseAccountWorkspace('admin'), null);
  assert.equal(resolveAccountContext('coach', null, true, snapshot, 'admin' as never).activeWorkspace, 'coaching');
  assert.equal(resolveAccountContext('coach', null, true, null, 'personal').activeWorkspace, 'coaching');
  assert.equal(resolveAccountContext('none', null, true, null, 'coaching').activeWorkspace, 'personal');
});

test('context rejects another account, self-link, malformed capabilities', () => {
  for (const value of [null, [], {}, { ...coach, user_id: 'B' }, { ...coach, active_coach_id: 'A' },
    { ...coach, active_coach_id: 1 }, { ...coach, active_coach_id: '' }, { ...coach, coach_capability: 'true' },
    { ...coach, error: 'denied' }]) {
    assert.equal(parseAccountSnapshot(value, 'A'), null);
  }
});

test('missing RPC is the only rollout fallback; denial and malformed data stay errors', async () => {
  let legacyCalls = 0;
  const legacy = async () => { legacyCalls++; return { data: { coaching_role: 'none' }, error: null }; };
  const missing = await readAccountRole('A', async () => ({ data: null, error: { code: 'PGRST202', message: 'missing' } }), legacy);
  assert.equal(missing.data?.coaching_role, 'none');
  assert.equal(legacyCalls, 1);
  for (const response of [
    { data: null, error: { code: '42501', message: 'denied' } },
    { data: { ...coach, user_id: 'B' }, error: null },
    { data: null, error: { code: '503', message: 'outage' } },
  ]) {
    const result = await readAccountRole('A', async () => response, legacy);
    assert.ok(result.error);
    assert.equal(result.data, null);
  }
  assert.equal(legacyCalls, 1);
});

test('one server snapshot supplies role and personal relationship without a second role read', async () => {
  const result = await readAccountRole('A', async () => ({ data: coach, error: null }), async () => { throw new Error('Unexpected fallback'); });
  assert.equal(result.error, null);
  assert.equal(result.data?.coaching_role, 'coach');
  assert.equal(result.snapshot?.userId, 'A');
});

test('an obsolete snapshot cannot override a newer role or an unresolved session', () => {
  const snapshot = parseAccountSnapshot(coach, 'A');
  assert.equal(resolveAccountContext('none', null, true, snapshot).capabilities.coach, false);
  assert.equal(resolveAccountContext('coach', null, false, snapshot).ready, false);
});

test('all four combinations use server capability independently of every legacy role', () => {
  for (const capability of [false, true]) {
    for (const activeCoachId of [null, 'B']) {
      for (const legacyRole of ['none', 'client', 'coach'] as const) {
        const snapshot = parseAccountSnapshot({ user_id: 'A', coach_capability: capability,
          active_coach_id: activeCoachId, legacy_coaching_role: legacyRole }, 'A');
        assert.ok(snapshot);
        for (const workspace of ['personal', 'coaching'] as const) {
          const ctx = resolveAccountContext(legacyRole, null, true, snapshot, workspace);
          assert.equal(ctx.capabilities.coach, capability);
          assert.equal(ctx.personalCoaching, activeCoachId ? 'coached' : 'solo');
          assert.equal(ctx.activeWorkspace, capability ? workspace : 'personal');
          assert.equal(ctx.personalToolsAvailable, true);
        }
      }
    }
  }
});
