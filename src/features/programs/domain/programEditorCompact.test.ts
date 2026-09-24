import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  isLinkedToNext,
  isLinkedToPrevious,
  linkWithNext,
  nextFreeSupersetGroup,
  removeFromSuperset,
  supersetPartners,
  unlinkFromNext,
} from './programSupersets';
import { exerciseSummaryParts } from './programExerciseSummary';
import { programListSummary } from './programListStatus';
import { programDayExerciseToDraft, programDaysToDraft } from './soloProgram';
import { programExerciseRpcFields } from './programSetPrescription';
import { ALL_ON_TRACKING, type ResolvedTrackingConfig } from '../../../lib/clientTracking';
import type { ProgramDayExercise, ProgramExerciseDraft } from '../types';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

function ex(name: string, superset_group: string | null = null): ProgramExerciseDraft {
  return { name, default_sets: 3, default_reps: 10, superset_group };
}

const groups = (list: ProgramExerciseDraft[]) => list.map(e => e.superset_group ?? null);

test('linking neighbours writes the same superset_group letters as before', () => {
  const day = [ex('Squat'), ex('Fente'), ex('Mollets'), ex('Gainage')];
  const linked = linkWithNext(day, 0);
  assert.deepEqual(groups(linked), ['A', 'A', null, null]);
  assert.equal(isLinkedToNext(linked, 0), true);
  assert.equal(isLinkedToPrevious(linked, 1), true);
  // A third exercise joins the existing group; a new pair takes the next letter.
  assert.deepEqual(groups(linkWithNext(linked, 1)), ['A', 'A', 'A', null]);
  assert.deepEqual(groups(linkWithNext(linked, 2)), ['A', 'A', 'B', 'B']);
  // Linking two existing groups makes one (the logger shows them together).
  assert.deepEqual(groups(linkWithNext([ex('a', 'A'), ex('b', 'A'), ex('c', 'B'), ex('d', 'B')], 1)), ['A', 'A', 'A', 'A']);
  // The last exercise has no next one: nothing changes.
  assert.deepEqual(groups(linkWithNext(day, 3)), [null, null, null, null]);
});

test('unlinking splits the chain; a group of one is cleared', () => {
  const chain = [ex('a', 'A'), ex('b', 'A'), ex('c', 'A')];
  assert.deepEqual(groups(unlinkFromNext(chain, 0)), [null, 'B', 'B']);
  assert.deepEqual(groups(unlinkFromNext(chain, 1)), ['A', 'A', null]);
  assert.deepEqual(groups(unlinkFromNext([ex('a', 'A'), ex('b', 'A')], 0)), [null, null]);
  // Not linked: unchanged.
  assert.deepEqual(groups(unlinkFromNext([ex('a', 'A'), ex('b', 'B')], 0)), ['A', 'B']);
});

test('groups typed by hand before are kept as they are', () => {
  // Non-adjacent members, lower-case or free text: untouched until the coach acts.
  const typed = [ex('a', 'x1'), ex('b'), ex('c', 'x1'), ex('d', ' A ')];
  assert.deepEqual(supersetPartners(typed, 0), [2]);
  assert.equal(isLinkedToNext(typed, 0), false);
  assert.deepEqual(groups(linkWithNext(typed, 1)), ['x1', 'x1', 'x1', ' A ']);
  // Breaking a run keeps the head grouped with its far partner.
  assert.deepEqual(groups(unlinkFromNext([ex('a', 'A'), ex('b', 'A'), ex('c'), ex('d', 'A')], 0)), ['A', null, null, 'A']);
  assert.deepEqual(groups(removeFromSuperset(typed, 0)), [null, null, 'x1', ' A ']);
  assert.equal(nextFreeSupersetGroup(typed), 'B');
  assert.equal(nextFreeSupersetGroup(Array.from({ length: 26 }, (_, i) => ex(String(i), String.fromCharCode(65 + i)))), 'S1');
  // What is written is what the RPC already accepts.
  assert.equal(programExerciseRpcFields(linkWithNext([ex('a'), ex('b')], 0)[1]!).superset_group, 'A');
});

