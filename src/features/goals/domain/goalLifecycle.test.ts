import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { GOAL_TRANSITIONS, focusGoal, goalActions, goalHistory, isBodyGoal, lastReason, type Goal, type GoalEvent, type GoalStatus } from './goalLifecycle';

const goal = (id: string, status: GoalStatus, started_at: string, kind: Goal['kind'] = 'cut'): Goal => ({
  id, user_id: 'u', kind, title: '', target_weight_kg: null, target_date: null, status,
  predecessor_id: null, started_at, ended_at: null, created_by: 'u',
});

test('the buttons mirror the database transitions exactly', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260924130000_goal_lifecycle.sql'), 'utf8');
  for (const [from, tos] of Object.entries(GOAL_TRANSITIONS)) {
    if (tos.length === 0) continue;
    const line = new RegExp(`WHEN '${from}' THEN p_to IN \\(([^)]*)\\)`).exec(sql);
    assert.ok(line, `no SQL rule for ${from}`);
    const sqlTos = line[1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    assert.deepEqual(sqlTos, [...tos].sort(), `transitions from ${from}`);
  }
  assert.deepEqual(GOAL_TRANSITIONS.replaced, []);
  assert.deepEqual(GOAL_TRANSITIONS.abandoned, []);
});

test('the current goal comes first; a paused one waits to resume; the rest is history', () => {
  const goals = [goal('a', 'replaced', '2026-01-01'), goal('b', 'paused', '2026-03-01'), goal('c', 'reached', '2026-02-01')];
  assert.equal(focusGoal(goals)?.id, 'b');
  const withActive = [...goals, goal('d', 'active', '2026-04-01', 'performance')];
  assert.equal(focusGoal(withActive)?.id, 'd');
  assert.deepEqual(goalHistory(withActive, focusGoal(withActive)).map(g => g.id), ['b', 'c', 'a']);
  assert.equal(focusGoal([]), null);
});

test('only body goals drive the calorie calculators', () => {
  assert.equal(isBodyGoal('cut'), true);
  assert.equal(isBodyGoal('performance'), false);
});

test('a human reason is shown; system markers are not', () => {
  const g = goal('a', 'paused', '2026-01-01');
  const ev = (reason: string, at: string): GoalEvent => ({ id: at, goal_id: 'a', from_status: 'active', to_status: 'paused', reason, metrics: {}, actor_id: null, occurred_at: at });
  assert.equal(lastReason(g, [ev('Knee pain', '2026-02-01'), ev('profile', '2026-03-01')]), 'Knee pain');
  assert.equal(lastReason(g, [ev('migrated', '2026-02-01')]), '');
});

test('a maintain goal offers no « reached » nor « switch to maintenance »', () => {
  assert.deepEqual(goalActions({ kind: 'maintain', status: 'active' }), ['paused', 'abandoned']);
  assert.deepEqual(goalActions({ kind: 'cut', status: 'active' }), ['reached', 'maintenance', 'paused', 'abandoned']);
  assert.deepEqual(goalActions({ kind: 'maintain', status: 'paused' }), ['active', 'abandoned']);
});
