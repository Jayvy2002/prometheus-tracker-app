import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  planCanInventScheduled,
  planExclusiveEndDate,
  planMarkForDate,
  weekdayFromDateStr,
  type PlanCalendarMark,
} from './planCalendar';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const days = [
  { id: 'mon', weekday: 1, name: 'Haut du corps', exercises: [{ id: 'e1' }] },
  { id: 'tue', weekday: 2, name: '', exercises: [] },
];

const active = {
  assignmentId: 'asg',
  startDate: '2026-09-01',
  durationWeeks: 8,
  assignmentStatus: 'active' as const,
};

function mark(
  date: string,
  extra: Partial<Parameters<typeof planMarkForDate>[0]> = {},
): PlanCalendarMark | null {
  return planMarkForDate({
    date,
    days,
    workouts: [],
    ...active,
    ...extra,
  });
}

test('weekdayFromDateStr uses civil noon, not UTC midnight', () => {
  assert.equal(weekdayFromDateStr('2026-09-14'), 1);
  assert.equal(weekdayFromDateStr('2026-09-15'), 2);
});

test('8-week program exclusive end is start plus 56 civil days', () => {
  assert.equal(planExclusiveEndDate('2026-09-01', 8), '2026-10-27');
  assert.equal(planCanInventScheduled({
    date: '2026-10-26',
    startDate: '2026-09-01',
    durationWeeks: 8,
  }), true);
  assert.equal(planCanInventScheduled({
    date: '2026-10-27',
    startDate: '2026-09-01',
    durationWeeks: 8,
  }), false);
});

test('UX47 scheduled due stays visible when there is no log', () => {
  const pastMonday = mark('2026-09-14');
  assert.equal(pastMonday?.status, 'scheduled');
  assert.equal(pastMonday?.dayName, 'Haut du corps');
  assert.equal(pastMonday?.workoutId, null);
});

test('UX47 rest weekday is not invented; recale session still named', () => {
  assert.equal(mark('2026-09-15'), null);

  const recaled = mark('2026-09-15', {
    workouts: [{
      id: 'w-recal',
      date: '2026-09-15T12:00:00',
      completed: true,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
      name: 'Haut du corps',
    }],
  });
  assert.equal(recaled?.status, 'done');
  assert.equal(recaled?.dayName, 'Haut du corps');
  assert.equal(recaled?.workoutId, 'w-recal');
});

test('UX47 started vs done; hors-programme log does not close the due', () => {
  const started = mark('2026-09-14', {
    workouts: [{
      id: 'open',
      date: '2026-09-14T08:00:00',
      completed: false,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
    }],
  });
  assert.equal(started?.status, 'started');
  assert.equal(started?.workoutId, 'open');

  const hors = mark('2026-09-14', {
    workouts: [{
      id: 'free',
      date: '2026-09-14T08:00:00',
      completed: true,
      program_day_id: null,
      program_assignment_id: null,
    }],
  });
  assert.equal(hors?.status, 'scheduled');
});

test('before the assignment start: no invented scheduled day', () => {
  assert.equal(mark('2026-08-31'), null);
});

test('during an active program: future training day is scheduled with its name', () => {
  const future = mark('2026-09-21');
  assert.equal(future?.status, 'scheduled');
  assert.equal(future?.dayName, 'Haut du corps');
  assert.equal(future?.workoutId, null);
});

test('after duration_weeks: no new scheduled day; logged history stays', () => {
  assert.equal(mark('2026-11-02'), null);
  const lateLog = mark('2026-11-02', {
    workouts: [{
      id: 'late',
      date: '2026-11-02T12:00:00',
      completed: true,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
      name: 'Haut du corps',
    }],
  });
  assert.equal(lateLog?.status, 'done');
  assert.equal(lateLog?.workoutId, 'late');
});

test('missing duration_weeks fails closed for invented scheduled', () => {
  assert.equal(mark('2026-09-14', { durationWeeks: null }), null);
  assert.equal(mark('2026-09-14', { durationWeeks: 0 }), null);
});

