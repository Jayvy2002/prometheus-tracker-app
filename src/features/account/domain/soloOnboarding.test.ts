import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  SOLO_ONBOARDING_STEPS,
  buildSoloOnboardingPayload,
  canContinueSoloOnboarding,
  emptySoloOnboardingForm,
  measureErrors,
  missingSoloOnboarding,
  type SoloOnboardingForm,
} from './soloOnboarding';

const filled = (patch: Partial<SoloOnboardingForm> = {}): SoloOnboardingForm => ({
  ...emptySoloOnboardingForm(),
  full_name: 'Camille',
  goal: 'cut',
  training_experience: 'beginner',
  training_frequency: 3,
  training_equipment: 'home',
  ...patch,
});

test('four screens at most, and nothing is preselected (Vision §5.3)', () => {
  assert.equal(SOLO_ONBOARDING_STEPS, 4);
  const empty = emptySoloOnboardingForm();
  assert.equal(empty.goal, '');
  assert.equal(empty.gender, '');
  assert.equal(empty.training_experience, '');
  assert.equal(empty.training_frequency, null);
  assert.equal(empty.height_cm, '');
  assert.equal(empty.weight, '');
  assert.equal(canContinueSoloOnboarding(0, { ...empty, full_name: 'Camille' }), false, 'a goal must be chosen, not assumed');
  assert.equal(canContinueSoloOnboarding(1, filled({ training_equipment: '' })), false, 'equipment is asked');
});

test('the Solo chooses modules, at least one', () => {
  assert.equal(canContinueSoloOnboarding(2, filled({ modules: { workouts: false, nutrition: false, weight: false, checkins: false } })), false);
  const { profile } = buildSoloOnboardingPayload(filled({ modules: { workouts: true, nutrition: false, weight: true, checkins: false } }), { coached: false, fallbackName: 'x' });
  assert.deepEqual(profile.personal_modules, { workouts: true, nutrition: false, weight: true, checkins: false });
});

test('measurements are optional: without them no weight, no weigh-in and no invented targets', () => {
  assert.equal(canContinueSoloOnboarding(3, filled()), true);
  const { profile, weighInKg } = buildSoloOnboardingPayload(filled(), { coached: false, fallbackName: 'x' });
  assert.equal(weighInKg, null);
  for (const key of ['height_cm', 'weight_kg', 'gender', 'date_of_birth', 'daily_calorie_target', 'protein_target', 'daily_water_target_ml', 'daily_steps_target'] as const) {
    assert.equal(key in profile, false, `${key} must not be invented`);
  }
});

test('real measurements give targets, in the unit typed, with a comma', () => {
  const form = filled({ unit_weight: 'lbs', weight: '165,5', height_cm: '178', date_of_birth: '1994-03-10', gender: 'female' });
  const { profile, weighInKg } = buildSoloOnboardingPayload(form, { coached: false, fallbackName: 'x' });
  assert.equal(weighInKg, 75.1);
  assert.equal(profile.weight_kg, 75.1);
  assert.ok((profile.daily_calorie_target ?? 0) > 1000);
  assert.ok((profile.protein_target ?? 0) > 0);
});

test('no targets when nutrition is not followed, or when a coach owns them', () => {
  const measured = filled({ weight: '75', height_cm: '178', date_of_birth: '1994-03-10' });
  const noNutrition = buildSoloOnboardingPayload({ ...measured, modules: { workouts: true, nutrition: false } }, { coached: false, fallbackName: 'x' });
  assert.equal(noNutrition.profile.daily_calorie_target, undefined);
  const coached = buildSoloOnboardingPayload(measured, { coached: true, fallbackName: 'x' });
  assert.equal(coached.profile.daily_calorie_target, undefined);
});

test('a typed measurement must be plausible; empty stays allowed', () => {
  assert.deepEqual(measureErrors(filled({ height_cm: '17' })), ['height']);
  assert.deepEqual(measureErrors(filled({ weight: 'abc' })), ['weight']);
  assert.deepEqual(measureErrors(filled({ date_of_birth: '2030-01-01' }), new Date('2026-09-24')), ['dateOfBirth']);
  assert.deepEqual(measureErrors(filled()), []);
});

test('the onboarding screen uses this contract and no longer prefills Homme / 175 cm / 75 kg / Maintenir', () => {
  const flow = readFileSync(resolve(process.cwd(), 'src/components/onboarding/OnboardingFlow.tsx'), 'utf8');
  assert.match(flow, /buildSoloOnboardingPayload/);
  assert.match(flow, /emptySoloOnboardingForm/);
  assert.match(flow, /PersonalModulesPicker/);
  assert.match(flow, /WallSignOut/);
  assert.doesNotMatch(flow, /height_cm: 175|weight_kg: 75|gender: 'male'|goal: 'maintain'/);
});

test('« Continue » says what is missing, in screen order', () => {
  const empty = emptySoloOnboardingForm();
  assert.deepEqual(missingSoloOnboarding(0, empty), ['firstName', 'goal']);
  assert.deepEqual(missingSoloOnboarding(0, { ...empty, full_name: '  ', goal: 'bulk' }), ['firstName']);
  assert.deepEqual(missingSoloOnboarding(1, filled({ training_experience: '', training_frequency: null, training_equipment: '' })), ['experience', 'frequency', 'equipment']);
  assert.deepEqual(missingSoloOnboarding(1, filled({ training_frequency: null })), ['frequency']);
  assert.deepEqual(missingSoloOnboarding(2, filled({ modules: { workouts: false, nutrition: false, weight: false, checkins: false } })), ['modules']);
  assert.deepEqual(missingSoloOnboarding(3, filled({ weight: '12' })), ['measures']);
  // Measurements stay optional: nothing typed, nothing missing.
  assert.deepEqual(missingSoloOnboarding(3, filled()), []);
  for (let step = 0; step < SOLO_ONBOARDING_STEPS; step += 1) {
    assert.equal(canContinueSoloOnboarding(step, filled()), missingSoloOnboarding(step, filled()).length === 0);
  }
  assert.equal(canContinueSoloOnboarding(4, filled()), false);
});

test('lot D: the first name opens the flow, the blocked button explains itself, no invented goal', () => {
  const flow = readFileSync(resolve(process.cwd(), 'src/components/onboarding/OnboardingFlow.tsx'), 'utf8');
  // Name first, under a title that asks for it; the goal follows on the same screen (still four steps).
  const name = flow.indexOf('onboarding.fields.firstNameQuestion');
  const goal = flow.indexOf('onboarding.fields.bodyGoal\'');
  assert.ok(name > 0 && goal > name, 'first name before the goal');
  assert.match(flow, /onboarding\.steps\.welcomeTitle/);
  // The hint is live and tied to the button.
  assert.match(flow, /missingSoloOnboarding\(step, form\)/);
  assert.match(flow, /id="onboarding-missing"[\s\S]*?aria-live="polite"/);
  assert.match(flow, /aria-describedby="onboarding-missing"/);
  // Performance is not a body-weight goal here: it lives in the goal cycle (see the lot D report).
  assert.match(flow, /onboarding\.fields\.bodyGoalHint/);
  for (const lang of ['fr', 'en']) {
    const common = readFileSync(resolve(process.cwd(), `src/i18n/locales/${lang}/common.ts`), 'utf8');
    for (const key of ['welcomeTitle', 'welcomeSub', 'firstNameQuestion', 'bodyGoalHint', 'intro', 'measures', 'frequency', 'equipment']) {
      assert.match(common, new RegExp(`\\b${key}:`), `${lang} ${key}`);
    }
  }
});
