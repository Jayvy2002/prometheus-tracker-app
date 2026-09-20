import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  parseRevisionMeta,
  parseRevisionOrganization,
  parseRevisionSnapshot,
  programFromFrozenRevision,
  restoreCreatesNewRevision,
  revisionBeforeAfter,
  snapshotToDayDrafts,
  snapshotToPhaseDrafts,
  summarizeRevisionDays,
} from './programRevisionDiff';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const snapA = [
  { weekday: 1, name: 'Haut du corps', exercises: [{ name: 'Squat' }, { name: 'Bench Press' }] },
];
const snapB = [
  { weekday: 1, name: 'Haut du corps', exercises: [{ name: 'Squat' }, { name: 'Incline Bench Press' }] },
];

test('revision list shows before/after and restore is a new snapshot', () => {
  assert.equal(summarizeRevisionDays(parseRevisionSnapshot(snapA)), 'Haut du corps · Squat, Bench Press');
  const first = revisionBeforeAfter(null, snapA);
  assert.equal(first.before, '');
  assert.match(first.after, /Squat/);
  const next = revisionBeforeAfter(snapA, snapB);
  assert.match(next.before, /Bench Press/);
  assert.match(next.after, /Incline Bench Press/);
  assert.equal(restoreCreatesNewRevision(), true);
  assert.equal(snapshotToDayDrafts(snapB)[0].exercises[1].name, 'Incline Bench Press');
});

test('wrapped revision snapshot keeps organization, null weekday and optional phases', () => {
  const wrapped = {
    session_organization: 'in_order',
    days: [{ weekday: null, name: 'A', phase_id: 'p1', exercises: [{ name: 'Squat' }] }],
    phases: [{ id: 'p1', name: 'Accumulation', duration_weeks: 4 }],
  };
  assert.equal(parseRevisionOrganization(wrapped), 'in_order');
  assert.equal(parseRevisionOrganization([{ weekday: 1, name: 'Upper', exercises: [] }]), 'fixed_days');
  assert.equal(parseRevisionSnapshot(wrapped)[0].weekday, null);
  assert.equal(snapshotToDayDrafts(wrapped)[0].name, 'A');
  assert.equal(snapshotToDayDrafts(wrapped)[0].phase_id, 'p1');
  assert.equal(snapshotToPhaseDrafts(wrapped)[0].name, 'Accumulation');
  assert.deepEqual(snapshotToPhaseDrafts([{ weekday: 1, name: 'Upper', exercises: [] }]), []);
  const frozen = programFromFrozenRevision({
    meta: {
      id: 'prog-1',
      owner_id: 'owner-1',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    },
    revisionNo: 2,
    versionStartOn: '2026-09-01',
    snapshot: wrapped,
  });
  assert.equal(frozen.phase_anchor_on, '2026-09-01');
  assert.equal(frozen.active_revision_no, 2);
  assert.equal(frozen.days?.[0].name, 'A');
  assert.equal(frozen.scheduled_revision_no, null);
});

test('UX23 wires history UI and restore goes through save_program, not workouts', () => {
  const store = src('src/stores/programStore.ts');
  assert.match(store, /fetchProgramRevisions/);
  assert.match(store, /restoreProgramRevision/);
  assert.match(store, /snapshotToDayDrafts/);
  assert.match(store, /snapshotToPhaseDrafts/);
  assert.match(store, /rpc\('save_program'/);
  const restoreFn = store.slice(store.indexOf('restoreProgramRevision'));
  assert.doesNotMatch(restoreFn.slice(0, 800), /from\('workouts'\)/);
  const history = src('src/components/programs/ProgramRevisionHistory.tsx');
  assert.match(history, /program-revision-history/);
  assert.match(history, /program-revision-row/);
  assert.match(history, /program-revision-diff/);
  assert.match(history, /program-revision-restore/);
  const editor = src('src/components/programs/ProgramEditorPage.tsx');
  assert.match(editor, /program-revision-badge/);
  assert.match(editor, /ProgramRevisionHistory/);
  const fr = src('src/i18n/locales/fr/programs.ts');
  assert.match(fr, /revisionHistory:/);
  assert.match(fr, /revisionRestoreHint:/);
  assert.match(src('src/i18n/locales/fr/programs.ts'), /versionStateSaved:/);
  assert.match(src('src/i18n/locales/en/programs.ts'), /versionStateSaved:/);
  assert.match(history, /program-revision-state/);
  assert.doesNotMatch(store, /program_versioning/);
});

test('restore prefers snapshot name and description', () => {
  assert.equal(parseRevisionMeta({
    name: 'Bloc Force',
    description: 'force block',
    duration_weeks: 8,
    days: [],
  }).name, 'Bloc Force');
  const store = src('src/stores/programStore.ts');
  assert.match(store, /parseRevisionMeta/);
});
