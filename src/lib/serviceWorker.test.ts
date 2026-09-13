import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const writes: string[] = [];
  const removed: string[] = [];
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://app.example.test' },
      addEventListener: (name: string, fn: (event: unknown) => void) => { handlers[name] = fn; },
      clients: { claim() {} }, skipWaiting() {},
    },
    caches: {
      match: async () => undefined,
      keys: async () => ['prometheus-v2', 'prometheus-v3'],
      delete: async (key: string) => { removed.push(key); },
      open: async () => ({ put: async (request: Request) => { writes.push(request.url); } }),
    },
    fetch: async () => new Response('public asset'),
  });
  return { handlers, writes, removed };
}

test('actual worker never caches API traffic, independent of API hostname', () => {
  const { handlers } = worker();
  for (const url of [
    'http://127.0.0.1:54321/rest/v1/user_profiles?id=eq.A',
    'https://database.example.test/rest/v1/coach_messages',
    'https://project.supabase.co/rest/v1/user_profiles',
    'https://app.example.test/rest/v1/user_profiles',
    'https://app.example.test/api/private',
    'https://app.example.test/src/stores/profileStore.ts',
  ]) {
    handlers.fetch({ request: new Request(url), respondWith: () => assert.fail('Private/API/dev request was intercepted: ' + url) });
  }
});

test('authenticated requests and non-GET requests never use the static cache', () => {
  const { handlers } = worker();
  for (const options of [{ headers: { authorization: 'Bearer synthetic' } }, { method: 'POST' }]) {
    handlers.fetch({ request: new Request('https://app.example.test/assets/app.js', options), respondWith: () => assert.fail('Intercepted privileged request') });
  }
});

test('public bundled assets remain available to the offline cache', async () => {
  const { handlers, writes } = worker();
  let response: Promise<Response> | undefined;
  handlers.fetch({ request: new Request('https://app.example.test/assets/app-123.js'), respondWith: (value: Promise<Response>) => { response = value; } });
  assert.ok(response);
  assert.equal(await (await response).text(), 'public asset');
  assert.deepEqual(writes, ['https://app.example.test/assets/app-123.js']);
});

test('activation removes the previous cache that could contain API responses', async () => {
  const { handlers, removed } = worker();
  let complete: Promise<unknown> | undefined;
  handlers.activate({ waitUntil: (value: Promise<unknown>) => { complete = value; } });
  await complete;
  assert.deepEqual(removed, ['prometheus-v2']);
});
