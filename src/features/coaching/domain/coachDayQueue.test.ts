import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  checkinReceivedQueueItems,
  sessionsTodayRows,
  unreadMessageQueueItems,
  unreadMessagesQueueId,
} from './coachDayQueue';
import { groupQueueByClient, primaryQueueAction, queueItemLabelKey, resolveQueueAction } from './coachQueue';
import { EMPTY_SIGNALS } from '../model/coachingShared';
import type {
  ClientOpsRow,
  CoachClientSummary,
  CoachMessage,
  CoachPriority,
  CoachRosterSignals,
  DailyCheckin,
} from '../../../lib/types';

const COACH = 'coach-1';

function client(id: string, name: string, extra: Partial<CoachClientSummary> = {}): CoachClientSummary {
  return {
    id,
    full_name: name,
    email: '',
    avatar_url: '',
    linked_at: '2026-09-01T08:00:00Z',
    onboarding_completed: true,
    goal: 'maintain',
    training_frequency: 3,
    target_weight_kg: 0,
    weight_kg: 0,
    last_visited_at: null,
    last_nudged_at: null,
    ...extra,
  };
}

function message(partial: Partial<CoachMessage> & Pick<CoachMessage, 'id' | 'client_id' | 'sender_id' | 'created_at'>): CoachMessage {
  return {
    coach_id: COACH,
    body: 'Salut',
    template_key: 'reply',
    read_at: null,
    workout_id: null,
    checkin_id: null,
    reply_to_id: null,
    program_id: null,
    goal_id: null,
    exercise_name: null,
    attachments: [],
    ...partial,
  };
}

function ops(c: CoachClientSummary, extra: Partial<ClientOpsRow> = {}): ClientOpsRow {
  return { client: c, alerts: [], hasScheduledTrainingToday: false, hasProgram: true, setupCompleted: true, ...extra };
}

function checkin(id: string, userId: string, createdAt: string): DailyCheckin {
  return { id, user_id: userId, checked_at: createdAt.slice(0, 10), created_at: createdAt, updated_at: createdAt } as DailyCheckin;
}

const lea = client('lea', 'Léa Martin');
const tom = client('tom', 'Tom Roy');

test('unread messages: one row per active client, counted, newest id in the key', () => {
  const items = unreadMessageQueueItems([
    message({ id: 'm1', client_id: 'lea', sender_id: 'lea', created_at: '2026-09-24T08:00:00Z' }),
    message({ id: 'm2', client_id: 'lea', sender_id: 'lea', created_at: '2026-09-24T09:00:00Z' }),
    // Already read, sent by the coach, or from a prospect / another coach: never counted.
    message({ id: 'm3', client_id: 'lea', sender_id: 'lea', created_at: '2026-09-23T09:00:00Z', read_at: '2026-09-23T10:00:00Z' }),
    message({ id: 'm4', client_id: 'tom', sender_id: COACH, created_at: '2026-09-24T09:00:00Z' }),
    message({ id: 'm5', client_id: 'prospect', sender_id: 'prospect', created_at: '2026-09-24T09:00:00Z' }),
    message({ id: 'm6', client_id: 'tom', sender_id: 'tom', coach_id: 'other-coach', created_at: '2026-09-24T09:00:00Z' }),
  ], [lea, tom], COACH);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.clientId, 'lea');
  assert.equal(items[0]?.kind, 'unread_messages');
  assert.deepEqual(items[0]?.headlineParams, { count: 2 });
  assert.equal(items[0]?.id, unreadMessagesQueueId('lea', 'm2'));
  assert.equal(items[0]?.href, '/messages/lea');
  assert.equal(items[0]?.sinceIso, '2026-09-24T08:00:00Z');
  assert.deepEqual(unreadMessageQueueItems([], [lea], null), []);
});

