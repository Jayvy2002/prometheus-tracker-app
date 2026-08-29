import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFleetCard,
  classifyFleetDossier,
  isCompleteCalorieDraft,
} from './coachFleet';
import { parseCalorieDraft as parseCalories } from './coachInterventions';
import type { CoachFleetDossier } from './types';

const TODAY = '2026-08-29';

function dossier(partial: Partial<CoachFleetDossier> & Pick<CoachFleetDossier, 'client_id' | 'full_name'>): CoachFleetDossier {
  return {
    coach_id: 'coach-id',
    goal: 'lose',
    onboarding_completed: true,
    has_program: true,
    setup_completed: true,
    linked_days: 40,
    training_frequency: 4,
    calorie_target: 2200,
    protein_target: 160,
    carbs_target: 200,
    fat_target: 70,
    weight_kg: 95,
    logged_nutrition_days: 10,
    avg_calories: 2200,
    last_nutrition_at: '2026-08-28',
    workout_count: 8,
    last_workout_at: '2026-08-28',
    checkin_count: 10,
    last_checkin_at: '2026-08-28',
    avg_adherence_nutrition: 4,
    avg_adherence_training: 4,
    weight_start_kg: 95,
    weight_end_kg: 94.2,
    weight_delta_kg: -0.8,
    last_message_at: null,
    ...partial,
  };
}

test('Marc — off-goal and not following nutrition → Relancer, never a calorie cut', () => {
  const marc = dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 13,
    avg_calories: 2850,
    avg_adherence_nutrition: 2,
    weight_start_kg: 94.9,
    weight_end_kg: 95.4,
    weight_delta_kg: 0.5,
    weight_kg: 95.4,
  });
  assert.equal(classifyFleetDossier(marc, TODAY), 'adherence_nutrition');
  const card = buildFleetCard(marc, TODAY, 'off');
  assert.ok(card);
  assert.equal(card?.kind, 'adherence_nutrition');
  assert.match(card?.title || '', /2200/);
  assert.equal(card?.payload.calories, undefined);
  assert.ok(typeof card?.payload.body === 'string' && String(card.payload.body).length > 20);
  assert.equal(card?.payload.ai_off, true);
  const calories = parseCalories(card?.payload);
  assert.equal(isCompleteCalorieDraft(calories), false);
  assert.doesNotMatch(JSON.stringify(card?.payload), /descends à 2000|macros 0/i);
});

test('adherent + stall → calorie_adjustment with complete macros (never 2000/0/0/0)', () => {
  const row = dossier({
    client_id: 'adherent-id',
    full_name: 'Nina Durand',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 12,
    avg_calories: 2180,
    avg_adherence_nutrition: 5,
    weight_start_kg: 80,
    weight_end_kg: 80.4,
    weight_delta_kg: 0.4,
    workout_count: 8,
  });
  assert.equal(classifyFleetDossier(row, TODAY), 'stall_adherent');
  const card = buildFleetCard(row, TODAY, 'off');
  assert.ok(card);
  assert.equal(card?.kind, 'calorie_adjustment');
  const cals = parseCalories(card?.payload);
  assert.ok(cals);
  assert.equal(isCompleteCalorieDraft(cals), true);
  assert.ok((cals?.protein ?? 0) > 0);
  assert.ok((cals?.carbs ?? 0) > 0);
  assert.ok((cals?.fat ?? 0) > 0);
  assert.notEqual(cals?.protein, 0);
});

test('Camille cut on-track → no card', () => {
  const camille = dossier({
    client_id: 'camille-id',
    full_name: 'Camille Roux',
    goal: 'lose',
    calorie_target: 1850,
    logged_nutrition_days: 10,
    avg_calories: 1790,
    avg_adherence_nutrition: 5,
    weight_start_kg: 70.1,
    weight_end_kg: 68.2,
    weight_delta_kg: -1.9,
    weight_kg: 68.2,
    workout_count: 8,
  });
  assert.equal(classifyFleetDossier(camille, TODAY), 'on_track');
  assert.equal(buildFleetCard(camille, TODAY), null);
});

