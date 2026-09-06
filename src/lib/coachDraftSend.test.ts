import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canSendProgramToClient,
  calorieBeforeAfter,
  clientWillSeeSummary,
  editedProgramPayload,
  formatCalorieLine,
  outlineBeforeAfter,
  outlineFromEdited,
  patchBeforeAfter,
  relanceBeforeAfter,
  type EditedProgramDraft,
} from './coachDraftSend';
import type { Program, ProgramExercisePatch } from './types';

const rawPayload = {
  program: {
    name: 'Force Second',
    description: 'brut',
    duration_weeks: 8,
    days: [{
      weekday: 1,
      name: 'A',
      exercises: [{ name: 'Squat', default_sets: 3, default_reps: 5, default_reps_min: null, default_rir: 2, default_rest_seconds: 120 }],
    }],
  },
  patch: { exercise: 'Squat', default_sets: 3, default_reps: 5 } satisfies ProgramExercisePatch,
};

const editedOutline: EditedProgramDraft = {
  programName: 'Force 4j',
  programDesc: 'édité par le coach',
  programWeeks: 6,
  days: [{
    weekday: 1,
    name: 'A',
    exercises: [{ name: 'Squat', default_sets: 4, default_reps: 6, default_reps_min: 4, default_rir: 1, default_rest_seconds: 150 }],
  }],
  patch: null,
};

const currentProgram: Program = {
  id: 'p1',
  owner_id: 'coach',
  name: 'Programme actuel',
  description: '',
  duration_weeks: 8,
  created_at: '',
  updated_at: '',
  days: [{
    id: 'd1',
    program_id: 'p1',
    weekday: 1,
    name: 'A',
    routine_id: null,
    order_index: 0,
    created_at: '',
    exercises: [{
      id: 'e1',
      program_day_id: 'd1',
      name: 'Squat',
      default_sets: 3,
      default_reps: 5,
      default_reps_min: null,
      default_rir: 2,
      default_rest_seconds: 120,
      order_index: 0,
      created_at: '',
    }],
  }],
};

test('send path uses the edited outline, never the raw Second payload', () => {
  const sent = editedProgramPayload(rawPayload, editedOutline);
  const program = sent.program as { name: string; days: Array<{ exercises: Array<{ default_sets: number }> }> };
  assert.equal(program.name, 'Force 4j');
  assert.notEqual(program.name, rawPayload.program.name);
  assert.equal(program.days[0]?.exercises[0]?.default_sets, 4);
  assert.notEqual(program.days[0]?.exercises[0]?.default_sets, rawPayload.program.days[0]?.exercises[0]?.default_sets);
  assert.equal(outlineFromEdited(editedOutline)?.name, 'Force 4j');
});

test('NL patch send uses edited sets, not the raw payload sets', () => {
  const edited: EditedProgramDraft = {
    programName: '',
    programDesc: '',
    programWeeks: 8,
    days: [],
    patch: { exercise: 'Squat', default_sets: 4, default_reps: 6, default_rir: 1 },
  };
  const sent = editedProgramPayload(rawPayload, edited);
  const patch = sent.patch as ProgramExercisePatch;
  assert.equal(patch.default_sets, 4);
  assert.equal(patch.default_reps, 6);
  assert.notEqual(patch.default_sets, rawPayload.patch.default_sets);
  assert.equal(canSendProgramToClient(edited), true);
});

test('before/after shows the current program versus the edited proposal', () => {
  const patch = patchBeforeAfter(currentProgram, { exercise: 'Squat', default_sets: 4, default_reps: 6, default_rir: 1 });
  assert.ok(patch);
  assert.equal(patch?.before, '3×5 RIR2');
  assert.equal(patch?.after, '4×6 RIR1');
  const outline = outlineBeforeAfter(currentProgram, editedOutline);
  assert.equal(outline.before, 'Programme actuel · 1j');
  assert.match(outline.after, /Force 4j/);
  assert.equal(clientWillSeeSummary(editedOutline, currentProgram), 'Force 4j');
});

test('an empty Second payload cannot be sent as a client program in one click', () => {
  const empty: EditedProgramDraft = {
    programName: '',
    programDesc: '',
    programWeeks: 8,
    days: [],
    patch: null,
  };
  assert.equal(canSendProgramToClient(empty), false);
  assert.equal(canSendProgramToClient(editedOutline), true);
});

test('calorie before/after uses the current ISSN targets versus the edited draft', () => {
  assert.equal(formatCalorieLine(null), '—');
  assert.equal(formatCalorieLine({ calories: 0 }), '—');
  const preview = calorieBeforeAfter(
    { calories: 2100, protein: 140, carbs: 220, fat: 65 },
    { calories: 1900, protein: 150, carbs: 180, fat: 60 },
  );
  assert.equal(preview.before, '2100 kcal · P140 C220 F65');
  assert.equal(preview.after, '1900 kcal · P150 C180 F60');
  const kcalOnly = calorieBeforeAfter({ calories: 2100 }, { calories: 1900, protein: 150, carbs: 180, fat: 60 });
  assert.equal(kcalOnly.before, '2100 kcal');
});

test('Relancer before/after is observation versus the prepared message', () => {
  const preview = relanceBeforeAfter('3 séances manquées cette semaine', 'Hey, on reprend demain ?');
  assert.equal(preview.before, '3 séances manquées cette semaine');
  assert.equal(preview.after, 'Hey, on reprend demain ?');
  assert.equal(relanceBeforeAfter('  ', '').before, '—');
  assert.equal(relanceBeforeAfter('', '  ').after, '—');
});
