import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const handlers = {};
runInNewContext(readFileSync('public/sw.js', 'utf8'), {
  URL,
  self: { location: { origin: 'https://app.example.test' }, addEventListener: (type, handler) => { handlers[type] = handler; } },
  caches: { match: async () => new Response('cached'), open: async () => ({ put() {} }) },
  fetch: async () => new Response('fresh'),
});
function intercepted(url, headers = {}) {
  let handled = false;
  handlers.fetch({ request: new Request(url, { headers }), respondWith() { handled = true; } });
  return handled;
}
assert.equal(intercepted('http://127.0.0.1:54321/rest/v1/client_questionnaire_responses'), false);
assert.equal(intercepted('https://database.example.test/rest/v1/user_profiles'), false);
assert.equal(intercepted('https://app.example.test/rest/v1/user_profiles'), false);
assert.equal(intercepted('https://app.example.test/assets/private.json', { authorization: 'Bearer test' }), false);
assert.equal(intercepted('https://app.example.test/assets/app.js'), true);
console.log('PASS: API and authenticated responses bypass service-worker cache');
