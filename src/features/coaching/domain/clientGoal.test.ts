import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { currentGoalKind, currentGoalKindsByClient, goalKindLabelKey, legacyGoalKind } from './clientGoal';
import type { Goal } from '../../goals/domain/goalLifecycle';

function goal(partial: Partial<Goal> & Pick<Goal, 'id' | 'user_id' | 'kind' | 'status' | 'started_at'>): Goal {
  return {
    title: '',
    target_weight_kg: null,
    target_date: null,
    predecessor_id: null,
    ended_at: null,
    created_by: null,
    ...partial,
  };
}

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

test('legacy profile goal maps to a goal kind, aliases included', () => {
  assert.equal(legacyGoalKind('lose'), 'cut');
  assert.equal(legacyGoalKind('gain'), 'bulk');
  assert.equal(legacyGoalKind('maintain'), 'maintain');
  // The old roster read « maintain » as « Performance »: never again.
  assert.notEqual(legacyGoalKind('maintain'), 'performance');
  assert.equal(legacyGoalKind('performance'), 'performance');
  assert.equal(legacyGoalKind(''), null);
  assert.equal(legacyGoalKind('something'), null);
});

test('current goal (athlete_goals) wins over the legacy profile goal', () => {
  const goals = [
    goal({ id: 'g1', user_id: 'u', kind: 'bulk', status: 'replaced', started_at: '2026-01-01' }),
    goal({ id: 'g2', user_id: 'u', kind: 'maintain', status: 'active', started_at: '2026-06-01' }),
  ];
  assert.equal(currentGoalKind(goals, 'performance'), 'maintain');
  // No goal history yet → the profile goal.
  assert.equal(currentGoalKind([], 'cut'), 'cut');
  // A paused goal is still the one the goal panel shows first.
  assert.equal(currentGoalKind([goal({ id: 'p', user_id: 'u', kind: 'health', status: 'paused', started_at: '2026-06-01' })], 'cut'), 'health');
});

test('batch rows resolve per client, list and file share the same label key', () => {
  const kinds = currentGoalKindsByClient([
    goal({ id: 'a', user_id: 'lea', kind: 'maintain', status: 'active', started_at: '2026-09-01' }),
    goal({ id: 'b', user_id: 'tom', kind: 'performance', status: 'maintenance', started_at: '2026-09-01' }),
  ], [
    { id: 'lea', goal: 'maintain' },
    { id: 'tom', goal: 'cut' },
    { id: 'sam', goal: 'gain' },
    { id: 'zoe', goal: '' },
  ]);
  assert.deepEqual(kinds, { lea: 'maintain', tom: 'performance', sam: 'bulk', zoe: null });
  assert.equal(goalKindLabelKey('maintain'), 'goals.kinds.maintain');

  const list = src('src/components/coaching/ClientsPage.tsx');
  const file = src('src/components/coaching/ClientDetailPage.tsx');
  for (const page of [list, file]) {
    assert.match(page, /useClientGoalKinds/);
    assert.match(page, /goalKindLabelKey/);
    assert.doesNotMatch(page, /coaching\.goalLabels/);
  }
  assert.doesNotMatch(list, /goalChipKey/);
});

test('client file header: name on two lines, readable subtitle, scroll cue on tabs', () => {
  const file = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(file, /line-clamp-2 break-words/);
  assert.doesNotMatch(file, /text-xl font-bold text-white truncate/);
  assert.match(file, /ScrollHintTabs/);
  // The closed sections say what they hold before being opened.
  assert.match(file, /client360\.moreDetailsHint/);
  assert.match(file, /client360\.questionnaireHint/);
  assert.match(file, /client360\.sheetHint/);
  assert.doesNotMatch(file, /common\.details/);
  // Ending the relationship stays visible and goes through the confirmation dialog.
  assert.match(file, /data-testid="client-file-remove"/);
  assert.match(file, /setRemoveOpen\(true\)/);
  assert.match(file, /<RemoveClientDialog/);
  assert.match(src('src/components/coaching/RemoveClientDialog.tsx'), /typeName|mismatch/);
  const tabs = src('src/components/coaching/ScrollHintTabs.tsx');
  assert.match(tabs, /aria-hidden="true"/);
  assert.match(tabs, /scrollWidth - list\.clientWidth/);
});
