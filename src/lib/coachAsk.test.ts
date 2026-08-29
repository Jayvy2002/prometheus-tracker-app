import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRosterAsk, parseCoachAsk, resolveAskClientId } from './coachAsk';
import type { ClientOpsRow } from './types';

test('roster questions stay local filters, not the copilot agent', () => {
  assert.equal(isRosterAsk('Qui stagne depuis 3 semaines ?'), true);
  assert.equal(parseCoachAsk('Qui a signalé une douleur cette semaine ?').type, 'roster');
});

test('create-program and why-lift questions are not roster filters', () => {
  assert.equal(isRosterAsk('Crée un programme IA pour Marie'), false);
  assert.equal(parseCoachAsk('Pourquoi Marie ne progresse pas au squat ?').type !== 'roster', true);
});

test('free-text about Nadia is an Ask (not roster) and binds her client id', () => {
  const q = 'Comment va Nadia cette semaine ?';
  assert.equal(isRosterAsk(q), false);
  const intent = parseCoachAsk(q);
  assert.equal(intent.type, 'client');
  const nadia: ClientOpsRow = {
    client: {
      id: 'nadia-id',
      full_name: 'Nadia Benali',
      email: 'nadia@example.com',
      avatar_url: '',
      linked_at: '2026-07-01T00:00:00Z',
      onboarding_completed: true,
      goal: 'cut',
      training_frequency: 4,
      target_weight_kg: 60,
      weight_kg: 64,
      last_visited_at: null,
      last_nudged_at: null,
    },
    alerts: [],
    hasScheduledTrainingToday: true,
    hasProgram: true,
    setupCompleted: true,
  };
  const other: ClientOpsRow = { ...nadia, client: { ...nadia.client, id: 'hugo-id', full_name: 'Hugo Pelletier', email: 'hugo@example.com' } };
  assert.equal(resolveAskClientId(intent, [other, nadia], q), 'nadia-id');
  assert.equal(resolveAskClientId(intent, [other, nadia], 'Comment va Nadia ?'), 'nadia-id');
  assert.equal(resolveAskClientId(parseCoachAsk('Comment va Hugo ?'), [other, nadia], 'Comment va Hugo ?'), 'hugo-id');
});