test('check-ins received since the last visit, without duplicating a check-in signal', () => {
  const signals: CoachRosterSignals = {
    ...EMPTY_SIGNALS,
    checkins: [
      checkin('c-lea', 'lea', '2026-09-24T07:00:00Z'),
      checkin('c-tom', 'tom', '2026-09-24T07:00:00Z'),
      checkin('c-old', 'old', '2026-09-20T07:00:00Z'),
    ],
  };
  const old = client('old', 'Olivier', { last_visited_at: '2026-09-21T07:00:00Z' });
  const pain: CoachPriority = {
    id: 'tom-pain', clientId: 'tom', clientName: 'Tom Roy', avatarUrl: '', kind: 'new_pain', severity: 'red',
    headlineKey: 'x', detailKey: 'x', href: '/clients/tom?tab=health',
  };
  const items = checkinReceivedQueueItems([ops(lea), ops(tom), ops(old)], signals, [pain]);
  assert.deepEqual(items.map(i => i.clientId), ['lea']);
  assert.equal(items[0]?.kind, 'checkin_received');
  assert.equal(items[0]?.checkinId, 'c-lea');
  assert.match(items[0]?.href ?? '', /tab=checkins&checkin=c-lea/);
});

test('new kinds resolve to the right screen and label', () => {
  const [msg] = unreadMessageQueueItems([
    message({ id: 'm1', client_id: 'lea', sender_id: 'lea', created_at: '2026-09-24T08:00:00Z' }),
  ], [lea], COACH);
  assert.ok(msg);
  const action = resolveQueueAction(msg, []);
  assert.equal(action.kind, 'open_thread');
  assert.equal(action.href, '/messages/lea');
  assert.equal(action.ctaKey, 'coaching.queue.reply');
  assert.equal(queueItemLabelKey(msg), 'coaching.queue.items.unread_messages');

  const [received] = checkinReceivedQueueItems([ops(lea)], { ...EMPTY_SIGNALS, checkins: [checkin('c1', 'lea', '2026-09-24T07:00:00Z')] }, []);
  assert.ok(received);
  assert.equal(resolveQueueAction(received, []).ctaKey, 'coaching.queue.openCheckin');

  // A client with both goes to the messages first; one row per client.
  const groups = groupQueueByClient([received, msg]);
  assert.equal(groups.length, 1);
  assert.equal(primaryQueueAction(groups[0]!, []).item.kind, 'unread_messages');
});

test('sessions today: fixed-day programs only, with the program name', () => {
  const rows = sessionsTodayRows([
    ops(tom, { hasScheduledTrainingToday: true }),
    ops(lea, { hasScheduledTrainingToday: true }),
    ops(client('sans', 'Sans programme'), { hasScheduledTrainingToday: true, hasProgram: false }),
    ops(client('repos', 'Repos'), { hasScheduledTrainingToday: false }),
  ], { assignmentName: { lea: 'Force A', tom: '  ' } });
  assert.deepEqual(rows.map(r => r.clientId), ['lea', 'tom']);
  assert.equal(rows[0]?.programName, 'Force A');
  assert.equal(rows[1]?.programName, null);
  assert.equal(rows[0]?.href, '/clients/lea?tab=training');
});

test('dashboard reads the day queue from domain helpers and keeps one File du jour', () => {
  const queue = readFileSync(resolve(process.cwd(), 'src/components/coaching/CoachTodayQueue.tsx'), 'utf8');
  assert.match(queue, /unreadMessageQueueItems/);
  assert.match(queue, /checkinReceivedQueueItems/);
  assert.match(queue, /groupQueueByClient\(\[/);
  const dash = readFileSync(resolve(process.cwd(), 'src/components/coaching/CoachDashboard.tsx'), 'utf8');
  assert.match(dash, /sessionsTodayRows/);
  assert.match(dash, /fetchCoachMessages/);
  assert.match(dash, /ErrorState/);
  for (const lang of ['fr', 'en']) {
    const locale = readFileSync(resolve(process.cwd(), `src/i18n/locales/${lang}/coaching.ts`), 'utf8');
    assert.match(locale, /unread_messages_one:/);
    assert.match(locale, /checkin_received:/);
  }
});
