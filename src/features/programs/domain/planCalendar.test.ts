import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { planMarkForDate, weekdayFromDateStr } from './planCalendar';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const days = [
  { id: 'mon', weekday: 1, name: 'Haut du corps', exercises: [{ id: 'e1' }] },
  { id: 'tue', weekday: 2, name: '', exercises: [] },
];

test('weekdayFromDateStr uses civil noon, not UTC midnight', () => {
  assert.equal(weekdayFromDateStr('2026-09-14'), 1);
  assert.equal(weekdayFromDateStr('2026-09-15'), 2);
});

test('UX47 scheduled due stays visible when there is no log', () => {
  const pastMonday = planMarkForDate({
    date: '2026-09-14',
    days,
    workouts: [],
    assignmentId: 'asg',
    startDate: '2026-09-01',
  });
  assert.equal(pastMonday?.status, 'scheduled');
  assert.equal(pastMonday?.dayName, 'Haut du corps');
  assert.equal(pastMonday?.workoutId, null);
});

test('UX47 rest weekday is not invented; recale session still named', () => {
  assert.equal(planMarkForDate({
    date: '2026-09-15',
    days,
    workouts: [],
    assignmentId: 'asg',
    startDate: '2026-09-01',
  }), null);

  const recaled = planMarkForDate({
    date: '2026-09-15',
    days,
    workouts: [{
      id: 'w-recal',
      date: '2026-09-15T12:00:00',
      completed: true,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
      name: 'Haut du corps',
    }],
    assignmentId: 'asg',
    startDate: '2026-09-01',
  });
  assert.equal(recaled?.status, 'done');
  assert.equal(recaled?.dayName, 'Haut du corps');
  assert.equal(recaled?.workoutId, 'w-recal');
});

test('UX47 started vs done; hors-programme log does not close the due', () => {
  const started = planMarkForDate({
    date: '2026-09-14',
    days,
    workouts: [{
      id: 'open',
      date: '2026-09-14T08:00:00',
      completed: false,
      program_day_id: 'mon',
      program_assignment_id: 'asg',
    }],
    assignmentId: 'asg',
    startDate: '2026-09-01',
  });
  assert.equal(started?.status, 'started');
  assert.equal(started?.workoutId, 'open');

  const hors = planMarkForDate({
    date: '2026-09-14',
    days,
    workouts: [{
      id: 'free',
      date: '2026-09-14T08:00:00',
      completed: true,
      program_day_id: null,
      program_assignment_id: null,
    }],
    assignmentId: 'asg',
    startDate: '2026-09-01',
  });
  assert.equal(hors?.status, 'scheduled');
});

test('UX47 does not invent a day before assignment start', () => {
  assert.equal(planMarkForDate({
    date: '2026-08-31',
    days,
    workouts: [],
    assignmentId: 'asg',
    startDate: '2026-09-01',
  }), null);
});

test('UX47 calendar page shows plan states without dropping logged points', () => {
  const page = src('src/components/calendar/CalendarPage.tsx');
  assert.match(page, /planMarkForDate/);
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
