// Run the production store against a controllable transport; never contact Supabase.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temp = await mkdtemp(join(tmpdir(), 'prometheus-profile-'));
try {
  const bundle = await build({
    stdin: { contents: `export { useProfileStore } from './src/stores/profileStore';
      export { setSessionOwner } from './src/lib/sessionScope';
      export { supabase } from './src/lib/supabase';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'mock-transport', setup(builder) {
      builder.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'transport', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase = { storage: {} };' }));
    } }],
  });
  const path = join(temp, 'store.cjs');
  await writeFile(path, bundle.outputFiles[0].text);
  const { useProfileStore: store, setSessionOwner, supabase } = createRequire(import.meta.url)(path);
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  let writes;
  function reset(owner = 'A') {
    store.getState().clearProfile();
    setSessionOwner(owner);
    store.setState({ profile: { id: owner, full_name: owner, coach_link_ended_at: null }, loading: false });
    writes = 0;
  }
  function transport(result) {
    supabase.from = () => {
      const chain = { update() { writes++; return chain; }, eq() { return chain; }, select() { return chain; }, maybeSingle: () => result };
      return chain;
    };
  }
  const file = { name: 'avatar.png' };
  const storage = upload => { supabase.storage.from = () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/avatar' } }) }); };

  reset();
  let pending = deferred();
  transport(pending.promise);
  const oldUpdate = store.getState().updateProfile('A', { full_name: 'Changed' });
  assert.ok((await store.getState().updateProfile('A', { full_name: 'Duplicate' })).error);
  assert.equal(writes, 1);
  reset('B');
  pending.resolve({ data: { id: 'A', full_name: 'Changed' }, error: null });
  assert.ok((await oldUpdate).error);
  assert.equal(store.getState().profile.id, 'B');
  console.log('PASS: profile writes reject duplicates and stale account completions');

  reset();
  pending = deferred();
  transport(pending.promise);
  const update = store.getState().updateProfile('A', { full_name: 'Changed' });
  store.getState().applyCoachingDeparture('A', '2026-09-13T01:00:00Z');
  pending.resolve({ data: { id: 'A', full_name: 'Changed', coach_link_ended_at: null }, error: null });
  assert.equal((await update).error, null);
  assert.equal(store.getState().profile.full_name, 'Changed');
  assert.equal(store.getState().profile.coach_link_ended_at, '2026-09-13T01:00:00Z');
  console.log('PASS: profile save preserves a concurrent confirmed departure');

  reset();
  pending = deferred();
  storage(() => pending.promise);
  const oldUpload = store.getState().uploadAvatar('A', file);
  reset('B');
  store.setState({ uploadingAvatar: true });
  pending.resolve({ error: null });
  assert.equal(await oldUpload, null);
  assert.equal(writes, 0);
  assert.equal(store.getState().uploadingAvatar, true);
  assert.equal(store.getState().profile.id, 'B');
  console.log('PASS: an old upload cannot start a profile write or clear the new account upload state');

  for (const result of [{ data: null, error: { message: 'denied' } }, { data: null, error: null }]) {
    reset(); storage(async () => ({ error: null })); transport(Promise.resolve(result));
    assert.equal(await store.getState().uploadAvatar('A', file), null);
    assert.equal(store.getState().uploadingAvatar, false);
  }
  reset(); storage(async () => { throw new Error('offline'); });
  assert.equal(await store.getState().uploadAvatar('A', file), null);
  assert.equal(store.getState().uploadingAvatar, false);
  storage(async () => ({ error: null }));
  transport(Promise.resolve({ data: { id: 'A', avatar_url: 'saved-avatar' }, error: null }));
  assert.equal(await store.getState().uploadAvatar('A', file), 'saved-avatar');
  console.log('PASS: upload denial, zero-row update and network exception fail honestly and allow retry');

  reset();
  transport(Promise.reject(new Error('offline')));
  assert.ok((await store.getState().updateProfile('A', { full_name: 'Changed' })).error);
  transport(Promise.resolve({ data: { id: 'A', full_name: 'Retry' }, error: null }));
  assert.equal((await store.getState().updateProfile('A', { full_name: 'Retry' })).error, null);
  console.log('PASS: profile network failure releases the lock for retry');
} finally {
  await rm(temp, { recursive: true, force: true });
}
