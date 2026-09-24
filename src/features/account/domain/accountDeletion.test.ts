import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ACCOUNT_DELETION_WINDOW_DAYS, blocksApp, canCancel, daysLeft, parseAccountDeletion } from './accountDeletion';
import {
  StorageCleanupError,
  removeMessageAttachments,
  type AccountStorageClient,
} from '../../../../supabase/functions/delete-account/storageCleanup.ts';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('pending, purging or stuck deletions replace the app; cancelled ones do not', () => {
  assert.equal(blocksApp(parseAccountDeletion({ status: 'pending', purge_after: '2026-10-08T10:00:00Z' })), true);
  assert.equal(blocksApp(parseAccountDeletion({ status: 'purging' })), true);
  assert.equal(blocksApp(parseAccountDeletion({ status: 'failed' })), true);
  assert.equal(blocksApp(parseAccountDeletion({ status: 'cancelled' })), false);
  assert.equal(blocksApp(parseAccountDeletion(null)), false);
  assert.equal(parseAccountDeletion({ status: 'weird' }).status, 'none');
  assert.equal(canCancel(parseAccountDeletion({ status: 'pending' })), true);
  assert.equal(canCancel(parseAccountDeletion({ status: 'purging' })), false);
});

test('days left round up and stop at zero', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  assert.equal(daysLeft('2026-10-08T12:00:00Z', now), 14);
  assert.equal(daysLeft('2026-09-24T13:00:00Z', now), 1);
  assert.equal(daysLeft('2026-09-20T12:00:00Z', now), 0);
  assert.equal(daysLeft(null, now), null);
});

test('the window shown is the window the database applies', () => {
  const sql = src('supabase/migrations/20260924200000_account_deletion_window.sql');
  assert.match(sql, new RegExp(`interval '${ACCOUNT_DELETION_WINDOW_DAYS} days'`));
  assert.match(sql, /À VALIDER JURIDIQUEMENT/);
});

test('a request never purges; the cron purges due requests with the same fail-closed order', () => {
  const edge = src('supabase/functions/delete-account/index.ts');
  const person = edge.slice(edge.indexOf('// A person: request the deletion'));
  assert.match(person, /rpc\("request_account_deletion"\)/);
  assert.doesNotMatch(person, /deleteUser|purgeUser\(/);
  const purge = edge.slice(edge.indexOf('async function purgeUser'), edge.indexOf('Deno.serve'));
  const order = ['prepare_account_deletion', 'close_coach_account', 'account_message_attachment_paths', 'deleteAuthUserAfterStorageCleanup']
    .map(step => purge.indexOf(step));
  assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), `purge order ${order}`);
  assert.match(edge, /release_account_deletion/);
  assert.match(edge, /ACCOUNT_PURGE_CRON_SECRET/);
  const store = src('src/stores/authStore.ts');
  assert.match(store, /rpc\('request_account_deletion'\)/);
  assert.doesNotMatch(store, /functions\/v1\/delete-account/);
  const routes = src('src/app/router/AppRoutes.tsx');
  assert.match(routes, /blocksApp\(deletion\.state\)/);
});

test('thread files are removed in batches and any failure keeps the account', async () => {
  const removed: string[][] = [];
  const ok: AccountStorageClient = {
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async (paths: string[]) => { removed.push(paths); return { error: null }; } }) },
  };
  const paths = Array.from({ length: 5 }, (_, i) => `a/b/${i}.png`);
  assert.deepEqual(await removeMessageAttachments(ok, paths, { removeBatch: 2 }), { removed: 5 });
  assert.equal(removed.length, 3);
  const failing: AccountStorageClient = {
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: { message: 'boom', status: 500 } }) }) },
  };
  await assert.rejects(() => removeMessageAttachments(failing, paths), (err: unknown) => err instanceof StorageCleanupError && err.reason === 'remove_failed');
});
