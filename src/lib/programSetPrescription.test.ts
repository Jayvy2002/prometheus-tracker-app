import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  emptyDropSegments,
  normalizeProgramSetType,
  parseDropSegments,
  programExerciseRpcFields,
  workoutExerciseToPlanDraft,
} from './programSetPrescription';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('program set types persist on the day, not as a working-only plate', () => {
  assert.equal(normalizeProgramSetType('drop'), 'drop');
  assert.equal(normalizeProgramSetType('superset'), 'working');
  const payload = programExerciseRpcFields({
    name: 'Bench Press',
    default_sets: 3,
    default_reps: 8,
    set_type: 'drop',
    drop_count: 3,
    superset_group: 'A',
    tempo: '3-1-2-0',
  });
  assert.equal(payload.set_type, 'drop');
  assert.equal(payload.drop_count, 3);
  assert.equal(payload.superset_group, 'A');
  assert.equal(parseDropSegments([{ weight_kg: 80, reps: 6 }, { weight_kg: 60, reps: 8 }]).length, 2);
  assert.equal(emptyDropSegments(3).length, 3);

  const mig = src('supabase/migrations/20260915190000_program_set_prescriptions.sql');
  assert.match(mig, /ADD COLUMN IF NOT EXISTS set_type/);
  assert.match(mig, /drop_segments/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.start_workout_from_template/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.save_program_day_exercises/);
  assert.match(mig, /CREATE OR REPLACE FUNCTION public\.sync_program_days/);

  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.doesNotMatch(card, /hevySimple/);
  assert.match(card, /data-drop-segments/);
  const editor = src('src/components/coaching/ProgramSessionEditor.tsx');
  assert.match(editor, /PROGRAM_SET_TYPES/);
  assert.match(editor, /superset_group/);
});

test('free session to plan day keeps drop/tempo types', () => {
  const draft = workoutExerciseToPlanDraft({
    id: 'ex1',
    workout_id: 'w1',
    name: 'Bench',
    order_index: 0,
    notes: '',
    superset_group_id: 'A',
    created_at: '',
    sets: [{
      id: 's1',
      exercise_id: 'ex1',
      set_type: 'drop',
      weight_kg: 80,
      reps: 6,
      rir: 1,
      completed: true,
      order_index: 0,
      duration_seconds: null,
      tempo: null,
      cluster_rest_seconds: null,
      cluster_reps_per_burst: null,
      myo_is_activation: false,
      drop_percentage: 20,
      drop_segments: [{ weight_kg: 80, reps: 6 }, { weight_kg: 60, reps: 8 }],
      created_at: '',
    }],
  });
  assert.equal(draft.set_type, 'drop');
  assert.equal(draft.drop_count, 2);
  assert.equal(draft.superset_group, 'A');
});
