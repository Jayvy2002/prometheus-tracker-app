import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  isProgramDayDue,
  pickNextInOrder,
  pickNextTrainingDay,
  resolveClientGymCard,
} from '../../../lib/clientGym';
import type { ProgramDay } from '../../../lib/types';
import { planMarkForDate } from './planCalendar';
import { normalizeSessionOrganization, sessionOrderLetter } from './sessionOrganization';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import { programSessionLabel } from './namedSession';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function day(partial: Partial<ProgramDay> & Pick<ProgramDay, 'id' | 'name'>): ProgramDay {
  return {
    program_id: 'prog',
    routine_id: null,
    weekday: partial.weekday ?? null,
    order_index: partial.order_index ?? 0,
    exercises: partial.exercises ?? [{
      id: `${partial.id}-ex`,
      program_day_id: partial.id,
      name: 'Squat',
      default_sets: 3,
      default_reps: 8,
      default_rest_seconds: 90,
      order_index: 0,
      created_at: '',
    }],
    created_at: '',
    ...partial,
  };
}

const sequence = [
  day({ id: 'a', name: 'A', order_index: 0, weekday: null }),
  day({ id: 'b', name: 'B', order_index: 1, weekday: null }),
  day({ id: 'c', name: 'C', order_index: 2, weekday: null }),
];

test('unknown organization falls back to fixed_days; letters follow order', () => {
  assert.equal(normalizeSessionOrganization(undefined), 'fixed_days');
  assert.equal(normalizeSessionOrganization('in_order'), 'in_order');
  assert.equal(normalizeSessionOrganization('sequence_mode'), 'fixed_days');
  assert.equal(sessionOrderLetter(0), 'A');
  assert.equal(sessionOrderLetter(2), 'C');
});

test('in_order advances A→B→C and wraps; training another weekday does not skip', () => {
  assert.equal(pickNextInOrder(sequence, null)?.name, 'A');
  assert.equal(pickNextInOrder(sequence, 'a')?.name, 'B');
  assert.equal(pickNextInOrder(sequence, 'c')?.name, 'A');

  const sundayAfterA = resolveClientGymCard({
    hasActiveProgram: true,
    days: sequence,
    sessionOrganization: 'in_order',
    assignmentId: 'asg',
    workouts: [{
      id: 'w1',
      date: '2026-08-31T12:00:00',
      completed: true,
      program_day_id: 'a',
      program_assignment_id: 'asg',
    }],
    todayWeekday: 0,
    todayDate: '2026-09-06',
  });
  assert.equal(sundayAfterA.kind, 'start');
  assert.equal(sundayAfterA.day?.name, 'B');
  assert.equal(sundayAfterA.isToday, true);
  assert.equal(isProgramDayDue(sundayAfterA), true);
});

test('in_order completed today shows next in sequence, not next weekday', () => {
  const card = resolveClientGymCard({
    hasActiveProgram: true,
    days: sequence,
    sessionOrganization: 'in_order',
    assignmentId: 'asg',
    workouts: [{
      id: 'w1',
      date: '2026-09-02T18:00:00',
      completed: true,
      program_day_id: 'b',
      program_assignment_id: 'asg',
    }],
    todayWeekday: 3,
    todayDate: '2026-09-02',
  });
  assert.equal(card.kind, 'done_next');
  assert.equal(card.doneDay?.name, 'B');
  assert.equal(card.nextDay?.name, 'C');
});

test('fixed_days still picks by weekday; in_order calendar never invents a date', () => {
  assert.equal(pickNextTrainingDay([
    day({ id: 'mon', name: 'Push', weekday: 1, order_index: 0 }),
    day({ id: 'fri', name: 'Legs', weekday: 5, order_index: 1 }),
  ], 0, false)?.name, 'Push');

  const invented = planMarkForDate({
    date: '2026-09-21',
    days: sequence,
    workouts: [],
    assignmentId: 'asg',
    startDate: '2026-09-01',
    durationWeeks: 8,
    assignmentStatus: 'active',
    sessionOrganization: 'in_order',
  });
  assert.equal(invented, null);

  const logged = planMarkForDate({
    date: '2026-09-16',
    days: sequence,
    workouts: [{
      id: 'w-seq',
      date: '2026-09-16T12:00:00',
      completed: true,
      program_day_id: 'b',
      program_assignment_id: 'asg',
      name: 'B',
    }],
    assignmentId: 'asg',
    startDate: '2026-09-01',
    durationWeeks: 8,
    assignmentStatus: 'active',
    sessionOrganization: 'in_order',
  });
  assert.equal(logged?.status, 'done');
  assert.equal(logged?.dayName, 'B');
});

test('programSessionLabel omits weekday when the session has none', () => {
  assert.equal(programSessionLabel({ weekday: 1, name: 'Upper' }, n => ['Dim', 'Lun'][n] ?? ''), 'Lun · Upper');
  assert.equal(programSessionLabel({ weekday: null, name: 'Lower' }, () => 'Lun'), 'Lower');
});

test('P3.1 migration is the latest save_program / create_program_complete and UI stays jargon-free', () => {
  const save = latestMigrationContaining(/CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.equal(save.file, '20260919194159_program_session_organization.sql');
  assert.match(save.sql, /p_session_organization text DEFAULT NULL/);
  assert.match(save.sql, /coached_client_cannot_edit_program/);
  assert.match(save.sql, /GRANT EXECUTE ON FUNCTION public\.save_program\(uuid, text, text, int, jsonb, timestamptz, text\) TO authenticated/);
  assert.doesNotMatch(save.sql, /apply_athlete_watch_minimum/);

  const create = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.create_program_complete');
  assert.equal(create.file, '20260919194159_program_session_organization.sql');
  assert.match(create.sql, /p_session_organization text DEFAULT 'fixed_days'/);
  assert.match(create.sql, /Toute erreur annule tout/);

  const editor = src('src/components/coaching/ProgramSessionEditor.tsx');
  assert.match(editor, /session-organization/);
  assert.match(editor, /organizationFixed/);
  assert.match(editor, /organizationInOrder/);
  assert.doesNotMatch(editor, /sequence_mode|weekday_mode|schedule_strategy/);

  const store = src('src/stores/programStore.ts');
  assert.match(store, /p_session_organization/);

  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /Jours fixes/);
  assert.match(fr, /Dans l’ordre/);
  assert.match(en, /Fixed days/);
  assert.match(en, /In order/);
  assert.doesNotMatch(fr, /sequence_mode/);
  assert.doesNotMatch(en, /schedule_strategy/);

  assert.match(src('src/components/calendar/CalendarPage.tsx'), /sessionOrganization: assignment\?\.program\?\.session_organization/);
  assert.match(src('src/components/dashboard/ClientGymCard.tsx'), /typeof day\.weekday === 'number'/);
  assert.match(src('.github/workflows/ci.yml'), /program_session_organization\.sql/);
  assert.match(src('supabase/schema_migrations.lock.json'), /20260919194159/);
  assert.doesNotMatch(src('supabase/migrations.pending.json'), /20260919194159/);
});
