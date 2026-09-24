import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { renderActionNotification, renderFixedReminder } from '../../../../supabase/functions/_shared/actionNotifications';

const row = (kind: string, patch: Partial<{ item_count: number; payload: Record<string, unknown>; url: string; language: string }> = {}) => ({
  kind, item_count: 1, payload: {}, url: '/messages', language: 'fr', ...patch,
});

test('grouped messages say how many and from whom, never what', () => {
  assert.equal(renderActionNotification(row('coach_message', { item_count: 3, payload: { name: 'Marie' } }))?.body, '3 nouveaux messages de Marie');
  assert.equal(renderActionNotification(row('coach_message', { language: 'en', payload: { name: 'Marie' } }))?.body, 'New message from Marie');
  assert.equal(renderActionNotification(row('client_message', { payload: {} }))?.body, "Nouveau message d'un client");
  assert.equal(renderActionNotification(row('coach_message', { payload: {} }))?.body, 'Nouveau message de ton coach');
});

test('marketplace: the athlete is asked to confirm, the coach is told when it is active', () => {
  assert.match(renderActionNotification(row('coach_accepted', { payload: { name: 'Marie' }, url: '/coaching-requests' }))?.body ?? '', /Confirme pour commencer/);
  assert.match(renderActionNotification(row('athlete_confirmed', { language: 'en', payload: { name: 'Lucas' } }))?.body ?? '', /Lucas confirmed/);
});

test('an unknown kind is never sent as a vague notification', () => {
  assert.equal(renderActionNotification(row('marketing_blast')), null);
});

test('fixed-time reminders are factual, without guilt', () => {
  const planned = renderFixedReminder('workout', 'fr', 'Lower B');
  assert.equal(planned.body, "Séance prévue aujourd'hui : Lower B");
  for (const lang of ['fr', 'en']) {
    for (const kind of ['workout', 'nutrition'] as const) {
      const body = renderFixedReminder(kind, lang, null).body;
      assert.doesNotMatch(body, /pas encore|Go !|haven't|crush|oublie|forget/i);
    }
  }
  const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/send-daily-reminders/index.ts'), 'utf8');
  assert.doesNotMatch(edge, /Tu n'as pas encore loggé|Go crush it/);
  assert.match(edge, /claim_notification_batch/);
  assert.match(edge, /renderActionNotification/);
});

test('the cron function carries the same copy, inlined for its one-file deploy', () => {
  const shared = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/actionNotifications.ts'), 'utf8');
  const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/send-daily-reminders/index.ts'), 'utf8');
  const start = edge.indexOf('// BEGIN inlined _shared/actionNotifications.ts');
  const end = edge.indexOf('// END inlined _shared/actionNotifications.ts');
  assert.ok(start >= 0 && end > start, 'inlined block missing');
  const inlined = edge.slice(edge.indexOf('\n', start) + 1, end).trim();
  const expected = shared.replace(/export (function|type|interface)/g, '$1').trim();
  assert.equal(inlined, expected);
  assert.doesNotMatch(edge, /from '\.\.\/_shared\/actionNotifications/);
});

test('a declared pain reaches the coach without health details in the push', () => {
  const push = renderActionNotification(row('constraint_declared', { payload: { name: 'Lucas', area: 'knee', kind: 'pain' }, url: '/clients/x' }));
  assert.equal(push?.body, 'Lucas a signalé une douleur ou une contrainte.');
  assert.doesNotMatch(push?.body ?? '', /knee|genou/);
});

test('a due check-in is a plain fact, never a reproach', () => {
  const push = renderActionNotification(row('checkin_due', { url: '/checkin' }));
  assert.equal(push?.body, 'Ton check-in est prévu aujourd’hui.');
  assert.doesNotMatch(push?.body ?? '', /oubli|manqu|encore|toujours pas/i);
});