test('active assignment invents scheduled; paused does not invent after it ended', () => {
  assert.equal(mark('2026-09-21', { assignmentStatus: 'active' })?.status, 'scheduled');

  const pausedPastDue = mark('2026-09-14', {
    assignmentStatus: 'paused',
    endedAt: '2026-09-18',
  });
  assert.equal(pausedPastDue?.status, 'scheduled');
  assert.equal(pausedPastDue?.dayName, 'Haut du corps');

  assert.equal(mark('2026-09-21', {
    assignmentStatus: 'paused',
    endedAt: '2026-09-18',
  }), null);
});

test('future after relationship end never invents scheduled; past log stays', () => {
  const ended = {
    assignmentStatus: 'paused' as const,
    endedAt: '2026-09-18T12:00:00.000Z',
  };
  assert.equal(mark('2026-09-21', ended), null);
  assert.equal(mark('2026-09-28', ended), null);

  const pastDone = mark('2026-09-14', {
    ...ended,
    workouts: [{
      id: 'hist',
      date: '2026-09-14T12:00:00',
      completed: true,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
      name: 'Haut du corps',
    }],
  });
  assert.equal(pastDone?.status, 'done');
  assert.equal(pastDone?.workoutId, 'hist');
  assert.equal(pastDone?.dayName, 'Haut du corps');
});

test('paused without endedAt fails closed for scheduled', () => {
  assert.equal(mark('2026-09-14', { assignmentStatus: 'paused', endedAt: null }), null);
});

test('UX47 calendar page shows plan states without dropping logged points', () => {
  const page = src('src/components/calendar/CalendarPage.tsx');
  assert.match(page, /planMarkForDate/);
  assert.match(page, /sessionOrganization: assignment\?\.program\?\.session_organization/);
  assert.match(page, /assignmentStatus: assignment\?\.status/);
  assert.match(page, /endedAt: assignment\?\.status === 'paused'/);
  assert.match(page, /ux47-plan-dot/);
  assert.match(page, /ux47-plan-card/);
  assert.match(page, /calendar\.plan\.scheduled/);
  assert.match(page, /data-testid="calendar-page"/);
  assert.match(page, /data-future=/);
  assert.match(page, /data-selected=\{isSelected \? 'true' : 'false'\}/);
  assert.match(page, /onClick=\{\(\) => setSelectedDate\(day\.date\)\}/);
  assert.doesNotMatch(page, /!isFuture && setSelectedDate/);
  assert.doesNotMatch(page, /saveProgram|updateProgram|syncProgramDays/);
  assert.doesNotMatch(page, /erasePast|deletePast/);
  const fr = src('src/i18n/locales/fr/workout.ts');
  assert.match(fr, /scheduled: 'Prévu'/);
  assert.match(fr, /started: 'Commencé'/);
  assert.match(fr, /done: 'Terminé'/);
  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /node scripts\/test-personal-calendar-browser\.mjs/);
  assert.match(ci, /grep -F 'PASS: coached calendar past\/future' artifacts\/p13\/results\.txt/);
  assert.match(ci, /grep -F 'save_program coached leftover owner guard passed'/);
});

test('calendar can show a session phase without inventing sequence dates', () => {
  const phases = [
    { id: 'p1', name: 'Accumulation', order_index: 0, duration_weeks: 4 },
  ];
  const withPhase = mark('2026-09-14', {
    days: [{ id: 'mon', weekday: 1, name: 'Haut du corps', exercises: [{ id: 'e1' }], phase_id: 'p1' }],
    phases,
  });
  assert.equal(withPhase?.status, 'scheduled');
  assert.equal(withPhase?.phaseName, 'Accumulation');

  const sequence = planMarkForDate({
    date: '2026-09-15',
    days: [{ id: 'a', weekday: null, name: 'Lower', exercises: [{ id: 'e1' }], phase_id: 'p1' }],
    workouts: [],
    phases,
    sessionOrganization: 'in_order',
    ...active,
  });
  assert.equal(sequence, null);
});
