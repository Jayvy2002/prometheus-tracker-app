import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrationsSql } from './migrationScan';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('E01: program revisions are immutable and snapshotted on every structural save', () => {
  const all = migrationsSql();
  assert.match(all, /CREATE TABLE IF NOT EXISTS public\.program_revisions/);
  assert.match(all, /UNIQUE \(program_id, revision_no\)/);
  assert.match(all, /CREATE OR REPLACE FUNCTION public\.snapshot_program_revision/);
  assert.match(all, /FOR UPDATE/);
  assert.match(all, /Owners read program revisions/);
  assert.match(all, /Assigned clients read program revisions/);
  assert.match(all, /Coaches read client program revisions/);
  for (const fn of ['save_program_day_exercises', 'sync_program_days', 'fork_program', 'adopt_client_program']) {
    assert.match(all, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`), `${fn} must exist`);
  }
  assert.ok(
    [...all.matchAll(/PERFORM public\.snapshot_program_revision\(/g)].length >= 4,
    'structural saves must snapshot',
  );
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
  assert.doesNotMatch(matrix, /\\set /);
  assert.match(matrix, /S02/);
  assert.match(matrix, /S03/);
  assert.match(matrix, /S04/);
  assert.match(matrix, /C04/);
  assert.match(matrix, /assign_program_secure/);
  assert.match(matrix, /create_program_complete/);
  assert.match(matrix, /apply_intervention/);
  assert.match(matrix, /claim_intervention/);
  assert.match(matrix, /end_coach_client_link/);
  assert.match(matrix, /D01_ATOMIC/);
  assert.match(matrix, /RPC_CLAIM_CROSS/);
  assert.match(matrix, /UNLINK/);
  assert.match(matrix, /STAGING/);
  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /verify:edges/);
  assert.match(ci, /rls-matrix/);
  assert.match(ci, /run-rls-matrix/);
  assert.match(ci, /verify-local-migrations/);
  assert.match(ci, /deploy-audit-edges/);
});
