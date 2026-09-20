import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import { civilDateInTimeZone, civilDateOrdinal, civilDaysBetween, programWeekNumber } from '../../../lib/utils';
import {
  daysForCurrentPhase,
  effectiveVersionStart,
  multiPhaseSharedWeekdaysNeedDuration,
  phaseAnchorDate,
  phaseNameForDay,
  phasesHaveMixedDurations,
  PROGRAM_EXERCISE_MAX_SETS,
  resolveCurrentPhase,
  type ProgramPhase,
} from './programPhases';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const phases: ProgramPhase[] = [
  { id: 'p1', name: 'Accumulation', order_index: 0, duration_weeks: 4 },
  { id: 'p2', name: 'Intensification', order_index: 1, duration_weeks: 4 },
  { id: 'p3', name: 'Deload', order_index: 2, duration_weeks: 1 },
];

test('simple program has no current phase', () => {
  assert.equal(resolveCurrentPhase({ phases: [] }), null);
  assert.equal(phaseNameForDay([], { phase_id: 'p1' }), null);
});

test('one phase and several ordered phases walk by duration', () => {
  assert.equal(resolveCurrentPhase({
    phases: [phases[0]],
    startDate: '2026-09-01',
    today: '2026-09-10',
  })?.name, 'Accumulation');

  assert.equal(resolveCurrentPhase({
    phases,
    startDate: '2026-09-01',
    today: '2026-09-01',
  })?.name, 'Accumulation');
  assert.equal(resolveCurrentPhase({
    phases,
    startDate: '2026-09-01',
    today: '2026-09-29',
  })?.name, 'Intensification');
  assert.equal(resolveCurrentPhase({
    phases,
    startDate: '2026-09-01',
    today: '2026-10-27',
  })?.name, 'Deload');
  assert.equal(resolveCurrentPhase({
    phases,
    startDate: '2026-09-01',
    today: '2026-12-01',
  })?.name, 'Deload');
});

test('without durations, current phase follows the next session', () => {
  const untimed: ProgramPhase[] = [
    { id: 'a', name: 'Block A', order_index: 0, duration_weeks: null },
    { id: 'b', name: 'Block B', order_index: 1, duration_weeks: null },
  ];
  assert.equal(resolveCurrentPhase({
    phases: untimed,
    nextDay: { phase_id: 'b' },
  })?.name, 'Block B');
});

test('shared weekdays across phases require explicit durations', () => {
  const untimed = [
    { duration_weeks: null },
    { duration_weeks: null },
  ];
  assert.equal(multiPhaseSharedWeekdaysNeedDuration('fixed_days', untimed, [
    { weekday: 1, phase_id: 'a' },
    { weekday: 1, phase_id: 'b' },
  ]), true);
  assert.equal(multiPhaseSharedWeekdaysNeedDuration('fixed_days', untimed, [
    { weekday: 1, phase_id: 'a' },
    { weekday: 2, phase_id: 'b' },
  ]), false);
  assert.equal(multiPhaseSharedWeekdaysNeedDuration('fixed_days', [
    { duration_weeks: 4 },
    { duration_weeks: 4 },
  ], [
    { weekday: 1, phase_id: 'a' },
    { weekday: 1, phase_id: 'b' },
  ]), false);
  assert.equal(multiPhaseSharedWeekdaysNeedDuration('in_order', untimed, [
    { weekday: 1, phase_id: 'a' },
    { weekday: 1, phase_id: 'b' },
  ]), false);
  assert.equal(effectiveVersionStart('2026-07-01', '2026-09-21'), '2026-09-21');
});

test('program week and civil date follow the version/profile clock', () => {
  assert.equal(programWeekNumber('2026-09-21', 8, '2026-09-21'), 1);
  assert.equal(programWeekNumber('2026-07-01', 8, '2026-09-21'), 8);
  const boundary = new Date('2026-09-08T06:30:00Z');
  assert.equal(civilDateInTimeZone('America/Vancouver', boundary), '2026-09-07');
  assert.equal(civilDateInTimeZone('UTC', boundary), '2026-09-08');
});

test('assignment after activation starts week 1; earlier assignment uses the activation date', () => {
  assert.equal(effectiveVersionStart('2026-07-01', '2026-09-01'), '2026-09-01');
  assert.equal(effectiveVersionStart('2026-09-30', '2026-09-01'), '2026-09-30');
  assert.equal(effectiveVersionStart('2026-09-30', null), '2026-09-30');
  assert.equal(phaseAnchorDate('2026-09-30', '2026-09-01'), '2026-09-30');
  assert.equal(resolveCurrentPhase({
    phases,
    startDate: effectiveVersionStart('2026-09-30', '2026-09-01'),
    today: '2026-09-30',
  })?.name, 'Accumulation');
  assert.equal(programWeekNumber(effectiveVersionStart('2026-09-30', '2026-09-01')!, 8, '2026-09-30'), 1);
  assert.equal(PROGRAM_EXERCISE_MAX_SETS, 20);
  assert.equal(daysForCurrentPhase(
    [{ id: 'a', phase_id: 'p1' }, { id: 'a2', phase_id: 'p2' }],
    phases[0],
  ).map(d => d.id).join(','), 'a');
});

