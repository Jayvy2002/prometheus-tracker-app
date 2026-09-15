import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  parseRevisionSnapshot,
  restoreCreatesNewRevision,
  revisionBeforeAfter,
  snapshotToDayDrafts,
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

test('UX23 wires history UI and restore goes through save_program, not workouts', () => {
  const store = src('src/stores/programStore.ts');
  assert.match(store, /fetchProgramRevisions/);
  assert.match(store, /restoreProgramRevision/);
  assert.match(store, /snapshotToDayDrafts/);
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
  assert.doesNotMatch(store, /program_versioning/);
});
