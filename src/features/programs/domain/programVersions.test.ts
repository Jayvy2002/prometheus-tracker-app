import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import { planMarkForDate, planCanInventScheduled } from './planCalendar';
import { programGraphForDate, revisionVersionState } from './programVersions';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('version states are derived, not a second engine', () => {
  assert.equal(revisionVersionState({ revisionNo: 2, activeRevisionNo: 2 }), 'active');
  assert.equal(revisionVersionState({ revisionNo: 3, activeRevisionNo: 2, scheduledRevisionNo: 3 }), 'scheduled');
  assert.equal(revisionVersionState({ revisionNo: 1, activeRevisionNo: 2, activatedAt: '2026-09-19' }), 'historical');
  assert.equal(revisionVersionState({ revisionNo: 4, activeRevisionNo: 2 }), 'saved');
});

test('calendar can show a future version after activation day without inventing sequence dates', () => {
  const live = [{ id: 'a', weekday: 1, name: 'Push', exercises: [{ id: 'e1' }] }];
  const future = [{ id: 'b', weekday: 1, name: 'Lower', exercises: [{ id: 'e2' }] }];
  const before = programGraphForDate({
    date: '2026-09-20',
    liveDays: live,
    livePhases: [],
    scheduledActivatesOn: '2026-09-21',
    scheduledDays: future,
    scheduledPhases: [],
  });
  assert.equal(before.days[0].name, 'Push');
  const after = programGraphForDate({
    date: '2026-09-21',
    liveDays: live,
    livePhases: [],
    liveDurationWeeks: 4,
    liveVersionStart: '2026-09-01',
    scheduledActivatesOn: '2026-09-21',
    scheduledDays: future,
    scheduledPhases: [],
    scheduledDurationWeeks: 12,
  });
  assert.equal(after.days[0].name, 'Lower');
  assert.equal(after.durationWeeks, 12);
  assert.equal(after.versionStart, '2026-09-21');
  assert.equal(planCanInventScheduled({
    date: '2026-12-13',
    startDate: after.versionStart,
    durationWeeks: after.durationWeeks,
  }), true);
  assert.equal(planCanInventScheduled({
    date: '2026-12-14',
    startDate: after.versionStart,
    durationWeeks: after.durationWeeks,
  }), false);

  const afterAssign = programGraphForDate({
    date: '2026-09-22',
    liveDays: live,
    livePhases: [],
    liveVersionStart: '2026-09-01',
    assignmentStartDate: '2026-09-30',
    scheduledActivatesOn: '2026-09-21',
    scheduledDays: future,
    scheduledPhases: [],
    scheduledDurationWeeks: 12,
  });
  assert.equal(afterAssign.versionStart, '2026-09-30');
  assert.equal(Array.isArray(afterAssign.days) && afterAssign.days.length, 0);
  assert.equal(planCanInventScheduled({
    date: '2026-09-22',
    startDate: afterAssign.versionStart,
    durationWeeks: afterAssign.durationWeeks,
  }), false);

  const onAssignStart = programGraphForDate({
    date: '2026-09-30',
    liveDays: live,
    livePhases: [],
    liveVersionStart: '2026-09-01',
    assignmentStartDate: '2026-09-30',
    scheduledActivatesOn: '2026-09-21',
    scheduledDays: future,
    scheduledPhases: [],
    scheduledDurationWeeks: 12,
  });
  assert.equal(onAssignStart.days[0].name, 'Lower');
  assert.equal(onAssignStart.versionStart, '2026-09-30');

  const beforeActivation = programGraphForDate({
    date: '2026-09-10',
    liveDays: live,
    livePhases: [],
    liveVersionStart: '2026-09-01',
    assignmentStartDate: '2026-07-01',
  });
  assert.equal(beforeActivation.versionStart, '2026-09-01');

  const sequence = planMarkForDate({
    date: '2026-09-22',
    days: [{ id: 's', weekday: null, name: 'Lower', exercises: [{ id: 'e1' }] }],
    workouts: [],
    startDate: '2026-09-01',
    durationWeeks: 8,
    assignmentStatus: 'active',
    sessionOrganization: 'in_order',
  });
  assert.equal(sequence, null);
});

