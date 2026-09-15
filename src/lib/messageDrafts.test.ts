import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  composeThreadBody,
  confirmedReadIds,
  dismissHomeMessage,
  isHomeMessageDismissed,
  loadMessageDraft,
  messageDraftKey,
  saveMessageDraft,
} from './messageDrafts';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = value; },
    removeItem: (key: string) => { delete data[key]; },
    data,
  };
}

test('drafts are stored per account and conversation and survive a leave/return', () => {
  const storage = memoryStorage();
  saveMessageDraft('coach', 'client-a', 'keep this', storage);
  saveMessageDraft('coach', 'client-b', 'other thread', storage);
  assert.equal(loadMessageDraft('coach', 'client-a', storage), 'keep this');
  assert.equal(loadMessageDraft('coach', 'client-b', storage), 'other thread');
  assert.equal(loadMessageDraft('other-account', 'client-a', storage), '');
  assert.equal(messageDraftKey('coach', 'client-a').includes('coach:client-a'), true);
});

test('a prefilled relance never replaces a personal draft', () => {
  assert.equal(composeThreadBody('my note', 'Hey {{name}}'), 'my note');
  assert.equal(composeThreadBody('  ', 'Hey Marc'), 'Hey Marc');
  assert.equal(composeThreadBody('', undefined), '');
});

test('dismissing the home card is local and is not a read receipt', () => {
  const storage = memoryStorage();
  assert.equal(isHomeMessageDismissed('u1', 'm1', storage), false);
  dismissHomeMessage('u1', 'm1', storage);
  assert.equal(isHomeMessageDismissed('u1', 'm1', storage), true);
  assert.equal(isHomeMessageDismissed('u1', 'm2', storage), false);
});

test('read_at is applied only for ids the server confirmed', () => {
  assert.deepEqual(confirmedReadIds([{ id: 'a' }, { id: 'b' }]), ['a', 'b']);
  assert.deepEqual(confirmedReadIds([]), []);
  assert.deepEqual(confirmedReadIds(null), []);
});

test('thread, home and store honor durable drafts and proven reads', () => {
  const thread = src('src/components/coaching/MessageThread.tsx');
  assert.match(thread, /composeThreadBody/);
  assert.match(thread, /saveMessageDraft/);
  assert.match(thread, /clearMessageDraft/);

  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /dismissHomeMessage/);
  assert.doesNotMatch(dash, /markCoachMessageRead/);

  const store = src('src/stores/coachingStore.ts');
  const markOne = store.slice(store.indexOf('markCoachMessageRead: async'), store.indexOf('markThreadRead: async'));
  assert.match(markOne, /\.select\('id'\)/);
  assert.match(markOne, /confirmedReadIds/);
  const markThread = store.slice(store.indexOf('markThreadRead: async'), store.indexOf('fetchCoachSettings: async'));
  assert.match(markThread, /\.select\('id'\)/);
  assert.match(markThread, /confirmedReadIds/);
  assert.match(markThread, /if \(error\) return/);
});
