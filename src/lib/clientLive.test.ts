import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyNutritionTargets,
  liveMessageState,
  mergeMessageRealtime,
  nutritionTargetsFromProfileRow,
  shouldRefreshClientAssignment,
} from './clientLive';
import type { CoachMessage, UserProfile } from './types';

function msg(partial: Partial<CoachMessage> & Pick<CoachMessage, 'id'>): CoachMessage {
  return {
    coach_id: 'coach-1',
    client_id: 'sofia-id',
    sender_id: 'coach-1',
    body: 'Salut Sofia',
    template_key: 'missed_training',
    created_at: '2026-08-29T10:00:00Z',
    read_at: null,
    ...partial,
  };
}

test('a new coach message lands in the client thread without dropping older ones', () => {
  const existing = msg({ id: 'old', body: 'Ancien', created_at: '2026-08-22T10:00:00Z' });
  const incoming = msg({ id: 'new', body: 'Nouveau programme cette semaine', created_at: '2026-08-29T11:00:00Z' });
  const merged = mergeMessageRealtime([existing], 'INSERT', incoming);
  assert.deepEqual(merged.map(m => m.id), ['new', 'old']);
  const live = liveMessageState([existing], 'INSERT', incoming, 'sofia-id');
  assert.equal(live.unreadMessageCount, 2);
  assert.equal(live.latestCoachMessage?.id, 'new');
});

test('marking a message read updates unread without a full reload', () => {
  const unread = msg({ id: 'm1' });
  const read = { ...unread, read_at: '2026-08-29T11:00:00Z' };
  const live = liveMessageState([unread], 'UPDATE', read, 'sofia-id');
  assert.equal(live.unreadMessageCount, 0);
  assert.equal(live.latestCoachMessage, null);
  assert.equal(live.sentMessages[0]?.read_at, '2026-08-29T11:00:00Z');
});

test('a newly assigned program for this client requires a live refetch', () => {
  assert.equal(
    shouldRefreshClientAssignment('INSERT', { client_id: 'sofia-id', status: 'active', program_id: 'p1' }, 'sofia-id'),
    true,
  );
  assert.equal(
    shouldRefreshClientAssignment('INSERT', { client_id: 'other', status: 'active' }, 'sofia-id'),
    false,
  );
  assert.equal(
    shouldRefreshClientAssignment('UPDATE', { client_id: 'sofia-id', status: 'paused' }, 'sofia-id'),
    true,
  );
});

test('coach-confirmed nutrition targets patch the client profile in place', () => {
  const targets = nutritionTargetsFromProfileRow({
    id: 'sofia-id',
    daily_calorie_target: 2100,
    protein_target: 140,
    carbs_target: 220,
    fat_target: 65,
  });
  assert.deepEqual(targets, {
    daily_calorie_target: 2100,
    protein_target: 140,
    carbs_target: 220,
    fat_target: 65,
  });
  const profile = {
    id: 'sofia-id',
    daily_calorie_target: 1800,
    protein_target: 120,
    carbs_target: 200,
    fat_target: 60,
  } as UserProfile;
  const next = applyNutritionTargets(profile, 'sofia-id', targets!);
  assert.equal(next?.daily_calorie_target, 2100);
  assert.equal(applyNutritionTargets(profile, 'other', targets!), profile);
});
