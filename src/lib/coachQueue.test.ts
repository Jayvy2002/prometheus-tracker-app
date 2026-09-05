import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composeItemsInGroup,
  draftQueueItems,
  groupQueueByClient,
  lastMessageForClient,
  nextClientNames,
  parseNudgeQuery,
  queueItemLabelKey,
  relanceHrefForGroup,
  relanceThreadHref,
  resolveQueueAction,
  visibleQueueItems,
} from './coachQueue';
import type { CoachClientSummary, CoachIntervention, CoachPriority, CoachPriorityKind } from './types';

function item(partial: Partial<CoachPriority> & Pick<CoachPriority, 'id' | 'clientId' | 'kind'>): CoachPriority {
  return {
    clientName: partial.clientName ?? partial.clientId,
    avatarUrl: '',
    severity: partial.severity ?? 'yellow',
    headlineKey: `coaching.priority.headlines.${partial.kind}`,
    headlineParams: { name: partial.clientName ?? partial.clientId },
    detailKey: `coaching.priority.details.${partial.kind}`,
    href: `/clients/${partial.clientId}`,
    ...partial,
  };
}

test('groupQueueByClient keeps first-seen client order and merges events', () => {
  const queue: CoachPriority[] = [
    item({ id: 'a-missed', clientId: 'alex', clientName: 'Alex Gagnon', kind: 'missed_workout', severity: 'orange' }),
    item({ id: 'a-checkin', clientId: 'alex', clientName: 'Alex Gagnon', kind: 'missed_checkin', severity: 'yellow' }),
    item({ id: 'b-pain', clientId: 'marie', clientName: 'Marie', kind: 'new_pain', severity: 'red' }),
    item({ id: 'a-relance', clientId: 'alex', clientName: 'Alex Gagnon', kind: 'dropped_adherence', severity: 'orange' }),
    item({ id: 'c-setup', clientId: 'sam', clientName: 'Sam', kind: 'program_unassigned', severity: 'orange' }),
  ];

  const groups = groupQueueByClient(queue);
  assert.deepEqual(groups.map(g => g.clientId), ['alex', 'marie', 'sam']);
  assert.equal(groups[0]?.items.length, 3);
  assert.deepEqual(groups[0]?.items.map(i => i.kind), [
    'missed_workout',
    'missed_checkin',
    'dropped_adherence',
  ]);
  assert.equal(groups[0]?.severity, 'orange');
  assert.equal(groups[1]?.severity, 'red');
});

