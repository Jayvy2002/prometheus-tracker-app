import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRosterAsk, parseCoachAsk } from './coachAsk';

test('roster questions stay local filters, not Second', () => {
  assert.equal(isRosterAsk('Qui stagne depuis 3 semaines ?'), true);
  assert.equal(parseCoachAsk('Qui a signalé une douleur cette semaine ?').type, 'roster');
});

test('create-program and why-lift questions are not roster filters', () => {
  assert.equal(isRosterAsk('Crée un programme IA pour Marie'), false);
  assert.equal(parseCoachAsk('Pourquoi Marie ne progresse pas au squat ?').type !== 'roster', true);
});
