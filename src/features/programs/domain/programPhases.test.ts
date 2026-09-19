import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import {
  phaseNameForDay,
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
  assert.match(src('src/components/workout/WorkoutPage.tsx'), /phaseName=\{resolveCurrentPhase/);
  assert.match(src('src/components/calendar/CalendarPage.tsx'), /phases: assignment\?\.program\?\.phases/);
  assert.match(src('src/components/programs/ClientProgramPage.tsx'), /program-current-phase/);
});
