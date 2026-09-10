import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { resolvePatchTargets } from './programPatch';
import type { Program } from './types';
import { latestMigrationContaining } from './migrationScan';

function program(): Program {
  return {
    id: 'p1',
    owner_id: 'coach',
    name: 'Split',
    description: '',
    duration_weeks: 8,
    created_at: '',
    updated_at: '2026-09-10T00:00:00Z',
    days: [
      {
        id: 'd1', program_id: 'p1', weekday: 1, name: 'Upper A', routine_id: null, order_index: 0, created_at: '',
        exercises: [
          { id: 'e1', program_day_id: 'd1', name: 'Développé couché', default_sets: 4, default_reps: 8, default_rest_seconds: 120, order_index: 0, created_at: '' },
          { id: 'e2', program_day_id: 'd1', name: 'Row barre', default_sets: 4, default_reps: 10, default_rest_seconds: 90, order_index: 1, created_at: '' },
        ],
      },
      {
        id: 'd2', program_id: 'p1', weekday: 4, name: 'Upper B', routine_id: null, order_index: 1, created_at: '',
        exercises: [
          { id: 'e3', program_day_id: 'd2', name: 'Développé incliné', default_sets: 4, default_reps: 10, default_rest_seconds: 90, order_index: 0, created_at: '' },
          { id: 'e4', program_day_id: 'd2', name: 'Squat', default_sets: 4, default_reps: 8, default_rest_seconds: 150, order_index: 1, created_at: '' },
        ],
      },
    ],
  };
}

test('I02: exact IDs always win', () => {
  const r = resolvePatchTargets(program(), { exercise: 'n importe quoi', exercise_id: 'e4', program_day_id: 'd2' });
  assert.equal(r.status, 'ok');
  assert.equal(r.targets[0].exerciseId, 'e4');
  assert.equal(r.targets[0].dayId, 'd2');
});

test('I02: unknown ID is not_found, never a fuzzy guess', () => {
  const r = resolvePatchTargets(program(), { exercise: 'Squat', exercise_id: 'zzz' });
  assert.equal(r.status, 'not_found');
});

test('I02: explicit day scopes the search', () => {
  const r = resolvePatchTargets(program(), { exercise: 'développé', weekday: 4 });
  assert.equal(r.status, 'ok');
  assert.equal(r.targets[0].exerciseId, 'e3');
});

test('I02: exact name beats substring across days', () => {
  const r = resolvePatchTargets(program(), { exercise: 'Squat' });
  assert.equal(r.status, 'ok');
  assert.equal(r.targets[0].exerciseId, 'e4');
});

test('I02: unscoped fuzzy name over several days is ambiguous, not multi-edit', () => {
  const r = resolvePatchTargets(program(), { exercise: 'développé' });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.targets.length, 2);
});

test('I02: unknown name is not_found', () => {
  const r = resolvePatchTargets(program(), { exercise: 'Zercher xyz' });
  assert.equal(r.status, 'not_found');
});

test('I02: preview and apply share resolvePatchTargets; fork + version guard the write', () => {
  const send = readFileSync(resolve(process.cwd(), 'src/lib/coachDraftSend.ts'), 'utf8');
  assert.match(send, /resolvePatchTargets\(program, patch\)/);
  assert.match(send, /patchPreviewTargets/);
  const store = readFileSync(resolve(process.cwd(), 'src/stores/programStore.ts'), 'utf8');
  assert.match(store, /resolvePatchTargets\(program, patch\)/);
  assert.match(store, /rpc\('fork_program'/);
  assert.match(store, /expectedUpdatedAt/);
  assert.match(store, /return \{ error: 'stale' \}/);
  assert.doesNotMatch(store, /ex\.name\.toLowerCase\(\)\.includes\(patch\.exercise\.toLowerCase\(\)\)/);
  const page = readFileSync(resolve(process.cwd(), 'src/components/coaching/InterventionDraftPage.tsx'), 'utf8');
  assert.match(page, /patchPreviewTargets\(boundAssignment\?\.program, patch\)/);
  assert.match(page, /program_day_id: p\.target\.dayId/);
  const agent = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/coachAgent.ts'), 'utf8');
  assert.match(agent, /patch\.exercise_id = asString\(src\.exercise_id\)/);
  assert.match(agent, /exercise_id \+ program_day_id repris/);
  const mig = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.fork_program').sql;
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.fork_program/);
});
