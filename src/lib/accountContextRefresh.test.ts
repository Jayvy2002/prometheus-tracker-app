import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNT_CONTEXT_REFRESH_MS, createAccountContextRefresh } from './accountContextRefresh';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('focus, online and timer signals coalesce without losing the latest refresh', async () => {
  const waits = [deferred(), deferred()];
  let calls = 0;
  const refresh = createAccountContextRefresh(async () => {
    await waits[calls++].promise;
  });
  const first = refresh.request();
  const second = refresh.request();
  const third = refresh.request();
  assert.equal(calls, 1, 'Only one server read runs at a time');
  waits[0].resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 2, 'Signals during the read produce one final refresh');
  waits[1].resolve();
  await Promise.all([first, second, third]);
  assert.equal(calls, 2);
  assert.equal(ACCOUNT_CONTEXT_REFRESH_MS, 30_000);
});

test('disposing a session prevents a queued refresh from reaching the next account', async () => {
  const wait = deferred();
  let calls = 0;
  const refresh = createAccountContextRefresh(async () => {
    calls += 1;
    await wait.promise;
  });
  const current = refresh.request();
  void refresh.request();
  refresh.dispose();
  wait.resolve();
  await current;
  await refresh.request();
  assert.equal(calls, 1);
});
