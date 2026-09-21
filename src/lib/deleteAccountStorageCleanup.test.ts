import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LIST_HARD_CAP,
  StorageCleanupError,
  cleanupOwnedAccountStorage,
  deleteAuthUserAfterStorageCleanup,
  isMissingBucketError,
  listOwnedStoragePaths,
  type AccountStorageClient,
  type StorageApiError,
  type StorageListEntry,
} from '../../supabase/functions/delete-account/storageCleanup.ts';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

type Page = { data: StorageListEntry[] | null; error: StorageApiError | null };

function client(opts: {
  list?: (bucket: string, prefix: string, offset: number) => Page | Promise<Page>;
  remove?: (bucket: string, paths: string[]) => Promise<{ error: StorageApiError | null }>;
}): AccountStorageClient {
  return {
    storage: {
      from(bucket: string) {
        return {
          list(prefix: string, options: { offset: number }) {
            return Promise.resolve(opts.list?.(bucket, prefix, options.offset) ?? { data: [], error: null });
          },
          remove(paths: string[]) {
            return opts.remove?.(bucket, paths) ?? Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

test('list Storage échoue → Auth user toujours présent', async () => {
  let deleted = false;
  const admin = client({
    list: () => ({ data: null, error: { message: 'storage unavailable', status: 500 } }),
  });
  await assert.rejects(
    () => deleteAuthUserAfterStorageCleanup(admin, 'user-1', async () => {
      deleted = true;
      return { error: null };
    }),
    (err: unknown) => err instanceof StorageCleanupError && err.reason === 'list_failed',
  );
  assert.equal(deleted, false);
});

test('remove Storage échoue → Auth user toujours présent', async () => {
  let deleted = false;
  const admin = client({
    list: () => ({
      data: [{ name: 'proof.pdf', id: 'obj-1' }],
      error: null,
    }),
    remove: async () => ({ error: { message: 'remove denied', status: 500 } }),
  });
  await assert.rejects(
    () => deleteAuthUserAfterStorageCleanup(admin, 'user-1', async () => {
      deleted = true;
      return { error: null };
    }, { buckets: ['qualification-proofs'] }),
    (err: unknown) => err instanceof StorageCleanupError && err.reason === 'remove_failed',
  );
  assert.equal(deleted, false);
});

test('>50 000 / cleanup tronqué → Auth user toujours présent', async () => {
  let deleted = false;
  const admin = client({
    list: (_bucket, _prefix, offset) => ({
      data: Array.from({ length: 2 }, (_, i) => ({ name: `f-${offset}-${i}`, id: `id-${offset}-${i}` })),
      error: null,
    }),
  });
  await assert.rejects(
    () => deleteAuthUserAfterStorageCleanup(admin, 'user-1', async () => {
      deleted = true;
      return { error: null };
    }, { buckets: ['qualification-proofs'], pageSize: 2, hardCap: 2 }),
    (err: unknown) => err instanceof StorageCleanupError && err.reason === 'truncated',
  );
  assert.equal(deleted, false);
  assert.equal(LIST_HARD_CAP, 50_000);
});

test('bucket qualification-proofs absent (pré-P4) → cleanup vide, Auth peut partir', async () => {
  let deleted = false;
  const admin = client({
    list: () => ({ data: null, error: { message: 'Bucket not found', status: 404 } }),
  });
  const result = await deleteAuthUserAfterStorageCleanup(admin, 'user-1', async () => {
    deleted = true;
    return { error: null };
  }, { buckets: ['qualification-proofs'] });
  assert.equal(result.removed, 0);
  assert.equal(deleted, true);
  assert.equal(isMissingBucketError({ message: 'Bucket not found', status: 404 }), true);
});

test('cleanup réussi puis seulement ensuite deleteUser', async () => {
  const order: string[] = [];
  const admin = client({
    list: (_bucket, prefix) => {
      if (prefix === 'user-1') return { data: [{ name: 'q1', id: null }], error: null };
      return { data: [{ name: 'proof-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf', id: 'obj-1' }], error: null };
    },
    remove: async (_bucket, paths) => {
      order.push(`remove:${paths.join(',')}`);
      return { error: null };
    },
  });
  await deleteAuthUserAfterStorageCleanup(admin, 'user-1', async () => {
    order.push('deleteUser');
    return { error: null };
  }, { buckets: ['qualification-proofs'] });
  assert.deepEqual(order, [
    'remove:user-1/q1/proof-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
    'deleteUser',
  ]);
  const nested = await listOwnedStoragePaths(admin, 'qualification-proofs', 'user-1');
  assert.deepEqual(nested, ['user-1/q1/proof-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf']);
  const cleaned = await cleanupOwnedAccountStorage(admin, 'user-1', { buckets: ['qualification-proofs'] });
  assert.equal(cleaned.removed, 1);
});

test('C03 edge refuse Auth delete si le cleanup Storage requis échoue', () => {
  const edge = src('supabase/functions/delete-account/index.ts');
  const helper = src('supabase/functions/delete-account/storageCleanup.ts');
  assert.match(edge, /close_coach_account/);
  assert.match(edge, /deleteAuthUserAfterStorageCleanup/);
  assert.match(edge, /storage_cleanup_failed/);
  assert.match(edge, /auth\.admin\.deleteUser/);
  assert.ok(
    edge.lastIndexOf('close_coach_account') < edge.lastIndexOf('deleteAuthUserAfterStorageCleanup'),
    'transition must run before Storage cleanup / Auth deletion',
  );
  assert.doesNotMatch(edge, /best effort/);
  assert.doesNotMatch(helper, /warnings\.push/);
  assert.match(helper, /StorageCleanupError/);
  assert.match(helper, /list_failed/);
  assert.match(helper, /remove_failed/);
  assert.match(helper, /truncated/);
  assert.match(helper, /LIST_HARD_CAP = 50_000/);
  assert.match(helper, /qualification-proofs/);
  assert.match(helper, /!entry\.id/);
  assert.match(helper, /isMissingBucketError/);
});