test('Léa bulk on-track → no card', () => {
  const lea = dossier({
    client_id: 'lea-id',
    full_name: 'Léa Martin',
    goal: 'gain',
    calorie_target: 2400,
    logged_nutrition_days: 11,
    avg_calories: 2380,
    avg_adherence_nutrition: 5,
    weight_start_kg: 62.5,
    weight_end_kg: 63.1,
    weight_delta_kg: 0.6,
    weight_kg: 63.1,
    workout_count: 8,
  });
  assert.equal(classifyFleetDossier(lea, TODAY), 'on_track');
  assert.equal(buildFleetCard(lea, TODAY), null);
});

test('Sofia ghost → Relancer, not nutrition, not fake recovery numbers', () => {
  const sofia = dossier({
    client_id: 'sofia-id',
    full_name: 'Sofia Nguyen',
    goal: 'gain',
    calorie_target: 2300,
    logged_nutrition_days: 0,
    avg_calories: 0,
    last_nutrition_at: '2026-08-10',
    workout_count: 0,
    last_workout_at: '2026-08-08',
    checkin_count: 0,
    last_checkin_at: '2026-08-09',
    avg_adherence_nutrition: null,
    avg_adherence_training: null,
    weight_start_kg: 56.9,
    weight_end_kg: 57.1,
    weight_delta_kg: 0.2,
    linked_days: 50,
  });
  assert.equal(classifyFleetDossier(sofia, TODAY), 'ghost');
  const card = buildFleetCard(sofia, TODAY, 'off');
  assert.ok(card);
  assert.equal(card?.kind, 'adherence_training');
  assert.equal(card?.flag, 'ghost');
  assert.match(String(card?.payload.body), /app/i);
  assert.equal(card?.payload.calories, undefined);
  assert.doesNotMatch(String(card?.payload.body), /sommeil|douleur/i);
});

test('Alex new client → onboarding_plan / setup, not a stall', () => {
  const alex = dossier({
    client_id: 'alex-id',
    full_name: 'Alex Gagnon',
    onboarding_completed: false,
    has_program: false,
    setup_completed: false,
    linked_days: 2,
    logged_nutrition_days: 0,
    avg_calories: 0,
    workout_count: 0,
    checkin_count: 0,
    last_nutrition_at: null,
    last_workout_at: null,
    last_checkin_at: null,
    weight_delta_kg: null,
    weight_start_kg: null,
    weight_end_kg: null,
  });
  assert.equal(classifyFleetDossier(alex, TODAY), 'onboarding');
  const card = buildFleetCard(alex, TODAY, 'off');
  assert.equal(card?.kind, 'onboarding_plan');
  assert.notEqual(card?.kind, 'calorie_adjustment');
});

test('Alex first week with a program and 0 séances → setup, not missed training', () => {
  const alex = dossier({
    client_id: 'alex-id',
    full_name: 'Alex Gagnon',
    goal: 'maintain',
    onboarding_completed: true,
    has_program: true,
    setup_completed: true,
    linked_days: 5,
    training_frequency: 3,
    calorie_target: 2500,
    logged_nutrition_days: 1,
    avg_calories: 1120,
    last_nutrition_at: '2026-08-26',
    workout_count: 0,
    last_workout_at: null,
    checkin_count: 1,
    last_checkin_at: '2026-08-26',
    avg_adherence_nutrition: 3,
    weight_start_kg: 82,
    weight_end_kg: 81.8,
    weight_delta_kg: -0.2,
  });
  assert.equal(classifyFleetDossier(alex, TODAY), 'onboarding');
  const card = buildFleetCard(alex, TODAY, 'off');
  assert.equal(card?.kind, 'onboarding_plan');
  assert.match(card?.title || '', /première semaine/i);
  assert.notEqual(card?.kind, 'adherence_training');
  assert.notEqual(card?.kind, 'calorie_adjustment');
});

