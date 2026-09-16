import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { coachingStoreSource } from '../../../lib/coachingStoreSource';
import {
  appendBilanSearch,
  bilanInsertFields,
  hasBilan,
  normalizeBilanRef,
  parseBilanQuery,
  parseBilanUuid,
} from './messageBilan';

function src(rel: string): string {
  if (rel === 'src/stores/coachingStore.ts') return coachingStoreSource();
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const WORKOUT = '9e9517fe-392a-4738-944b-8fbf19035eee';
const CHECKIN = 'a1515001-0000-4000-8000-000000000099';

test('bilan query stamps one entity and drops a second', () => {
  assert.equal(parseBilanUuid('not-a-uuid'), null);
  const both = normalizeBilanRef({ workoutId: WORKOUT, checkinId: CHECKIN });
  assert.deepEqual(both, { workoutId: WORKOUT, checkinId: null });
  const checkinOnly = parseBilanQuery(new URLSearchParams(`checkin=${CHECKIN}`));
  assert.deepEqual(checkinOnly, { workoutId: null, checkinId: CHECKIN });
  const params = new URLSearchParams({ nudge: 'missed_training' });
  appendBilanSearch(params, { workoutId: WORKOUT, checkinId: null });
  assert.equal(params.get('nudge'), 'missed_training');
  assert.equal(params.get('workout'), WORKOUT);
  assert.equal(hasBilan(checkinOnly), true);
  assert.deepEqual(bilanInsertFields(both), { workout_id: WORKOUT, checkin_id: null });
});

test('UX27 wires message FKs, 360 relance, chip — not a second inbox or read_at rewrite', () => {
  const mig = src('supabase/migrations/20260915234946_ux27_message_bilan.sql');
  const lock = src('supabase/schema_migrations.lock.json');
  assert.match(lock, /"version": "20260915234946"/);
  assert.match(lock, /"name": "ux27_message_bilan"/);
  assert.match(mig, /ADD COLUMN IF NOT EXISTS workout_id/);
  assert.match(mig, /ADD COLUMN IF NOT EXISTS checkin_id/);
  assert.match(mig, /ON DELETE SET NULL/);
  assert.match(mig, /coach_messages_one_bilan/);
  assert.doesNotMatch(mig, /GRANT UPDATE/);

  const store = src('src/stores/coachingStore.ts');
  const send = store.slice(store.indexOf('sendCoachMessage: async'));
  const fn = send.slice(0, send.indexOf('sendClientReply:'));
  assert.match(fn, /bilanInsertFields/);
  assert.match(fn, /normalizeBilanRef/);
  const mark = store.slice(store.indexOf('markThreadRead: async'));
  assert.match(mark.slice(0, 900), /\.select\('id'\)/);

  const queue = src('src/features/coaching/domain/coachQueue.ts');
  assert.match(queue, /appendBilanSearch/);
  assert.match(queue, /workout_id:/);
  const checkins = src('src/features/coaching/domain/coachCheckins.ts');
  assert.match(checkins, /checkinId/);
  const recovery = src('src/features/coaching/domain/coachRecovery.ts');
  assert.match(recovery, /checkinId/);
  const detail = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(detail, /sessionView\?\.workoutId/);
  assert.match(detail, /focusedCheckin\.id/);
  const inbox = src('src/components/coaching/CoachInboxPage.tsx');
  assert.match(inbox, /parseBilanQuery/);
  const thread = src('src/components/coaching/MessageThread.tsx');
  assert.match(thread, /ux27-bilan-chip/);
  assert.match(thread, /ux27-compose-hint/);
  assert.doesNotMatch(thread, /navigate\(`\/workout\//);
  const fr = src('src/i18n/locales/fr/coaching.ts');
  assert.match(fr, /aboutWorkout:/);
  assert.match(fr, /aboutCheckin:/);
});