test('nextClientNames lists unique upcoming clients, not duplicate event names', () => {
  const groups = groupQueueByClient([
    item({ id: 'a1', clientId: 'alex', clientName: 'Alex Gagnon', kind: 'missed_workout' }),
    item({ id: 'a2', clientId: 'alex', clientName: 'Alex Gagnon', kind: 'missed_checkin' }),
    item({ id: 'b1', clientId: 'marie', clientName: 'Marie', kind: 'missed_workout' }),
    item({ id: 'c1', clientId: 'sam', clientName: 'Sam', kind: 'missed_nutrition' }),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(nextClientNames(groups), ['Marie', 'Sam']);
});

test('composeItemsInGroup only returns relance-style events', () => {
  const items: CoachPriority[] = [
    item({ id: '1', clientId: 'alex', kind: 'missed_workout' }),
    item({ id: '2', clientId: 'alex', kind: 'new_pain' }),
    item({ id: '3', clientId: 'alex', kind: 'missed_checkin' }),
  ];
  assert.deepEqual(composeItemsInGroup(items).map(i => i.kind), ['missed_workout', 'missed_checkin']);
});

test('visibleQueueItems still filters dismissed events before grouping', () => {
  const clients: CoachClientSummary[] = [{
    id: 'alex',
    full_name: 'Alex Gagnon',
    email: 'a@example.com',
    avatar_url: '',
    linked_at: '',
    onboarding_completed: true,
    goal: '',
    training_frequency: 3,
    target_weight_kg: 0,
    weight_kg: 0,
    last_visited_at: null,
    last_nudged_at: null,
  }];
  const priorities: CoachPriority[] = [
    item({ id: 'a-missed', clientId: 'alex', clientName: 'Alex Gagnon', kind: 'missed_workout' as CoachPriorityKind }),
    item({ id: 'a-checkin', clientId: 'alex', clientName: 'Alex Gagnon', kind: 'missed_checkin' }),
  ];
  const visible = visibleQueueItems(priorities, ['a-missed'], clients, '2026-08-29');
  const groups = groupQueueByClient(visible);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.items.map(i => i.id), ['a-checkin']);
});

test('Relancer on a ghost client (Sofia, no session) opens that thread with a draft — never a send', () => {
  const sofia = item({
    id: 'sofia-ghost',
    clientId: 'sofia-id',
    clientName: 'Sofia Martin',
    kind: 'missed_workout',
    severity: 'orange',
  });
  const groups = groupQueueByClient([sofia]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.clientName, 'Sofia Martin');

  const href = relanceHrefForGroup(groups[0]!, []);
  assert.equal(href, '/messages/sofia-id?nudge=missed_training');
  assert.equal(relanceThreadHref('sofia-id', 'missed_training'), href);

  const action = resolveQueueAction(sofia, []);
  assert.equal(action.kind, 'compose');
  assert.equal(action.href, href);
  assert.equal(action.templateKey, 'missed_training');
  assert.equal(parseNudgeQuery('missed_training'), 'missed_training');
  assert.equal(parseNudgeQuery('auto-send'), null);
});

test('lastMessageForClient returns the newest preview for the roster card', () => {
  const preview = lastMessageForClient([
    {
      id: 'm2',
      coach_id: 'coach',
      client_id: 'sofia-id',
      sender_id: 'sofia-id',
      body: 'Désolée, je rattrape demain',
      template_key: 'reply',
      created_at: '2026-08-29T12:00:00Z',
      read_at: null,
    },
    {
      id: 'm1',
      coach_id: 'coach',
      client_id: 'other',
      sender_id: 'coach',
      body: 'autre fil',
      template_key: 'general_followup',
      created_at: '2026-08-29T13:00:00Z',
      read_at: null,
    },
  ], 'sofia-id');
  assert.equal(preview?.body, 'Désolée, je rattrape demain');
});

test('File du jour check-in items keep the fiche deep-link, not the client overview', () => {
  const groups = groupQueueByClient([
    item({
      id: 'm-pain',
      clientId: 'marie',
      clientName: 'Marie Dupont',
      kind: 'new_pain',
      href: '/clients/marie?tab=health&checkin=ck-pain',
      checkinId: 'ck-pain',
    }),
  ]);
  assert.equal(groups[0]?.items[0]?.href, '/clients/marie?tab=health&checkin=ck-pain');
  assert.equal(groups[0]?.items[0]?.checkinId, 'ck-pain');
});

test('File du jour draft CTA opens the editor with from=today, not the 360', () => {
  const stalled = item({
    id: 'stall-1',
    clientId: 'lea',
    clientName: 'Léa Martin',
    kind: 'stalled_lift',
    href: '/clients/lea?tab=training&exercise=Squat',
  });
  const draft: CoachIntervention = {
    id: 'draft-nl',
    coach_id: 'coach',
    client_id: 'lea',
    kind: 'program_nl_edit',
    title: 'Édition programme — brouillon',
    rationale: 'Ajustement léger proposé d’après la dernière séance.',
    payload: { patch: { exercise: 'Squat', default_sets: 3, default_reps: 8 } },
    status: 'pending',
    source: 'agent',
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    resolved_at: null,
  };
  const action = resolveQueueAction(stalled, [draft]);
  assert.equal(action.kind, 'open_draft');
  assert.equal(action.href, '/clients/lea/draft/draft-nl?from=today');
});

function pendingDraft(partial: Partial<CoachIntervention> & Pick<CoachIntervention, 'id' | 'client_id' | 'kind'>): CoachIntervention {
  return {
    coach_id: 'coach',
    title: null,
    rationale: 'Tournée : 9 jours sans nouvelle.',
    payload: {},
    status: 'pending',
    source: 'fleet',
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    resolved_at: null,
    ...partial,
  };
}

function client(id: string, name: string): CoachClientSummary {
  return { id, full_name: name, email: `${id}@x.io`, avatar_url: null } as unknown as CoachClientSummary;
}

test('one list: a fleet draft with no local priority becomes a File du jour item for that client', () => {
  const clients = [client('sofia', 'Sofia'), client('lea', 'Léa Martin')];
  const stalled = item({ id: 'stall-1', clientId: 'lea', clientName: 'Léa Martin', kind: 'stalled_lift' });
  const pending = [
    pendingDraft({ id: 'kit-1', client_id: 'sofia', kind: 'keep_in_touch', title: 'Sofia — reprendre contact' }),
    pendingDraft({ id: 'kcal-1', client_id: 'lea', kind: 'calorie_adjustment' }),
  ];
  const drafts = draftQueueItems(pending, [stalled], clients);

  // Léa's kcal draft is already the badge on her stalled_lift → no duplicate row.
  assert.deepEqual(drafts.map(d => d.interventionId), ['kit-1']);
  const sofia = drafts[0];
  assert.equal(sofia.kind, 'draft_pending');
  assert.equal(sofia.clientId, 'sofia');
  assert.equal(sofia.severity, 'yellow');
  assert.equal(sofia.href, '/clients/sofia/draft/kit-1?from=today');
  assert.equal(queueItemLabelKey(sofia), 'coaching.queue.items.draft_pending');
  assert.equal(sofia.headlineParams?.title, 'Sofia — reprendre contact');

  // Untitled draft → falls back to the kind label; kcal/onboarding rank orange.
  const untitled = draftQueueItems([pendingDraft({ id: 'kcal-2', client_id: 'sofia', kind: 'calorie_adjustment' })], [], clients)[0];
  assert.equal(queueItemLabelKey(untitled), 'coaching.interventions.kinds.calorie_adjustment');
  assert.equal(untitled.severity, 'orange');

  // The synthetic item resolves to its own draft, grouped with the rest of the client's items.
  const action = resolveQueueAction(sofia, pending);
  assert.equal(action.kind, 'open_draft');
  assert.equal(action.interventionId, 'kit-1');
  const groups = groupQueueByClient([stalled, ...drafts]);
  assert.deepEqual(groups.map(g => g.clientId), ['lea', 'sofia']);
});

test('drafts for unknown clients or non-pending rows never enter the queue', () => {
  const clients = [client('sofia', 'Sofia')];
  const rows = [
    pendingDraft({ id: 'gone', client_id: 'ghost', kind: 'keep_in_touch' }),
    pendingDraft({ id: 'sent', client_id: 'sofia', kind: 'keep_in_touch', status: 'sent' }),
    pendingDraft({ id: 'coach-only', client_id: null, kind: 'new_question' }),
  ];
  assert.deepEqual(draftQueueItems(rows, [], clients), []);
});