test('coaching-copy 5-client calibration: Marc Relancer, Sofia Relancer, Camille/Léa silence', () => {
  const marc = dossier({
    client_id: '22222222-2222-4222-8222-222222222222',
    full_name: 'Marc Bouchard',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 7,
    avg_calories: 3107,
    avg_adherence_nutrition: 2,
    weight_start_kg: 95.2,
    weight_end_kg: 95.4,
    weight_delta_kg: 0.2,
    weight_kg: 95.4,
    workout_count: 2,
    last_workout_at: '2026-08-21 22:15:00+00',
    last_nutrition_at: '2026-08-23',
    last_checkin_at: '2026-08-28',
    linked_days: 36,
    training_frequency: 3,
  });
  const camille = dossier({
    client_id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Camille Tremblay',
    goal: 'lose',
    calorie_target: 1850,
    logged_nutrition_days: 10,
    avg_calories: 1790,
    avg_adherence_nutrition: 4.5,
    weight_start_kg: 69.5,
    weight_end_kg: 68.2,
    weight_delta_kg: -1.3,
    weight_kg: 68.2,
    workout_count: 8,
    last_workout_at: '2026-08-28 22:15:00+00',
    last_nutrition_at: '2026-08-28',
    last_checkin_at: '2026-08-28',
    linked_days: 43,
    training_frequency: 4,
  });
  const sofia = dossier({
    client_id: '33333333-3333-4333-8333-333333333333',
    full_name: 'Sofia Nguyen',
    goal: 'gain',
    calorie_target: 2300,
    logged_nutrition_days: 1,
    avg_calories: 1710,
    last_nutrition_at: '2026-08-16',
    workout_count: 0,
    last_workout_at: null,
    checkin_count: 1,
    last_checkin_at: '2026-08-18',
    avg_adherence_nutrition: 4,
    weight_start_kg: 57,
    weight_end_kg: 57.1,
    weight_delta_kg: 0.1,
    linked_days: 50,
    training_frequency: 4,
  });
  const lea = dossier({
    client_id: '55555555-5555-4555-8555-555555555555',
    full_name: 'Léa Martin',
    goal: 'gain',
    calorie_target: 2400,
    logged_nutrition_days: 10,
    avg_calories: 2360,
    avg_adherence_nutrition: 4,
    weight_start_kg: 59.8,
    weight_end_kg: 60.4,
    weight_delta_kg: 0.6,
    weight_kg: 60.4,
    workout_count: 8,
    last_workout_at: '2026-08-28 22:15:00+00',
    last_nutrition_at: '2026-08-28',
    last_checkin_at: '2026-08-28',
    linked_days: 36,
    training_frequency: 5,
  });
  assert.equal(classifyFleetDossier(marc, TODAY), 'adherence_nutrition');
  assert.equal(buildFleetCard(marc, TODAY, 'off')?.kind, 'adherence_nutrition');
  assert.match(buildFleetCard(marc, TODAY, 'off')?.title || '', /2200/);
  assert.equal(classifyFleetDossier(camille, TODAY), 'on_track');
  assert.equal(buildFleetCard(camille, TODAY), null);
  assert.equal(classifyFleetDossier(sofia, TODAY), 'ghost');
  assert.equal(buildFleetCard(sofia, TODAY, 'off')?.kind, 'adherence_training');
  assert.equal(classifyFleetDossier(lea, TODAY), 'on_track');
  assert.equal(buildFleetCard(lea, TODAY), null);
});

test('incomplete 2000/0/0/0 is not a sendable calorie draft', () => {
  assert.equal(isCompleteCalorieDraft({ calories: 2000, protein: 0, carbs: 0, fat: 0 }), false);
  assert.equal(isCompleteCalorieDraft({ calories: 2000, protein: 160, carbs: 180, fat: 70 }), true);
});
