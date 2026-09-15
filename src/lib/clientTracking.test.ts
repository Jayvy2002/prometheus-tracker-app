import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_OFF_TRACKING,
  ALL_ON_TRACKING,
  DEFAULT_CHECKIN_VARS,
  anyMacroField,
  checkinHasAnyField,
  formatExercisePrescription,
  groupAllEnabled,
  mergeTrackingOverlay,
  CORE_CHECKIN_VARS,
  DEFAULT_COACH_TRACKING,
  cloneTrackingConfig,
  parseCoachTrackingDefaults,
  parseResolvedTracking,
  repsInputMode,
  resolveViewerTracking,
  seedTrackingFromDefaults,
  showCheckinField,
  showModule,
  showNutritionField,
  showTrainingField,
  toggleGroup,
  visibleCheckinFields,
  CHECKIN_CORE_VAR_KEYS,
  CHECKIN_VAR_KEYS,
  NUTRITION_VAR_KEYS,
  TRAINING_VAR_KEYS,
} from './clientTracking';
import { parseClientVisiblePatch } from './coachClientProfile';
import { EMPTY_COACH_SETTINGS } from './coachSettings';

test('missing config defaults to every variable on', () => {
  const cfg = parseResolvedTracking(null);
  assert.equal(showTrainingField(cfg, 'sets'), true);
  assert.equal(showTrainingField(cfg, 'rir'), true);
  assert.equal(showNutritionField(cfg, 'calories'), true);
  assert.equal(showCheckinField(cfg, 'mood'), true);
  assert.equal(showModule(cfg, 'weight'), true);
  assert.equal(repsInputMode(cfg), 'either');
});

test('coached viewer without a row is ALL_OFF until the coach row exists', () => {
  const off = resolveViewerTracking(null, true);
  assert.equal(off.track_nutrition, false);
  assert.equal(off.track_workouts, false);
  assert.equal(off.track_checkins, false);
  assert.equal(off.track_weight, false);
  assert.equal(off.track_nutrition, ALL_OFF_TRACKING.track_nutrition);
  const solo = resolveViewerTracking(null, false);
  assert.equal(solo.track_nutrition, true);
});

test('coach can disable a subset of training fields independently', () => {
  const cfg = parseResolvedTracking({
    track_workouts: true,
    training_vars: { sets: true, reps: true, reps_range: false, rir: false, load: true, rest: false },
  });
  assert.equal(showTrainingField(cfg, 'sets'), true);
  assert.equal(showTrainingField(cfg, 'load'), true);
  assert.equal(showTrainingField(cfg, 'rir'), false);
  assert.equal(showTrainingField(cfg, 'rest'), false);
  assert.equal(repsInputMode(cfg), 'single');
});

test('reps range only hides the single-number editor', () => {
  const cfg = parseResolvedTracking({
    track_workouts: true,
    training: { sets: true, reps: false, reps_range: true, rir: true, load: false, rest: true },
  });
  assert.equal(repsInputMode(cfg), 'range');
  assert.equal(showTrainingField(cfg, 'load'), false);
});

test('turning the nutrition module off hides every nutrition variable', () => {
  const cfg = parseResolvedTracking({
    track_nutrition: false,
    nutrition_vars: { calories: true, protein: true, carbs: true, fat: true, water: true, steps: true },
  });
  for (const key of NUTRITION_VAR_KEYS) {
    assert.equal(showNutritionField(cfg, key), false);
  }
});

test('a coach who only wants sleep + humeur hides the rest of the check-in', () => {
  const cfg = parseResolvedTracking({
    track_checkins: true,
    checkin_vars: {
      sleep_hours: true,
      sleep_quality: true,
      mood: true,
      energy: false,
      motivation: false,
      hunger: false,
      fatigue: false,
      stress: false,
      soreness: false,
      joint_pain: false,
      adherence_training: false,
      adherence_nutrition: false,
      notes: false,
    },
  });
  assert.deepEqual(visibleCheckinFields(cfg), ['sleep_hours', 'sleep_quality', 'mood']);
  assert.equal(showCheckinField(cfg, 'joint_pain'), false);
  assert.equal(checkinHasAnyField(cfg), true);
});

test('configs saved before adherence existed show the two adherence sliders by default', () => {
  // The fleet and the 360 read adherence_*; a legacy config must not starve them.
  const cfg = parseResolvedTracking({
    track_checkins: true,
    checkin_vars: { sleep_hours: true, sleep_quality: false, energy: false, mood: false, motivation: false, hunger: false, fatigue: false, stress: false, soreness: false, joint_pain: false, notes: false },
  });
  assert.deepEqual(visibleCheckinFields(cfg), ['sleep_hours', 'adherence_training', 'adherence_nutrition']);
});

test('disabling check-ins hides the whole form even if flags are on', () => {
  const cfg = parseResolvedTracking({
    track_checkins: false,
    checkin: DEFAULT_CHECKIN_VARS,
  });
  assert.deepEqual(visibleCheckinFields(cfg), []);
  assert.equal(checkinHasAnyField(cfg), false);
});

test('solo users ignore a saved config and keep the full tracker', () => {
  const row = {
    track_nutrition: false,
    nutrition_vars: { calories: false, protein: false, carbs: false, fat: false, water: false, steps: false },
  };
  const solo = resolveViewerTracking(row, false);
  assert.equal(showNutritionField(solo, 'calories'), true);
  const coached = resolveViewerTracking(row, true);
  assert.equal(showNutritionField(coached, 'calories'), false);
});

