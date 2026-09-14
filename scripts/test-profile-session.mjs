import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Execute the real store with a deferred transport, without accessing a database.
const pending = [];
globalThis.__profileTestTransport = {
  from() {
    const query = {
      select() { return query; }, eq() { return query; }, update() { return query; },
      maybeSingle() { return new Promise(resolve => pending.push(resolve)); },
    };
    return query;
  },
};
const bundle = await build({
  stdin: { contents: "export { useProfileStore } from './src/stores/profileStore'; export { setSessionOwner } from './src/lib/sessionScope';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'test-transport', setup(build) {
    build.onResolve({ filter: /\/lib\/(supabase|clientLive)$/ }, args => ({ path: args.path, namespace: 'test-transport' }));
    build.onLoad({ filter: /.*/, namespace: 'test-transport' }, args => ({ contents: args.path.endsWith('supabase')
      ? 'export const supabase = globalThis.__profileTestTransport;'
      : 'export const applyNutritionTargets = profile => profile;' }));
  } }],
});
const { useProfileStore: store, setSessionOwner } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
setSessionOwner('account-a');
const oldRead = store.getState().fetchProfile('account-a');
setSessionOwner(null); store.getState().clearProfile(); setSessionOwner('account-b');
const newRead = store.getState().fetchProfile('account-b');
pending[1]({ data: { id: 'account-b' }, error: null }); await newRead;
pending[0]({ data: { id: 'account-a' }, error: null }); await oldRead;
assert.equal(store.getState().profile.id, 'account-b', 'Late response must not replace the new account');
const oldWrite = store.getState().updateProfile('account-b', { full_name: 'Previous session' });
setSessionOwner(null); store.getState().clearProfile(); setSessionOwner('account-b');
pending[2]({ data: { id: 'account-b', full_name: 'Previous session' }, error: null });
assert.equal((await oldWrite).error, 'session_changed', 'Same-account relogin must invalidate old writes');
assert.equal(store.getState().profile, null);
const freshRead = store.getState().fetchProfile('account-b');
await store.getState().fetchProfile('account-a');
pending[3]({ data: { id: 'account-b' }, error: null }); await freshRead;
assert.equal(store.getState().profile.id, 'account-b', 'A stale caller must not cancel the current read');
delete globalThis.__profileTestTransport;
console.log('PASS: profile read/write isolation, same-account relogin and stale caller');
