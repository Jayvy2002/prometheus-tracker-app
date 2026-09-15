import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { proposeSoloAsk, remainingMacros, type SoloAskContext } from './soloAsk';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function ctx(partial: Partial<SoloAskContext> & Pick<SoloAskContext, 'surface' | 'question'>): SoloAskContext {
  return {
    injuries: '',
    experience: 'intermediate',
    frequency: 4,
    focus: '',
    programName: 'Force 4j',
    programExercises: ['Squat', 'Bench Press'],
    recentLiftNames: ['Bench Press'],
    calorieTarget: 2400,
    proteinTarget: 180,
    carbsTarget: 250,
    fatTarget: 70,
    consumedCalories: 900,
    consumedProtein: 60,
    consumedCarbs: 80,
    consumedFat: 25,
    allergies: [],
    dietType: 'omnivore',
    currentExerciseName: null,
    catalog: [
      { name: 'Bench Press', primary_muscles: ['chest'], secondary_muscles: ['triceps'], equipment: 'barbell' },
      { name: 'Incline Bench Press', primary_muscles: ['chest'], secondary_muscles: ['front_delts'], equipment: 'barbell' },
    ],
    lastWeightKg: 80,
    lastReps: 5,
    lastRestSeconds: 150,
    missedWeekday: 1,
    coachName: null,
    ...partial,
  };
}

test('empty question never proposes — nothing is auto-applied', () => {
  assert.equal(proposeSoloAsk(ctx({ surface: 'workout', question: '  ' })), null);
});

test('workout ask proposes a reviewable session using perfs, program, injuries', () => {
  const p = proposeSoloAsk(ctx({
    surface: 'workout',
    question: 'Je veux pousser pecs, dos fatigué',
    injuries: 'bas du dos',
  }));
  assert.ok(p);
  assert.equal(p!.kind, 'workout_adjust');
  assert.deepEqual(p!.actions, ['ignore', 'apply_once', 'save']);
  assert.ok(p!.exercises.length >= 3);
  assert.equal(p!.exercises.some(e => /deadlift|row/i.test(e.name)), false);
  assert.equal(p!.params.program, 'Force 4j');
  assert.match(String(p!.params.last), /80/);
});

test('deload cuts sets to 2 and stays a proposal', () => {
  const p = proposeSoloAsk(ctx({ surface: 'deload', question: 'deload cette semaine' }));
  assert.equal(p?.kind, 'deload');
  assert.ok(p!.exercises.every(e => e.default_sets === 2));
});

test('nutrition ask proposes a recipe under remaining calories, never auto-apply', () => {
  const p = proposeSoloAsk(ctx({ surface: 'nutrition', question: 'idée de repas ce soir' }));
  assert.equal(p?.kind, 'recipe');
  assert.ok(p!.recipe);
  assert.ok(p!.recipe!.calories <= remainingMacros(ctx({ surface: 'nutrition', question: 'x' })).calories + 80);
  assert.ok(p!.actions.includes('apply_once'));
  assert.ok(p!.actions.includes('save'));
});

test('dairy allergy drops skyr; coached ask is a message draft only', () => {
  const dairy = proposeSoloAsk(ctx({
    surface: 'nutrition',
    question: 'collation',
    allergies: ['dairy'],
    consumedCalories: 2100,
  }));
  assert.ok(dairy?.recipe);
  assert.doesNotMatch(dairy!.recipe!.name, /Skyr/i);
  const msg = proposeSoloAsk(ctx({
    surface: 'coached',
    question: 'Je peux swap le squat ?',
    coachName: 'Alex',
  }));
  assert.equal(msg?.kind, 'message_draft');
  assert.deepEqual(msg!.actions, ['ignore', 'save']);
  assert.equal(msg!.messageDraft.includes('squat'), true);
});

test('swap uses same muscles and equipment; Ask bar is not /prometheus', () => {
  const p = proposeSoloAsk(ctx({
    surface: 'exercise',
    question: 'alternative',
    currentExerciseName: 'Bench Press',
  }));
  assert.equal(p?.kind, 'swap_exercise');
  assert.equal(p!.swapFrom, 'Bench Press');
  assert.equal(p!.swapTo, 'Incline Bench Press');
  const nutrition = src('src/components/nutrition/NutritionPage.tsx');
  assert.match(nutrition, /SoloAskBar/);
  assert.doesNotMatch(nutrition, /\/prometheus/);
});