test('coach defaults seed a new client without marking setup complete', () => {
  const defaults = parseResolvedTracking({
    track_weight: false,
    training_vars: { sets: true, reps: true, reps_range: false, rir: true, load: false, rest: true },
  });
  const seeded = seedTrackingFromDefaults(defaults);
  assert.equal(seeded.track_weight, false);
  assert.equal(seeded.training.load, false);
  assert.equal(seeded.training.reps_range, false);
  assert.equal(seeded.setup_completed_at, null);
});

test('toggle all training vars on or off at once', () => {
  const none = toggleGroup(ALL_ON_TRACKING.training, TRAINING_VAR_KEYS, false);
  assert.equal(groupAllEnabled(none, TRAINING_VAR_KEYS), false);
  assert.equal(none.sets, false);
  const all = toggleGroup(none, TRAINING_VAR_KEYS, true);
  assert.equal(groupAllEnabled(all, TRAINING_VAR_KEYS), true);
});

test('prescription string only includes enabled fields', () => {
  const ex = {
    default_sets: 4,
    default_reps: 10,
    default_reps_min: 8,
    default_rir: 2,
    default_rest_seconds: 90,
    default_weight_kg: 80,
  };
  const full = formatExercisePrescription(ex, ALL_ON_TRACKING);
  assert.match(full, /4×8–10/);
  assert.match(full, /80 kg/);
  assert.match(full, /RIR 2/);
  assert.match(full, /90s/);

  const lean = parseResolvedTracking({
    track_workouts: true,
    training_vars: { sets: true, reps: true, reps_range: false, rir: false, load: false, rest: false },
  });
  const short = formatExercisePrescription(ex, lean);
  assert.equal(short, '4×10');
});

test('client visible profile patch accepts existing goals only', () => {
  const ok = parseClientVisiblePatch({
    goal: 'cut',
    daily_calorie_target: 2100,
    protein_target: 160,
    carbs_target: 180,
    fat_target: 70,
    daily_steps_target: 8000,
    daily_water_target_ml: 3000,
    training_frequency: 4,
    injuries_limitations: 'genou droit',
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.patch.goal, 'cut');
    assert.equal(ok.patch.daily_steps_target, 8000);
  }

  const invented = parseClientVisiblePatch({ goal: 'perf' });
  assert.equal(invented.ok, false);

  const calories = parseClientVisiblePatch({ daily_calorie_target: 200 });
  assert.equal(calories.ok, false);
});

test('empty or unknown profile keys are rejected — no silent write', () => {
  assert.equal(parseClientVisiblePatch({}).ok, false);
  assert.equal(parseClientVisiblePatch({ mystery: 1 }).ok, false);
});

test('AI tracking overlay keeps coach variable flags unless the draft includes them', () => {
  const seeded = parseResolvedTracking({
    track_workouts: true,
    training_vars: { sets: true, reps: true, reps_range: false, rir: false, load: false, rest: true },
    nutrition_vars: { calories: true, protein: true, carbs: false, fat: false, water: false, steps: false },
  });
  const merged = mergeTrackingOverlay(seeded, {
    track_nutrition: false,
    track_checkins: true,
    workout_focus: 'hypertrophy',
  });
  assert.equal(merged.track_nutrition, false);
  assert.equal(merged.training.rir, false);
  assert.equal(merged.nutrition.carbs, false);
  assert.equal(merged.workout_focus, 'hypertrophy');
  assert.equal(merged.nutrition.calories, true);
  assert.equal(anyMacroField(merged), false);
});

test('solo check-in core is sleep + energy + stress, not the full slider wall', () => {
  assert.deepEqual([...CHECKIN_CORE_VAR_KEYS], ['sleep_hours', 'sleep_quality', 'energy', 'stress']);
  for (const key of CHECKIN_CORE_VAR_KEYS) {
    assert.ok(CHECKIN_VAR_KEYS.includes(key));
  }
});

test('new coach defaults keep check-in to the core four, extras opt-in', () => {
  assert.equal(CORE_CHECKIN_VARS.sleep_hours, true);
  assert.equal(CORE_CHECKIN_VARS.stress, true);
  assert.equal(CORE_CHECKIN_VARS.mood, false);
  assert.equal(CORE_CHECKIN_VARS.notes, false);
  const seeded = seedTrackingFromDefaults(null);
  assert.equal(seeded.checkin.hunger, false);
  assert.equal(seeded.checkin.energy, true);
  assert.equal(seeded.track_workouts, true);
  const parsed = parseCoachTrackingDefaults(null);
  assert.equal(parsed.checkin.joint_pain, false);
  assert.equal(DEFAULT_COACH_TRACKING.checkin.adherence_training, false);
  const empty = parseCoachTrackingDefaults(EMPTY_COACH_SETTINGS.default_tracking);
  assert.equal(empty.checkin.mood, false);
  assert.equal(empty.checkin.sleep_quality, true);
});

test('UX110 clone tracking copies modules and vars without sharing objects', () => {
  const source = parseResolvedTracking({
    track_workouts: true,
    track_nutrition: false,
    track_checkins: true,
    track_weight: false,
    workout_focus: 'squat',
    training_vars: { sets: true, reps: false, rir: true, load: true, rest: false, reps_range: false },
  });
  const cloned = cloneTrackingConfig(source);
  cloned.workout_focus = 'bench';
  cloned.training.reps = true;
  assert.equal(source.workout_focus, 'squat');
  assert.equal(source.training.reps, false);
  assert.equal(cloned.track_nutrition, false);
  assert.equal(cloned.track_checkins, true);
});
