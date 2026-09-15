import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { proposeSoloAsk, remainingMacros, shiftProgramWeekdays, type SoloAskContext } from './soloAsk';
import { loadGroceryList, saveGroceryList } from './groceryList';

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

test('session ask never saves the plan; missed day is a reviewable shift', () => {
  const session = proposeSoloAsk(ctx({ surface: 'session', question: 'ajouter un exo pecs' }));
  assert.ok(session);
  assert.deepEqual(session!.actions, ['ignore', 'apply_once']);
  const missed = proposeSoloAsk(ctx({ surface: 'workout', question: 'jour raté cette semaine' }));
  assert.equal(missed?.kind, 'plan_shift');
  assert.equal(missed!.actions.includes('save'), true);
  assert.equal(missed!.actions.includes('apply_once'), false);
  assert.equal(missed!.shiftWeekday, 2);
  const shifted = shiftProgramWeekdays([{ weekday: 1, name: 'Push' }, { weekday: 3, name: 'Pull' }], 1, 2);
  assert.deepEqual(shifted.map(d => d.weekday), [2, 3]);
});

test('journal remaining macros yields several meals; week stores a grocery list', () => {
  const journal = proposeSoloAsk(ctx({ surface: 'nutrition', question: 'idées de repas avec le reste' }));
  assert.equal(journal?.kind, 'recipe');
  assert.ok((journal?.recipes.length ?? 0) >= 2);
  const week = proposeSoloAsk(ctx({ surface: 'nutrition', question: 'plan de la semaine et courses' }));
  assert.equal(week?.kind, 'meal_week');
  assert.ok(week!.grocery.length > 0);
  const storage = new Map<string, string>();
  const mem = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  };
  saveGroceryList('u1', week!.grocery, mem);
  assert.deepEqual(loadGroceryList('u1', mem), week!.grocery);
});

test('check-in is a note not a diagnosis; wiring stays off /prometheus', () => {
  const note = proposeSoloAsk(ctx({ surface: 'checkin', question: 'fatigue et courbatures' }));
  assert.equal(note?.kind, 'session_note');
  assert.match(note!.sessionNote, /technique|série|séance/i);
  assert.doesNotMatch(note!.sessionNote, /diagnostic|médical|patholog/i);
  const form = src('src/components/workout/WorkoutForm.tsx');
  const checkin = src('src/components/checkin/CheckInPage.tsx');
  const card = src('src/components/workout/ExerciseCard.tsx');
  const page = src('src/components/workout/WorkoutPage.tsx');
  assert.match(form, /SoloAskBar/);
  assert.match(form, /soloAskFromProfile\('session'/);
  assert.match(checkin, /SoloAskBar/);
  assert.match(checkin, /sessionNote/);
  assert.match(card, /swap_exercise/);
  assert.match(page, /saveMessageDraft/);
  assert.match(page, /surface: 'coached'/);
  assert.doesNotMatch(form, /\/prometheus/);
  assert.doesNotMatch(checkin, /\/prometheus/);
});