test('never-activated revisions stay saved, not historical', () => {
  assert.equal(revisionVersionState({ revisionNo: 4, activeRevisionNo: 2 }), 'saved');
  assert.equal(revisionVersionState({
    revisionNo: 1,
    activeRevisionNo: 2,
    activatedAt: null,
    supersededAt: null,
  }), 'saved');
  assert.equal(revisionVersionState({
    revisionNo: 1,
    activeRevisionNo: 2,
    activatedAt: '2026-07-01',
    supersededAt: '2026-09-01',
  }), 'historical');
});

test('P3.3 reuses program_revisions and the same logger', () => {
  const found = latestMigrationContaining('CREATE FUNCTION public.activate_program_version');
  assert.equal(found.file, '20260919233853_program_versions.sql');
  assert.match(found.sql, /CREATE FUNCTION public\.save_program_version/);
  assert.match(found.sql, /CREATE FUNCTION public\.schedule_program_version/);
  assert.match(found.sql, /CREATE FUNCTION public\.activate_program_version/);
  assert.match(found.sql, /CREATE FUNCTION public\.ensure_due_program_version/);
  assert.match(found.sql, /program_revision_no/);
  assert.match(found.sql, /coached_client_cannot_edit_program/);
  assert.match(found.sql, /actor_can_activate_program_version/);
  assert.match(found.sql, /REVOKE ALL ON FUNCTION public\.apply_program_revision_snapshot/);
  assert.doesNotMatch(found.sql, /CREATE TABLE public\.program_versioning/);
  assert.doesNotMatch(found.sql, /CREATE TABLE public\.(mesocycles|program_cycles)/);
  assert.doesNotMatch(found.sql, /apply_athlete_watch_minimum/);

  const hard = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.save_program_version');
  assert.equal(hard.file, '20260920014500_p3_hardening.sql');
  assert.match(hard.sql, /validate_program_graph_payload/);
  assert.match(hard.sql, /CREATE OR REPLACE FUNCTION public\.ensure_due_program_version/);
  assert.match(hard.sql, /scheduled_activation_timezone/);
  assert.match(hard.sql, /p_anchor_mode text/);
  assert.match(hard.sql, /apply_program_revision_snapshot\(p_program_id, p_revision_no, 'now'\)/);
  assert.match(hard.sql, /apply_program_revision_snapshot\(p_program_id, v_sched, 'scheduled'\)/);
  assert.match(hard.sql, /CREATE OR REPLACE FUNCTION public\.delete_program/);
  assert.match(
    hard.sql,
    /FROM public\.programs\s+WHERE id = p_program_id\s+FOR UPDATE/,
  );

  const store = src('src/stores/programStore.ts');
  assert.match(store, /rpc\('save_program_version'/);
  assert.match(store, /rpc\('schedule_program_version'/);
  assert.match(store, /rpc\('activate_program_version'/);
  assert.match(store, /rpc\('ensure_due_program_version'/);
  assert.match(store, /start_workout_from_template|saveProgram/);
  assert.doesNotMatch(store, /program_versioning/);

  const editor = src('src/components/programs/ProgramEditorPage.tsx');
  assert.match(editor, /program-versions-advanced/);
  assert.match(editor, /program-save-future-version/);
  assert.match(editor, /min=\{programClock\.today\}/);
  assert.match(editor, /activationDateInPast/);
  const athlete = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(athlete, /program-planned-change/);
  const calendar = src('src/components/calendar/CalendarPage.tsx');
  assert.match(calendar, /programGraphForDate/);
  assert.match(calendar, /scheduled_snapshot/);
  assert.match(calendar, /parseRevisionMeta/);
  assert.match(calendar, /liveVersionStart/);
  assert.match(calendar, /assignmentStartDate/);
  assert.match(calendar, /const program = assignment\?\.program/);
  assert.match(calendar, /useProgramCivilClock/);

  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /versionsAdvanced:/);
  assert.match(en, /versionsAdvanced:/);
  assert.match(src('.github/workflows/ci.yml'), /program_versions\.sql/);
  assert.match(src('supabase/tests/program_versions.sql'), /\\echo 'program versions:/);
  assert.doesNotMatch(src('supabase/migrations.pending.json'), /20260919233853/);
  assert.match(src('supabase/migrations.pending.json'), /20260920014500/);
  assert.match(src('supabase/schema_migrations.lock.json'), /20260919233853/);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260920014500/);
});
