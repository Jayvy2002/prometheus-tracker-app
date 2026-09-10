import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('E01: program revisions are immutable and snapshotted on every structural save', () => {
  const mig = src('supabase/migrations/20260910000008_audit_program_revisions.sql');
  assert.match(mig, /CREATE TABLE IF NOT EXISTS public\.program_revisions/);
  assert.match(mig, /UNIQUE \(program_id, revision_no\)/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.snapshot_program_revision/);
  assert.match(mig, /FOR UPDATE/);
  assert.match(mig, /Owners read program revisions/);
  assert.match(mig, /Assigned clients read program revisions/);
  assert.match(mig, /Coaches read client program revisions/);
  const snap = src('supabase/migrations/20260910000009_audit_revision_snapshots.sql');
  for (const fn of ['save_program_day_exercises', 'sync_program_days', 'fork_program', 'adopt_client_program']) {
    assert.match(snap, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`), `${fn} must snapshot`);
  }
  assert.equal([...snap.matchAll(/PERFORM public\.snapshot_program_revision\(/g)].length, 4);
  const store = src('src/stores/programStore.ts');
  assert.match(store, /fetchProgramRevisionInfo/);
  const editor = src('src/components/programs/ProgramEditorPage.tsx');
  assert.match(editor, /programs\.revisionBadge/);
});

test('E02: questionnaire contract is versioned with stable semantic ids', () => {
  const intake = src('src/lib/kinesiologyIntake.ts');
  assert.match(intake, /STANDARD_INTAKE_IDS = \[/);
  assert.match(intake, /INTAKE_SEMANTIC_MAP/);
  assert.match(intake, /seancesRealistes: \{ maps_to: 'sessions_per_week'/);
  assert.match(intake, /joursDispo: \{ maps_to: 'available_weekdays'/);
  assert.match(intake, /version: typeof row\.version === 'number'/);
  const agent = src('supabase/functions/_shared/coachAgent.ts');
  assert.match(agent, /KNOWN_INTAKE_IDS = new Set/);
  assert.match(agent, /out\.custom = \{/);
  assert.match(agent, /contract_version/);
  assert.match(agent, /ne pas interpréter comme des ids connus/);
});

test('Q06: RLS matrix covers the P0 boundaries for staging runs', () => {
  const matrix = src('supabase/tests/rls_matrix.sql');
  assert.match(matrix, /S02 FAIL/);
  assert.match(matrix, /S03 FAIL/);
  assert.match(matrix, /S04 FAIL/);
  assert.match(matrix, /C04 FAIL/);
  assert.match(matrix, /assign_program_secure/);
  assert.match(matrix, /STAGING/);
  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /verify:edges/);
});