test('compact summary: « 4 × 10 · repos 90 s · RIR 2 », only the tracked fields', () => {
  const row: ProgramExerciseDraft = {
    name: 'Squat', default_sets: 4, default_reps: 10, default_reps_min: null,
    default_rir: 2, default_rest_seconds: 90, default_weight_kg: 80, set_type: 'working',
  };
  assert.deepEqual(exerciseSummaryParts(row, ALL_ON_TRACKING), [
    { key: 'programs.summary.setsReps', params: { sets: 4, reps: '10' } },
    { key: 'programs.summary.load', params: { kg: 80 } },
    { key: 'programs.summary.rest', params: { n: 90 } },
    { key: 'programs.summary.rir', params: { n: 2 } },
  ]);
  const range = exerciseSummaryParts({ ...row, default_reps_min: 6, default_weight_kg: null, set_type: 'drop' }, ALL_ON_TRACKING);
  assert.deepEqual(range[0], { key: 'programs.summary.setsReps', params: { sets: 4, reps: '6–10' } });
  assert.deepEqual(range.at(-1), { key: 'options.setTypes.drop' });
  const noRir: ResolvedTrackingConfig = { ...ALL_ON_TRACKING, training: { ...ALL_ON_TRACKING.training, rir: false, load: false } };
  assert.equal(exerciseSummaryParts(row, noRir).some(p => p.key === 'programs.summary.rir'), false);
});

test('program list status is exact: draft ≠ saved ≠ active', () => {
  assert.equal(programListSummary({ active_revision_no: null }, undefined).lifecycle, 'draft');
  // Assigned without a version number: the client follows it — not a draft.
  assert.equal(programListSummary({ active_revision_no: null }, { active: 1, paused: 0 }).lifecycle, 'active');
  assert.equal(programListSummary({ active_revision_no: null }, { active: 0, paused: 1 }).lifecycle, 'saved');
  assert.equal(programListSummary({ active_revision_no: 3 }, { active: 0, paused: 0 }).lifecycle, 'saved');
  const scheduled = programListSummary({ active_revision_no: 3, scheduled_revision_no: 4, scheduled_activates_on: '2026-10-05' }, { active: 2, paused: 1 });
  assert.equal(scheduled.lifecycle, 'active');
  assert.equal(scheduled.status.kind, 'scheduled');
  assert.equal(scheduled.activeClients, 2);
  assert.equal(scheduled.pausedClients, 1);

  const page = src('src/components/programs/ProgramsPage.tsx');
  assert.match(page, /programListSummary/);
  assert.match(page, /programs\.listStatus\.lifecycle\./);
  for (const lang of ['fr', 'en']) {
    const locale = src(`src/i18n/locales/${lang}/programs.ts`);
    assert.match(locale, /lifecycle: \{/);
    assert.doesNotMatch(locale, /Options avancées — version future|Advanced — future version/);
  }
});

test('loading a saved program keeps every prescription field (no silent reset on save)', () => {
  const stored: ProgramDayExercise = {
    id: 'e1', program_day_id: 'd1', name: 'Dips', catalog_exercise_id: 'cat-1',
    default_sets: 3, default_reps: 8, default_reps_min: 6, default_rir: 1, default_rest_seconds: 60,
    default_weight_kg: 10, set_type: 'drop', superset_group: 'b', drop_count: 3, tempo: null,
    isometric_seconds: null, cluster_rest_seconds: null, cluster_reps_per_burst: null, myo_activation: false,
    order_index: 0, created_at: '',
  };
  const draft = programDayExerciseToDraft(stored);
  assert.equal(draft.superset_group, 'b');
  assert.equal(draft.set_type, 'drop');
  assert.equal(draft.drop_count, 3);
  assert.equal(draft.catalog_exercise_id, 'cat-1');
  const rpc = programExerciseRpcFields(draft);
  assert.equal(rpc.superset_group, 'b');
  assert.equal(rpc.set_type, 'drop');
  assert.equal(programDaysToDraft([{
    id: 'd1', program_id: 'p', weekday: 1, name: 'A', routine_id: null, order_index: 0, created_at: '', exercises: [stored],
  }])[0]?.exercises[0]?.superset_group, 'b');
  assert.match(src('src/components/programs/ProgramEditorPage.tsx'), /map\(programDayExerciseToDraft\)/);
});

test('editor: compact rows, one « … » menu, explicit superset control, fixed save bar', () => {
  const editor = src('src/components/coaching/ProgramSessionEditor.tsx');
  assert.match(editor, /exerciseSummaryParts/);
  assert.match(editor, /<OverflowMenu/);
  assert.match(editor, /aria-expanded=\{open\}/);
  assert.match(editor, /linkWithNext\(day\.exercises, ei\)/);
  assert.match(editor, /unlinkFromNext\(day\.exercises, ei\)/);
  assert.doesNotMatch(editor, /placeholder="A"/);
  assert.doesNotMatch(editor, /coaching\.programEditor\.supersetGroup/);
  // Secondary actions are no longer three loose links.
  assert.doesNotMatch(editor, /coaching\.programEditor\.modify/);
  assert.match(editor, /optionLabel\(t, 'setTypes'/);
  const page = src('src/components/programs/ProgramEditorPage.tsx');
  assert.match(page, /<FixedActionBar testId="program-editor-save"/);
  assert.doesNotMatch(page, /sticky bottom-20/);
});
