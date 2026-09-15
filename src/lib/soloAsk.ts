import { foldText } from './coachText';
import type { Exercise } from './types';

export type SoloAskSurface =
  | 'workout'
  | 'nutrition'
  | 'session'
  | 'journal'
  | 'checkin'
  | 'missed'
  | 'coached'
  | 'exercise'
  | 'week'
  | 'ingredient'
  | 'deload';

export type SoloAskKind =
  | 'workout_adjust'
  | 'recipe'
  | 'session_note'
  | 'plan_shift'
  | 'message_draft'
  | 'swap_exercise'
  | 'meal_week'
  | 'ingredient_swap'
  | 'deload';

export type SoloAskAction = 'ignore' | 'apply_once' | 'save';

export interface WorkoutExerciseIdea {
  name: string;
  default_sets: number;
  default_reps: number;
  default_rir: number;
  default_rest_seconds: number;
  order_index: number;
}

export interface RecipeIdea {
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface SoloAskProposal {
  kind: SoloAskKind;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  actions: SoloAskAction[];
  saveLabelKey: string;
  applyLabelKey: string;
  dayName: string;
  exercises: WorkoutExerciseIdea[];
  recipe: RecipeIdea | null;
  recipes: RecipeIdea[];
  grocery: string[];
  messageDraft: string;
  swapFrom: string;
  swapTo: string;
  sessionNote: string;
  shiftWeekday: number | null;
}

export interface SoloAskContext {
  surface: SoloAskSurface;
  question: string;
  injuries: string;
  experience: string;
  frequency: number;
  focus: string;
  programName: string | null;
  programExercises: string[];
  recentLiftNames: string[];
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  consumedCalories: number;
  consumedProtein: number;
  consumedCarbs: number;
  consumedFat: number;
  allergies: string[];
  dietType: string;
  currentExerciseName: string | null;
  catalog: Array<Pick<Exercise, 'name' | 'primary_muscles' | 'secondary_muscles' | 'equipment'>>;
  lastWeightKg: number | null;
  lastReps: number | null;
  lastRestSeconds: number | null;
  missedWeekday: number | null;
  coachName: string | null;
}

const PUSH = ['Bench Press', 'Incline Bench Press', 'Overhead Press', 'Dip', 'Lateral Raise'];
const PULL = ['Pull-up', 'Barbell Row', 'Lat Pulldown', 'Face Pull', 'Bicep Curl'];
const LEGS = ['Squat', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Leg Press', 'Calf Raise'];
const UPPER = ['Bench Press', 'Barbell Row', 'Overhead Press', 'Pull-up', 'Face Pull'];

export const MEAL_IDEAS: Array<RecipeIdea & { avoid: string[]; diets: string[] }> = [
  { name: 'Poulet, riz, brocoli', description: 'Repas complet, facile à scaler.', calories: 560, protein: 48, carbs: 58, fat: 12, category: 'lunch', avoid: [], diets: ['omnivore', 'halal'] },
  { name: 'Skyr, fruits, miel', description: 'Collation riche en protéines.', calories: 280, protein: 28, carbs: 32, fat: 4, category: 'snack', avoid: ['dairy'], diets: ['omnivore', 'vegetarian'] },
  { name: 'Tofu, quinoa, légumes', description: 'Option végétale équilibrée.', calories: 520, protein: 32, carbs: 60, fat: 16, category: 'dinner', avoid: ['soy'], diets: ['omnivore', 'vegetarian', 'vegan'] },
  { name: 'Omelette, pain, avocat', description: 'Petit-déjeuner rassasiant.', calories: 480, protein: 28, carbs: 30, fat: 26, category: 'breakfast', avoid: ['eggs', 'gluten'], diets: ['omnivore', 'vegetarian'] },
  { name: 'Saumon, pommes de terre, haricots', description: 'Oméga-3 + glucides de séance.', calories: 610, protein: 42, carbs: 48, fat: 24, category: 'dinner', avoid: ['fish'], diets: ['omnivore', 'pescatarian'] },
  { name: 'Boeuf haché, riz, salade', description: 'Simple, dense en protéines.', calories: 590, protein: 44, carbs: 50, fat: 20, category: 'lunch', avoid: [], diets: ['omnivore', 'carnivore'] },
];

function emptyProposal(partial: Partial<SoloAskProposal> & Pick<SoloAskProposal, 'kind' | 'titleKey' | 'bodyKey'>): SoloAskProposal {
  return {
    params: {},
    actions: ['ignore', 'apply_once', 'save'],
    saveLabelKey: 'soloAsk.savePlan',
    applyLabelKey: 'soloAsk.applyOnce',
    dayName: '',
    exercises: [],
    recipe: null,
    recipes: [],
    grocery: [],
    messageDraft: '',
    swapFrom: '',
    swapTo: '',
    sessionNote: '',
    shiftWeekday: null,
    ...partial,
  };
}

function asIdeas(names: string[], sets: number): WorkoutExerciseIdea[] {
  return names.map((name, order_index) => ({
    name,
    default_sets: sets,
    default_reps: 8,
    default_rir: 2,
    default_rest_seconds: 120,
    order_index,
  }));
}

function avoidInjured(names: string[], injuries: string): string[] {
  const inj = foldText(injuries);
  return names.filter(name => {
    const n = foldText(name);
    if (/dos|back|lombaire/.test(inj) && /deadlift|souleve|row/.test(n)) return false;
    if (/epaule|shoulder/.test(inj) && /press|dip|raise/.test(n)) return false;
    if (/genou|knee/.test(inj) && /squat|lunge|fente/.test(n)) return false;
    return true;
  });
}

function pickMeals(ctx: SoloAskContext, count: number): RecipeIdea[] {
  const remaining = Math.max(0, ctx.calorieTarget - ctx.consumedCalories);
  const diet = foldText(ctx.dietType || 'omnivore');
  const allergies = new Set((ctx.allergies ?? []).map(a => foldText(a)));
  const eligible = MEAL_IDEAS
    .filter(m => m.avoid.every(a => !allergies.has(foldText(a))))
    .filter(m => diet === '' || diet === 'omnivore' || m.diets.some(d => foldText(d) === diet));
  const fitting = eligible.filter(m => remaining === 0 || m.calories <= remaining + 80);
  const pool = (fitting.length > 0 ? fitting : [...eligible].sort((a, b) => a.calories - b.calories));
  const target = remaining > 0 ? Math.min(remaining, 600) : 500;
  return pool
    .sort((a, b) => Math.abs(a.calories - target) - Math.abs(b.calories - target))
    .slice(0, count)
    .map(({ avoid: _a, diets: _d, ...idea }) => idea);
}

function catalogAlternatives(
  catalog: SoloAskContext['catalog'],
  current: string,
): { from: string; to: string } | null {
  const cur = catalog.find(e => foldText(e.name) === foldText(current));
  if (!cur) return null;
  const muscles = new Set(cur.primary_muscles);
  const alt = catalog.find(e =>
    foldText(e.name) !== foldText(current)
    && e.equipment === cur.equipment
    && e.primary_muscles.some(m => muscles.has(m)),
  );
  if (!alt) return null;
  return { from: cur.name, to: alt.name };
}

export function proposeSoloAsk(ctx: SoloAskContext): SoloAskProposal | null {
  const question = ctx.question.trim();
  if (!question) return null;
  const q = foldText(question);
  let surface = ctx.surface;
  if (surface === 'nutrition' || surface === 'journal') {
    if (/semaine|courses|grocery|\bweek\b/.test(q)) surface = 'week';
    else if (/ingredient|allergie|remplac/.test(q)) surface = 'ingredient';
    else if (/reste|idees|plusieurs/.test(q)) surface = 'journal';
  }
  if (surface === 'workout' || surface === 'session') {
    if (/loupe|skipped|manque|missed day|jour rate/.test(q)) surface = 'missed';
  }

  if (surface === 'coached') {
    return emptyProposal({
      kind: 'message_draft',
      titleKey: 'soloAsk.messageTitle',
      bodyKey: 'soloAsk.messageBody',
      params: { coach: ctx.coachName || '' },
      actions: ['ignore', 'save'],
      saveLabelKey: 'soloAsk.saveDraft',
      applyLabelKey: 'soloAsk.saveDraft',
      messageDraft: question,
    });
  }

  if (surface === 'checkin') {
    const note = /fatigue|soreness|courbature/.test(q)
      ? 'Séance plus courte demain — garder la technique, couper une série.'
      : 'Noter la séance : charges tenues, RIR, ce qui a coincé.';
    return emptyProposal({
      kind: 'session_note',
      titleKey: 'soloAsk.noteTitle',
      bodyKey: 'soloAsk.noteBody',
      params: { note },
      actions: ['ignore', 'save'],
      saveLabelKey: 'soloAsk.saveNote',
      applyLabelKey: 'soloAsk.saveNote',
      sessionNote: note,
    });
  }

  if (surface === 'missed') {
    const weekday = ctx.missedWeekday ?? new Date().getDay();
    const next = (weekday + 1) % 7;
    return emptyProposal({
      kind: 'plan_shift',
      titleKey: 'soloAsk.shiftTitle',
      bodyKey: 'soloAsk.shiftBody',
      params: { weekday: String(next) },
      actions: ['ignore', 'save'],
      saveLabelKey: 'soloAsk.saveShift',
      applyLabelKey: 'soloAsk.saveShift',
      shiftWeekday: next,
    });
  }

  if (surface === 'exercise') {
    const swap = catalogAlternatives(ctx.catalog, ctx.currentExerciseName || '');
    if (!swap) return null;
    return emptyProposal({
      kind: 'swap_exercise',
      titleKey: 'soloAsk.swapTitle',
      bodyKey: 'soloAsk.swapBody',
      params: { from: swap.from, to: swap.to },
      actions: ['ignore', 'apply_once'],
      applyLabelKey: 'soloAsk.swapOnce',
      saveLabelKey: 'soloAsk.swapOnce',
      swapFrom: swap.from,
      swapTo: swap.to,
    });
  }

  if (surface === 'week') {
    const recipes = pickMeals({ ...ctx, consumedCalories: 0 }, 3);
    return emptyProposal({
      kind: 'meal_week',
      titleKey: 'soloAsk.weekTitle',
      bodyKey: 'soloAsk.weekBody',
      params: { count: recipes.length },
      recipes,
      grocery: [...new Set(recipes.flatMap(r => r.name.split(',').map(s => s.trim())))],
      saveLabelKey: 'soloAsk.saveWeek',
      applyLabelKey: 'soloAsk.applyOnce',
    });
  }

  if (surface === 'ingredient') {
    const recipes = pickMeals(ctx, 1);
    const recipe = recipes[0] ?? null;
    return emptyProposal({
      kind: 'ingredient_swap',
      titleKey: 'soloAsk.ingredientTitle',
      bodyKey: 'soloAsk.ingredientBody',
      params: { name: recipe?.name ?? '' },
      recipe,
      saveLabelKey: 'soloAsk.saveRecipe',
      applyLabelKey: 'soloAsk.addOnce',
    });
  }

  if (surface === 'nutrition' || surface === 'journal') {
    const recipes = pickMeals(ctx, surface === 'journal' ? 3 : 1);
    const recipe = recipes[0] ?? null;
    if (!recipe) {
      return emptyProposal({
        kind: 'recipe',
        titleKey: 'soloAsk.recipeEmptyTitle',
        bodyKey: 'soloAsk.recipeEmptyBody',
        actions: ['ignore'],
        applyLabelKey: 'soloAsk.addOnce',
        saveLabelKey: 'soloAsk.saveRecipe',
      });
    }
    return emptyProposal({
      kind: 'recipe',
      titleKey: 'soloAsk.recipeTitle',
      bodyKey: 'soloAsk.recipeBody',
      params: {
        name: recipe.name,
        calories: recipe.calories,
        protein: recipe.protein,
        remaining: Math.max(0, ctx.calorieTarget - ctx.consumedCalories),
      },
      recipe,
      recipes,
      applyLabelKey: 'soloAsk.addOnce',
      saveLabelKey: 'soloAsk.saveRecipe',
    });
  }

  const deload = surface === 'deload' || /\bdeload\b|semaine leger|light week|repos long/.test(q);
  const focus = foldText(ctx.focus || q);
  let names = UPPER;
  if (/jamb|leg|squat/.test(focus)) names = LEGS;
  else if (/tirage|dos|pull|row/.test(focus)) names = PULL;
  else if (/push|pec|press|chest|pect/.test(focus)) names = PUSH;
  names = avoidInjured(names, ctx.injuries);
  if (names.length === 0) names = ['Face Pull', 'Leg Curl', 'Plank'];
  const sets = deload ? 2 : ctx.experience === 'beginner' ? 3 : 4;
  const dayName = deload ? 'Deload technique' : (ctx.programName ? `${ctx.programName} — ajusté` : 'Séance proposée');
  const last = ctx.lastWeightKg != null
    ? `${ctx.lastWeightKg} kg × ${ctx.lastReps ?? '—'}`
    : '—';
  return emptyProposal({
    kind: deload ? 'deload' : 'workout_adjust',
    titleKey: deload ? 'soloAsk.deloadTitle' : 'soloAsk.workoutTitle',
    bodyKey: deload ? 'soloAsk.deloadBody' : 'soloAsk.workoutBody',
    params: {
      dayName,
      sets,
      injuries: ctx.injuries || '—',
      frequency: ctx.frequency || 0,
      last,
      program: ctx.programName || '—',
    },
    dayName,
    exercises: asIdeas(names.slice(0, 5), sets),
    applyLabelKey: 'soloAsk.applySession',
    saveLabelKey: 'soloAsk.savePlan',
    actions: ctx.surface === 'session' ? ['ignore', 'apply_once'] : ['ignore', 'apply_once', 'save'],
  });
}

export function shiftProgramWeekdays<T extends { weekday: number }>(
  days: T[],
  fromWeekday: number,
  toWeekday: number,
): T[] {
  return days.map(day => day.weekday === fromWeekday ? { ...day, weekday: toWeekday } : day);
}

export function remainingMacros(ctx: Pick<SoloAskContext, 'calorieTarget' | 'proteinTarget' | 'carbsTarget' | 'fatTarget' | 'consumedCalories' | 'consumedProtein' | 'consumedCarbs' | 'consumedFat'>) {
  return {
    calories: Math.max(0, ctx.calorieTarget - ctx.consumedCalories),
    protein: Math.max(0, ctx.proteinTarget - ctx.consumedProtein),
    carbs: Math.max(0, ctx.carbsTarget - ctx.consumedCarbs),
    fat: Math.max(0, ctx.fatTarget - ctx.consumedFat),
  };
}
