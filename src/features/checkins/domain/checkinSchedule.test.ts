import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkinOverdueForCoach, isCheckinDue, lastDueDate, nextDueDate, periodDays } from './checkinSchedule';

// 2026-09-21 is a Monday (weekday 1).
test('weekly on Monday: due from Monday until a check-in is made', () => {
  const plan = { frequency: 'weekly' as const, weekday: 1, anchor_date: '2026-09-17' };
  assert.equal(lastDueDate(plan, '2026-09-20'), null, 'nothing expected before the first Monday');
  assert.equal(lastDueDate(plan, '2026-09-23'), '2026-09-21');
  assert.equal(nextDueDate(plan, '2026-09-23'), '2026-09-28');
  assert.equal(isCheckinDue(plan, null, '2026-09-23'), true);
  assert.equal(isCheckinDue(plan, '2026-09-22', '2026-09-23'), false);
  assert.equal(isCheckinDue(plan, '2026-09-19', '2026-09-23'), true, 'a check-in before the due date does not count');
});

test('every two weeks counts from the first matching day', () => {
  const plan = { frequency: 'biweekly' as const, weekday: 1, anchor_date: '2026-09-21' };
  assert.equal(lastDueDate(plan, '2026-09-30'), '2026-09-21');
  assert.equal(lastDueDate(plan, '2026-10-05'), '2026-10-05');
  assert.equal(nextDueDate(plan, '2026-09-30'), '2026-10-05');
});

test('monthly keeps the day of the month, clamped to short months', () => {
  const plan = { frequency: 'monthly' as const, weekday: null, anchor_date: '2026-01-31' };
  assert.equal(lastDueDate(plan, '2026-02-28'), '2026-02-28');
  assert.equal(lastDueDate(plan, '2026-03-15'), '2026-02-28');
  assert.equal(nextDueDate(plan, '2026-03-15'), '2026-03-31');
});

test('daily is due every day not yet checked in', () => {
  const plan = { frequency: 'daily' as const, weekday: null, anchor_date: '2026-09-01' };
  assert.equal(isCheckinDue(plan, '2026-09-23', '2026-09-23'), false);
  assert.equal(isCheckinDue(plan, '2026-09-22', '2026-09-23'), true);
  assert.equal(periodDays('biweekly'), 14);
});

test('the coach hears about a check-in only after its rhythm and a grace period', () => {
  const weekly = { frequency: 'weekly' as const, weekday: 1, anchor_date: '2026-09-01' };
  // Due Monday 21; Tuesday 22 is inside the grace; Wednesday 23 is past it.
  assert.equal(checkinOverdueForCoach({ plan: weekly, lastCheckinDate: '2026-09-14', today: '2026-09-22', linkedAt: '2026-08-01' }), false);
  assert.equal(checkinOverdueForCoach({ plan: weekly, lastCheckinDate: '2026-09-14', today: '2026-09-23', linkedAt: '2026-08-01' }), true);
  assert.equal(checkinOverdueForCoach({ plan: weekly, lastCheckinDate: '2026-09-21', today: '2026-09-25', linkedAt: '2026-08-01' }), false);
  // A client linked after the due date has missed nothing.
  assert.equal(checkinOverdueForCoach({ plan: weekly, lastCheckinDate: null, today: '2026-09-23', linkedAt: '2026-09-22' }), false);
  // Monthly: two weeks without a check-in is normal.
  const monthly = { frequency: 'monthly' as const, weekday: null, anchor_date: '2026-09-01' };
  assert.equal(checkinOverdueForCoach({ plan: monthly, lastCheckinDate: '2026-09-01', today: '2026-09-20', linkedAt: '2026-08-01' }), false);
  // No rhythm: a whole week of silence.
  assert.equal(checkinOverdueForCoach({ plan: null, lastCheckinDate: '2026-09-17', today: '2026-09-23', linkedAt: '2026-08-01' }), false);
  assert.equal(checkinOverdueForCoach({ plan: null, lastCheckinDate: '2026-09-16', today: '2026-09-23', linkedAt: '2026-08-01' }), true);
  assert.equal(checkinOverdueForCoach({ plan: null, lastCheckinDate: null, today: '2026-09-23', linkedAt: '2026-09-20' }), false);
});