test('mixed timed/untimed phases are explicit, not a silent 1-week span', () => {
  const mixed: ProgramPhase[] = [
    { id: 't', name: 'Timed', order_index: 0, duration_weeks: 4 },
    { id: 'u', name: 'Untimed', order_index: 1, duration_weeks: null },
  ];
  assert.equal(phasesHaveMixedDurations(mixed), true);
  assert.equal(phasesHaveMixedDurations(phases), false);
  assert.equal(resolveCurrentPhase({
    phases: mixed,
    startDate: '2026-09-01',
    today: '2026-10-01',
    nextDay: { phase_id: 'u' },
  })?.name, 'Untimed');
});

test('civil day math is DST-safe for Toronto 2026 spring/fall', () => {
  assert.equal(civilDaysBetween('2026-03-07', '2026-03-14'), 7);
  assert.equal(civilDaysBetween('2026-11-01', '2026-11-08'), 7);
  assert.equal(civilDateOrdinal('2026-03-14')! - civilDateOrdinal('2026-03-07')!, 7);
  assert.equal(programWeekNumber('2026-03-08', 12, '2026-03-15'), 2);
  const localHours = (new Date(2026, 2, 14).getTime() - new Date(2026, 2, 7).getTime()) / 3_600_000;
  if (localHours !== 168) {
    assert.equal(Math.floor(localHours / 24), 6);
    assert.equal(civilDaysBetween('2026-03-07', '2026-03-14'), 7);
  }
});

test('P3.2 migration extends the existing engine without a second logger', () => {
  const found = latestMigrationContaining('CREATE TABLE public.program_phases');
  assert.equal(found.file, '20260919225507_program_phases.sql');
  assert.match(found.sql, /program_days[\s\S]*phase_id/);
  assert.match(found.sql, /prescribed_phase_name/);
  assert.match(found.sql, /sync_program_phases/);
  assert.match(found.sql, /p_phases jsonb DEFAULT NULL/);
  assert.match(found.sql, /DROP FUNCTION IF EXISTS public\.save_program\(uuid, text, text, int, jsonb, timestamptz, text\)/);
  assert.match(found.sql, /coached_client_cannot_edit_program/);
  assert.match(found.sql, /start_workout_from_template/);
  assert.doesNotMatch(found.sql, /CREATE TABLE public\.(mesocycles|program_cycles|macrocycles)\b/);
  assert.doesNotMatch(found.sql, /CREATE TABLE public\.(calendar_programs|sequence_programs)\b/);

  const store = src('src/stores/programStore.ts');
  assert.match(store, /p_phases/);
  assert.match(store, /program_phases\(/);

  const editor = src('src/components/coaching/ProgramSessionEditor.tsx');
  assert.match(editor, /program-phases-advanced/);
  assert.doesNotMatch(editor, /Mesocycle|PhaseEngine|PhasePicker/);

  const app = src('src/app/router/AppRoutes.tsx');
  assert.doesNotMatch(app, /\/phases|MesocycleEditor/);

  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /phasesAdvanced:/);
  assert.match(en, /phasesAdvanced:/);
  assert.doesNotMatch(fr, /mésocycle/);
  assert.doesNotMatch(en, /mesocycle/);

  assert.match(src('.github/workflows/ci.yml'), /program_phases\.sql/);
  assert.match(src('supabase/tests/program_phases.sql'), /\\echo 'program phases:/);
  assert.doesNotMatch(src('supabase/migrations.pending.json'), /20260919225507/);
  assert.match(src('supabase/schema_migrations.lock.json'), /20260919225507/);

  assert.match(src('src/components/dashboard/Dashboard.tsx'), /phaseName=\{gymPhaseName\}/);
  assert.match(src('src/components/workout/WorkoutPage.tsx'), /phaseName=\{gymCard\.phase\?\.name\}/);
  assert.match(src('src/components/calendar/CalendarPage.tsx'), /phases: graph\.phases/);
  assert.match(src('src/components/calendar/CalendarPage.tsx'), /useProgramCivilClock/);
  assert.match(src('src/components/workout/WorkoutPage.tsx'), /lastCompletedWorkout\(workouts, programClock\.today\)/);
  assert.match(src('src/components/programs/ClientProgramPage.tsx'), /program-current-phase/);
});
