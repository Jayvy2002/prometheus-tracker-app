import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  FLEET_COPY,
} from '../../../../supabase/functions/_shared/fleetCopy.ts';
import {
  buildFleetCard,
  classifyFleetDossier,
  completeMacrosFor,
  fleetEvidenceFromDossier,
  isCompleteCalorieDraft,
  isRelanceKind,
  planFleetRoundCard,
  proposeWeeklyNutrition,
  weeklyWeightPct,
  WEEKLY_LARGE_KCAL,
  WEEKLY_SMALL_KCAL,
} from './coachFleet';
import { parseCalorieDraft as parseCalories } from './coachInterventions';
import type { AthleteDecisionLog, CoachFleetDossier } from '../../../lib/types';

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
    last_coach_message_at: null,
    last_keep_in_touch_at: null,
    pending_fleet: false,
    fleet_handled: [],
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
  const card = buildFleetCard(marc, TODAY);
  assert.ok(card);
  assert.equal(card?.kind, 'adherence_nutrition');
  assert.match(card?.title || '', /2200/);
  assert.equal(card?.payload.calories, undefined);
  assert.ok(typeof card?.payload.body === 'string' && String(card.payload.body).length > 20);
  assert.equal(card?.payload.ai_off, undefined);
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
  const card = buildFleetCard(row, TODAY);
  assert.ok(card);
  assert.equal(card?.kind, 'calorie_adjustment');
  const cals = parseCalories(card?.payload);
  assert.ok(cals);
  assert.equal(isCompleteCalorieDraft(cals), true);
  assert.ok((cals?.protein ?? 0) > 0);
  assert.ok((cals?.carbs ?? 0) > 0);
  assert.ok((cals?.fat ?? 0) > 0);
  assert.notEqual(cals?.protein, 0);
  assert.equal(cals?.calories, 2000);
  assert.equal(card?.payload.reason, 'cut_gain');
  const why = card?.payload.why as { from?: number; to?: number; avg?: number } | undefined;
  assert.equal(why?.from, 2200);
  assert.equal(why?.to, 2000);
  assert.equal(why?.avg, 2180);
});

test('Camille cut on-track + coach wrote this week → no extra card', () => {
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
    last_coach_message_at: '2026-08-28',
  });
  assert.equal(classifyFleetDossier(camille, TODAY), 'on_track');
  assert.equal(buildFleetCard(camille, TODAY), null);
});

test('Camille on-track + silent 10d → keep_in_touch, not stall, not calories', () => {
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
    last_coach_message_at: '2026-08-19',
  });
  assert.equal(classifyFleetDossier(camille, TODAY), 'on_track');
  const card = buildFleetCard(camille, TODAY);
  assert.ok(card);
  assert.equal(card?.kind, 'keep_in_touch');
  assert.equal(card?.flag, 'keep_in_touch');
  assert.ok(isRelanceKind(card!.kind));
  assert.match(card?.title || '', /Camille/i);
  assert.match(String(card?.payload.body), /comment tu vas/i);
  assert.match(String(card?.payload.body), /entraînement/i);
  assert.doesNotMatch(String(card?.payload.body), /kcal|stagne|descends/i);
  assert.equal(card?.payload.calories, undefined);
  assert.notEqual(card?.kind, 'adherence_nutrition');
  assert.notEqual(card?.kind, 'calorie_adjustment');
});

test('Léa bulk on-track + coach wrote this week → no extra card', () => {
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
    last_coach_message_at: '2026-08-28',
  });
  assert.equal(classifyFleetDossier(lea, TODAY), 'on_track');
  assert.equal(buildFleetCard(lea, TODAY), null);
});

test('Léa on-track + keep_in_touch already this week → no extra card', () => {
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
    last_coach_message_at: null,
    last_keep_in_touch_at: '2026-08-26',
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
  const card = buildFleetCard(sofia, TODAY);
  assert.ok(card);
  assert.equal(card?.kind, 'adherence_training');
  assert.equal(card?.flag, 'ghost');
  assert.notEqual(card?.kind, 'keep_in_touch');
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
  const card = buildFleetCard(alex, TODAY);
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
  const card = buildFleetCard(alex, TODAY);
  assert.equal(card?.kind, 'onboarding_plan');
  assert.match(card?.title || '', /première semaine/i);
  assert.notEqual(card?.kind, 'adherence_training');
  assert.notEqual(card?.kind, 'calorie_adjustment');
});

test('coaching-copy 5-client calibration: Marc Relancer, Sofia ghost, Camille/Léa keep-in-touch if silent', () => {
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
  assert.equal(buildFleetCard(marc, TODAY)?.kind, 'adherence_nutrition');
  assert.match(buildFleetCard(marc, TODAY)?.title || '', /2200/);
  assert.notEqual(buildFleetCard(marc, TODAY)?.kind, 'keep_in_touch');
  assert.equal(classifyFleetDossier(camille, TODAY), 'on_track');
  assert.equal(buildFleetCard(camille, TODAY)?.kind, 'keep_in_touch');
  assert.equal(classifyFleetDossier(sofia, TODAY), 'ghost');
  assert.equal(buildFleetCard(sofia, TODAY)?.kind, 'adherence_training');
  assert.notEqual(buildFleetCard(sofia, TODAY)?.kind, 'keep_in_touch');
  assert.equal(classifyFleetDossier(lea, TODAY), 'on_track');
  assert.equal(buildFleetCard(lea, TODAY)?.kind, 'keep_in_touch');
});

test('the round writes every draft in the coach language — EN coach gets EN copy, FR stays default', () => {
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
    last_coach_message_at: null,
  });
  const fr = buildFleetCard(camille, TODAY);
  const en = buildFleetCard(camille, TODAY, 'en');
  assert.equal(fr?.kind, 'keep_in_touch');
  assert.equal(en?.kind, 'keep_in_touch');
  assert.equal(fr?.title, 'Prendre des nouvelles de Camille');
  assert.equal(en?.title, 'Check in with Camille');
  assert.match(String(fr?.payload.body), /^Salut Camille/);
  assert.match(String(en?.payload.body), /^Hey Camille/);
  assert.doesNotMatch(String(en?.payload.body), /kcal|calories|stall/i);

  const marc = dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    calorie_target: 2200,
    logged_nutrition_days: 13,
    avg_calories: 2850,
    avg_adherence_nutrition: 2,
    weight_delta_kg: 0.5,
  });
  const marcEn = buildFleetCard(marc, TODAY, 'en');
  assert.equal(marcEn?.kind, 'adherence_nutrition');
  assert.equal(marcEn?.title, 'Not hitting the 2200');
  assert.match(String(marcEn?.payload.body), /^Hey Marc, your logs are clearly above the 2200 kcal/);
  assert.match(marcEn?.observation || '', /^Target 2200 kcal/);
  assert.equal(marcEn?.payload.template_key, 'missed_checkins');
  // Same rules, same numbers — only the words change.
  const marcFr = buildFleetCard(marc, TODAY, 'fr');
  assert.equal(marcFr?.kind, marcEn?.kind);
  assert.equal(marcFr?.flag, marcEn?.flag);
  assert.equal(marcFr?.payload.current_calories, marcEn?.payload.current_calories);
});

test('fleet copy: FR and EN dictionaries expose the same keys and the edge reads user_profiles.language', () => {
  const keysOf = (obj: unknown, prefix = ''): string[] => {
    if (!obj || typeof obj !== 'object') return [prefix];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      typeof v === 'function' ? [`${prefix}${k}`] : keysOf(v, `${prefix}${k}.`));
  };
  assert.deepEqual(keysOf(FLEET_COPY.en).sort(), keysOf(FLEET_COPY.fr).sort());
  const fleet = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  assert.match(fleet, /from "\.\.\/_shared\/fleetCopy\.ts"/);
  assert.match(fleet, /fetchCoachContext/);
  assert.match(fleet, /select\("id, language"\)/);
  assert.match(fleet, /coach_settings/);
  assert.match(fleet, /todayInTimeZone/);
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260905124022_user_language.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS language/);
});

test('keep_in_touch SQL uses coach outbound messages, not client logs', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260829131109_keep_in_touch.sql'), 'utf8');
  assert.match(sql, /keep_in_touch/);
  assert.match(sql, /last_coach_message_at/);
  assert.match(sql, /sender_id = m\.coach_id/);
  assert.match(sql, /last_keep_in_touch_at/);
  const fleet = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  assert.match(fleet, /kind: "keep_in_touch"/);
  assert.doesNotMatch(fleet, /Si ça va : tu ne dois pas être appelé/);
});

test('after dismiss/send, a second round of the same snapshot produces 0 new pending cards', () => {
  const marc = dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    calorie_target: 2200,
    logged_nutrition_days: 13,
    avg_calories: 2850,
    avg_adherence_nutrition: 2,
    weight_start_kg: 94.9,
    weight_end_kg: 95.4,
    weight_delta_kg: 0.5,
  });
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
    linked_days: 50,
  });
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
    last_coach_message_at: '2026-08-19',
  });
  const first = [marc, sofia, camille].map((d) => planFleetRoundCard(d, TODAY));
  assert.deepEqual(first.map((p) => p.action), ['insert', 'insert', 'insert']);
  assert.equal(first[0]?.card?.kind, 'adherence_nutrition');
  assert.equal(first[1]?.card?.kind, 'adherence_training');
  assert.equal(first[2]?.card?.kind, 'keep_in_touch');

  const handled = [marc, sofia, camille].map((d, i) => {
    const card = first[i]?.card;
    assert.ok(card);
    return dossier({
      ...d,
      pending_fleet: false,
      last_keep_in_touch_at: card.kind === 'keep_in_touch' ? TODAY : d.last_keep_in_touch_at,
      fleet_handled: [{
        kind: card.kind,
        flag: card.flag,
        status: i === 0 ? 'dismissed' : 'sent',
        handled_at: TODAY,
        evidence: fleetEvidenceFromDossier(d),
      }],
    });
  });
  const second = handled.map((d) => planFleetRoundCard(d, TODAY));
  assert.equal(second.filter((p) => p.action !== 'skip').length, 0);
  assert.ok(second.every((p) => p.card === null));
});

test('pending fleet card is refreshed in place, not duplicated', () => {
  const marc = dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    calorie_target: 2200,
    logged_nutrition_days: 13,
    avg_calories: 2850,
    avg_adherence_nutrition: 2,
    pending_fleet: true,
  });
  const plan = planFleetRoundCard(marc, TODAY);
  assert.equal(plan.action, 'upsert');
  assert.equal(plan.card?.kind, 'adherence_nutrition');
});

test('another week of 3100 vs 2200 after dismiss is new evidence, same snapshot is not', () => {
  const marc = dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    calorie_target: 2200,
    logged_nutrition_days: 10,
    avg_calories: 3100,
    avg_adherence_nutrition: 2,
    weight_delta_kg: 0.4,
  });
  const handled = [{
    kind: 'adherence_nutrition' as const,
    flag: 'adherence_nutrition',
    status: 'dismissed',
    handled_at: TODAY,
    evidence: fleetEvidenceFromDossier(marc),
  }];
  assert.equal(planFleetRoundCard(dossier({ ...marc, fleet_handled: handled }), TODAY).action, 'skip');
  const nextWeek = dossier({
    ...marc,
    logged_nutrition_days: 14,
    avg_calories: 3120,
    last_nutrition_at: '2026-08-29',
    fleet_handled: handled,
  });
  assert.equal(planFleetRoundCard(nextWeek, TODAY).action, 'insert');
});

test('P2.3: journal refusal skips after 7-day cooldown if evidence is unchanged', () => {
  const marc = dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    calorie_target: 2200,
    logged_nutrition_days: 10,
    avg_calories: 3100,
    avg_adherence_nutrition: 2,
    weight_delta_kg: 0.4,
  });
  const handled = [{
    kind: 'adherence_nutrition' as const,
    flag: 'adherence_nutrition',
    status: 'dismissed',
    handled_at: '2026-08-18',
    evidence: fleetEvidenceFromDossier(marc),
  }];
  const afterCooldown = dossier({ ...marc, fleet_handled: handled });
  assert.equal(planFleetRoundCard(afterCooldown, TODAY).action, 'insert');

  const refused: AthleteDecisionLog[] = [{
    id: 'dec-fleet',
    athlete_id: 'marc-id',
    actor_id: 'coach-id',
    actor_role: 'coach',
    domain: 'nutrition',
    type: 'not_following',
    decision: 'refused',
    proposal: { kind: 'adherence_nutrition' },
    why: 'adherence_nutrition',
    data_used: {
      avg_calories: 3100,
      calorie_target: 2200,
      workout_count: afterCooldown.workout_count,
      logged_nutrition_days: 10,
      weight_delta_kg: 0.4,
    },
    human_reason: null,
    applied_effect: {},
    source: 'coach_interventions',
    source_id: null,
    created_at: '2026-08-18T00:00:00Z',
  }];
  assert.equal(planFleetRoundCard(afterCooldown, TODAY, 'fr', refused).action, 'skip');

  const moved = dossier({ ...afterCooldown, avg_calories: 3400 });
  assert.equal(planFleetRoundCard(moved, TODAY, 'fr', refused).action, 'insert');
});

test('upsert SQL never reopens sent/dismissed fleet rows', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260829134034_fleet_handled_cooldown.sql'), 'utf8');
  assert.match(sql, /AND status = 'pending'/);
  assert.match(sql, /status IN \('sent', 'dismissed', 'kept'\)/);
  assert.match(sql, /RETURN NULL/);
  assert.match(sql, /fleet_evidence_changed/);
  assert.match(sql, /pending_fleet/);
  assert.doesNotMatch(sql, /SET\s+status\s*=\s*'pending'/);
  const fleet = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  assert.match(fleet, /planWrite/);
  assert.match(fleet, /FLEET_HANDLE_COOLDOWN_DAYS/);
  assert.match(fleet, /athlete_decision_log/);
  assert.match(fleet, /isProposalSuppressed/);
});

/**
 * The definition production actually runs is the LAST migration (in filename order) that
 * re-creates triage_coach_fleet — not whichever file first introduced a key. 20260901012958
 * re-created the function from an older copy and silently dropped four dossier keys; the
 * tests below read the latest definition so that class of regression fails CI.
 */
function latestTriageCoachFleetSql(): { file: string; fn: string } {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const marker = 'CREATE OR REPLACE FUNCTION public.triage_coach_fleet';
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(resolve(dir, files[i]), 'utf8');
    const at = sql.indexOf(marker);
    if (at >= 0) return { file: files[i], fn: sql.slice(at) };
  }
  throw new Error('no migration defines triage_coach_fleet');
}

test('the latest triage_coach_fleet definition emits every dossier key the edge parses', () => {
  const { file, fn } = latestTriageCoachFleetSql();
  assert.ok(file >= '20260910052704');
  const fleet = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  const iface = fleet.slice(fleet.indexOf('interface Dossier {'), fleet.indexOf('interface FleetEvidence'));
  const keys = [...iface.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 30, `expected the Dossier interface, got ${keys.length} keys`);
  for (const key of keys) {
    assert.match(fn, new RegExp(`'${key}',`), `triage_coach_fleet no longer emits '${key}' (${file})`);
  }
  // The two things the regression and the P0 fix each brought — both must survive.
  assert.match(fn, /program_frequency AS \(/);
  assert.match(fn, /COALESCE\(NULLIF\(pfreq\.training_frequency, 0\), NULLIF\(p\.training_frequency, 0\), 3\)/);
  assert.match(fn, /'pending_fleet', pend\.client_id IS NOT NULL/);
  assert.match(fn, /'fleet_handled', COALESCE\(h\.fleet_handled, '\[\]'::jsonb\)/);
  assert.match(fn, /WHERE m\.sender_id = m\.coach_id/);
  assert.match(fn, /WHERE ci\.kind = 'keep_in_touch'/);
  assert.match(fn, /p_client_id uuid DEFAULT NULL/);
  assert.match(fn, /p_client_id IS NULL OR ccl\.client_id = p_client_id/);
});

test('triage_coach_fleet qualifies handled_agg columns so PL/pgSQL does not treat client_id as OUT', () => {
  const { fn } = latestTriageCoachFleetSql();
  assert.match(fn, /#variable_conflict use_column/);
  const start = fn.indexOf('handled_agg AS (');
  const end = fn.indexOf('LEFT JOIN handled_agg');
  assert.ok(start >= 0 && end > start);
  const agg = fn.slice(start, end);
  assert.match(agg, /handled_ord\.client_id/);
  assert.match(agg, /handled_ord\.kind/);
  assert.match(agg, /handled_ord\.flag/);
  assert.match(agg, /handled_ord\.status/);
  assert.match(agg, /handled_ord\.handled_at/);
  assert.match(agg, /handled_ord\.evidence/);
  assert.match(agg, /WHERE handled_ord\.rn = 1/);
  assert.match(agg, /GROUP BY handled_ord\.client_id/);
  assert.doesNotMatch(agg, /^\s+client_id,$/m);
  assert.doesNotMatch(agg, /GROUP BY client_id\s*$/m);
});

test('incomplete 2000/0/0/0 is not a sendable calorie draft', () => {
  assert.equal(isCompleteCalorieDraft({ calories: 2000, protein: 0, carbs: 0, fat: 0 }), false);
  assert.equal(isCompleteCalorieDraft({ calories: 2000, protein: 160, carbs: 180, fat: 70 }), true);
});

test('cut stall (flat) → small reduction, not a generic −150', () => {
  const row = dossier({
    client_id: 'stall-id',
    full_name: 'Nina Plat',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 12,
    avg_calories: 2180,
    avg_adherence_nutrition: 5,
    weight_start_kg: 80,
    weight_end_kg: 80,
    weight_delta_kg: 0,
    workout_count: 8,
  });
  const proposal = proposeWeeklyNutrition(row);
  assert.equal(proposal.reason, 'cut_stall');
  assert.equal(proposal.draft?.calories, 2200 - WEEKLY_SMALL_KCAL);
  assert.equal(isCompleteCalorieDraft(proposal.draft), true);
  const card = buildFleetCard(row, TODAY);
  assert.equal(card?.kind, 'calorie_adjustment');
  assert.equal(card?.payload.reason, 'cut_stall');
  assert.equal(card?.payload.calories, 2100);
});

test('not following (logs >> target) → Relancer, never a calorie card', () => {
  const marc = dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    calorie_target: 2200,
    logged_nutrition_days: 13,
    avg_calories: 2850,
    avg_adherence_nutrition: 2,
    weight_delta_kg: 0.5,
  });
  const proposal = proposeWeeklyNutrition(marc);
  assert.equal(proposal.action, 'relance');
  assert.equal(proposal.reason, 'not_following');
  assert.equal(proposal.draft, null);
});

test('fatigue DECLARED on a followed cut → more carbs, same calories, not another cut', () => {
  const row = dossier({
    client_id: 'fatigue-id',
    full_name: 'Jade Fatigue',
    goal: 'lose',
    calorie_target: 2200,
    protein_target: 160,
    carbs_target: 200,
    fat_target: 70,
    logged_nutrition_days: 12,
    avg_calories: 2180,
    avg_adherence_nutrition: 5,
    avg_adherence_training: 4,
    avg_fatigue: 8,
    weight_start_kg: 80,
    weight_end_kg: 80.4,
    weight_delta_kg: 0.4,
    workout_count: 8,
  });
  const proposal = proposeWeeklyNutrition(row);
  assert.equal(proposal.reason, 'carb_support');
  assert.equal(proposal.draft?.calories, 2200);
  assert.ok((proposal.draft?.carbs ?? 0) > 200);
  assert.ok((proposal.draft?.fat ?? 0) < 70);
  assert.equal(isCompleteCalorieDraft(proposal.draft), true);
  const card = buildFleetCard(row, TODAY);
  assert.equal(card?.kind, 'calorie_adjustment');
  assert.equal(card?.payload.reason, 'carb_support');
  assert.equal(card?.payload.calories, 2200);
});

test('I04: low training adherence alone is NOT fatigue — no carb_support without declared signals', () => {
  const row = dossier({
    client_id: 'adh-low-id',
    full_name: 'Theo Adherent',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 12,
    avg_calories: 2180,
    avg_adherence_nutrition: 90,
    avg_adherence_training: 10,
    weight_start_kg: 80,
    weight_end_kg: 79.4,
    weight_delta_kg: -0.6,
    workout_count: 8,
  });
  const proposal = proposeWeeklyNutrition(row);
  assert.notEqual(proposal.reason, 'carb_support');
});

test('I04: low declared energy also reads as fatigue', () => {
  const row = dossier({
    client_id: 'energy-low-id',
    full_name: 'Lea Energy',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 12,
    avg_calories: 2180,
    avg_adherence_nutrition: 90,
    avg_energy: 2,
    weight_start_kg: 80,
    weight_end_kg: 80.2,
    weight_delta_kg: 0.2,
    workout_count: 8,
  });
  assert.equal(proposeWeeklyNutrition(row).reason, 'carb_support');
});

test('bulk not gaining → small increase; bulk too fast → smaller surplus', () => {
  const stall = dossier({
    client_id: 'bulk-stall',
    full_name: 'Léa Stall',
    goal: 'gain',
    calorie_target: 2400,
    logged_nutrition_days: 11,
    avg_calories: 2380,
    avg_adherence_nutrition: 5,
    weight_start_kg: 62,
    weight_end_kg: 62,
    weight_delta_kg: 0,
    workout_count: 8,
  });
  const stallProp = proposeWeeklyNutrition(stall);
  assert.equal(stallProp.reason, 'bulk_stall');
  assert.equal(stallProp.draft?.calories, 2400 + WEEKLY_SMALL_KCAL);

  const fast = dossier({
    client_id: 'bulk-fast',
    full_name: 'Léa Fast',
    goal: 'gain',
    calorie_target: 2400,
    logged_nutrition_days: 11,
    avg_calories: 2380,
    avg_adherence_nutrition: 5,
    weight_start_kg: 62,
    weight_end_kg: 64,
    weight_delta_kg: 2,
    weight_kg: 64,
    workout_count: 8,
  });
  const fastProp = proposeWeeklyNutrition(fast);
  assert.equal(fastProp.reason, 'bulk_too_fast');
  assert.equal(fastProp.draft?.calories, 2400 - WEEKLY_SMALL_KCAL);
  assert.equal(isCompleteCalorieDraft(fastProp.draft), true);
});

test('normal cut loss → keep, no calorie_adjustment (keep-in-touch only if silent)', () => {
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
    last_coach_message_at: '2026-08-28',
  });
  const proposal = proposeWeeklyNutrition(camille);
  assert.equal(proposal.action, 'keep');
  assert.equal(proposal.draft, null);
  assert.equal(buildFleetCard(camille, TODAY), null);
});

test('the round is 100 % deterministic — no LLM call, no OpenAI key, no ai_off flag', () => {
  const fleet = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  assert.doesNotMatch(fleet, /openaiJson|OPENAI_API_KEY|fleetCardNeedsLlm|SYSTEM_PROMPT|fetchCoachLessons/);
  assert.match(fleet, /MODEL_USED = "deterministic"/);
  const marc = buildFleetCard(dossier({
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    calorie_target: 2200,
    logged_nutrition_days: 13,
    avg_calories: 2850,
    avg_adherence_nutrition: 2,
    weight_delta_kg: 0.5,
  }), TODAY);
  assert.ok(marc);
  assert.equal(marc?.payload.ai_off, undefined);
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /program_adjustment` seulement/);
});

test('triage_coach_fleet reviews EVERY active client — no 14d activity gate', () => {
  const { fn } = latestTriageCoachFleetSql();
  assert.match(fn, /FROM links l\s+JOIN public\.user_profiles p ON p\.id = l\.client_id/);
  const fromLinks = fn.slice(fn.lastIndexOf('FROM links l'));
  assert.doesNotMatch(fromLinks, /WHERE EXISTS/);
  assert.doesNotMatch(fromLinks, /logged_nutrition_days\s*>\s*0/);
  const lock = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260829162959_fleet_in_app_weekly_review.sql'), 'utf8');
  assert.match(lock, /COMMENT ON FUNCTION public\.triage_coach_fleet/);
});

test('architecture lock: weekly review stays deterministic and in-app', () => {
  const fleet = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  assert.match(fleet, /MODEL_USED = "deterministic"/);
  assert.doesNotMatch(fleet, /Deno\.env\.get\("[A-Z0-9_]*WEBHOOK_URL"\)/);
  assert.doesNotMatch(fleet, /XAI_API_KEY|api\.x\.ai/);
  const loop = fleet.slice(fleet.indexOf('for (const d of dossiers)'));
  assert.match(loop, /planWrite\(d, today, ctx\?\.locale \?\? "fr", decisionLogs\.get\(d\.client_id\) \?\? \[\]\)/);
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
  assert.match(readme, /analyse déterministe `coach-fleet-round`/);
  assert.match(readme, /l’IA prépare ; l’humain décide/);
  assert.doesNotMatch(readme, /XAI_API_KEY/);
  const cron = readFileSync(resolve(process.cwd(), 'supabase/cron/schedule_coach_fleet_round.sql'), 'utf8');
  assert.match(cron, /FLEET_CRON_SECRET/);
  assert.match(cron, /invoke_coach_fleet_round/);
  assert.doesNotMatch(cron, /XAI_API_KEY|api\.x\.ai/);
});

test('fleet-round weekly kcal is data-driven, not a generic ±150', () => {
  const fleet = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  assert.match(fleet, /proposeWeeklyNutrition/);
  assert.match(fleet, /WEEKLY_LARGE_KCAL/);
  assert.match(fleet, /carb_support/);
  assert.match(fleet, /why:\s*\{/);
  assert.match(fleet, /loggedDays:/);
  assert.doesNotMatch(fleet, /direction === "down" \? -150/);
  const src = readFileSync(resolve(process.cwd(), 'src/features/coaching/domain/coachFleet.ts'), 'utf8');
  assert.doesNotMatch(src, /cut_more' \|\| direction === 'bulk_less' \? -150/);
  assert.equal(WEEKLY_LARGE_KCAL, 200);
  const nina = completeMacrosFor(2000, 'lose', 80);
  assert.equal(isCompleteCalorieDraft(nina), true);
  const setup = readFileSync(resolve(process.cwd(), 'src/components/coaching/ClientSetupPage.tsx'), 'utf8');
  assert.match(setup, /setupTargetsFromChoice/);
  assert.match(setup, /initialSetupTargetChoice/);
  assert.match(setup, /targetChoice/);
  assert.doesNotMatch(setup, /daily_calorie_target \|\| targets/);
  assert.doesNotMatch(setup, /daily_calorie_target \|\| issn/);
  assert.match(setup, /needsMedicalAck && !medicalAck/);
  assert.ok(
    setup.indexOf('if (needsMedicalAck && !medicalAck)') < setup.indexOf('await applyIntervention'),
    'medical ack must block before any setup write',
  );
  assert.match(setup, /track\('setup_targets_choice'/);
  // The weekly card is now the solo copilot (SoloWeeklyReview): same fleet rules, shown to solos
  // only, and the only write to targets is the solo's explicit accept in soloCopilotStore.decide.
  const weekly = readFileSync(resolve(process.cwd(), 'src/components/dashboard/SoloWeeklyReview.tsx'), 'utf8');
  assert.doesNotMatch(weekly, /updateProfile/);
  assert.match(weekly, /computeSoloWeeklyReview/);
  const solo = readFileSync(resolve(process.cwd(), 'src/lib/soloCopilot.ts'), 'utf8');
  assert.match(solo, /proposeWeeklyNutrition\(buildSoloDossier/);
});

test('I03: weight pace uses the real span between weigh-ins, not the window', () => {
  // Same -1 kg over 2 days vs 14 days: very different paces.
  const fast = weeklyWeightPct(-1, 80, 2);
  const slow = weeklyWeightPct(-1, 80, 14);
  assert.ok(fast != null && slow != null);
  assert.ok(Math.abs(fast) > Math.abs(slow) * 5);
  // Same-day measures: unknown, not a pace.
  assert.equal(weeklyWeightPct(-1, 80, 0), null);
  assert.equal(weeklyWeightPct(-1, 80, null), weeklyWeightPct(-1, 80, 14));
});

test('I03: days are judged against the target that governed them', () => {
  const row = dossier({
    client_id: 'eff-target-id',
    full_name: 'Eva Target',
    calorie_target: 2600,
    avg_effective_target: 2000,
    logged_nutrition_days: 12,
    avg_calories: 2050,
    avg_adherence_nutrition: 90,
    weight_start_kg: 80,
    weight_end_kg: 79.6,
    weight_delta_kg: -0.4,
    workout_count: 8,
  });
  // 2050 vs current 2600 would look under-fed (0.79); vs effective 2000 it follows.
  const proposal = proposeWeeklyNutrition(row);
  assert.notEqual(proposal.action, 'relance');
  const card = buildFleetCard(row, TODAY);
  assert.notEqual(card?.kind, 'adherence_nutrition');
});

test('I04: disabled modules never trigger reproach', () => {
  const untracked = dossier({
    client_id: 'untracked-id',
    full_name: 'Ugo Untracked',
    logged_nutrition_days: 0,
    avg_calories: 0,
    workout_count: 0,
    checkin_count: 0,
    last_nutrition_at: null,
    last_workout_at: null,
    last_checkin_at: null,
    linked_days: 60,
    weight_delta_kg: null,
    tracking: { nutrition: false, workouts: false, weight: false, checkins: false },
  });
  assert.equal(classifyFleetDossier(untracked, TODAY), 'on_track');
  assert.deepEqual(proposeWeeklyNutrition(untracked), { action: 'keep', reason: 'keep', draft: null });

  const noTraining = dossier({
    client_id: 'no-training-id',
    full_name: 'Nadia NoTraining',
    workout_count: 0,
    tracking: { nutrition: true, workouts: false, weight: true, checkins: true },
  });
  assert.notEqual(classifyFleetDossier(noTraining, TODAY), 'adherence_training');
});

test('I04: minor or medical flags → qualified review, never an automatic adjustment', () => {
  const minor = dossier({
    client_id: 'minor-id',
    full_name: 'Milo Minor',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 12,
    avg_calories: 2180,
    avg_adherence_nutrition: 90,
    weight_start_kg: 80,
    weight_end_kg: 80,
    weight_delta_kg: 0,
    workout_count: 8,
    is_minor: true,
  });
  const proposal = proposeWeeklyNutrition(minor);
  assert.equal(proposal.action, 'keep');
  assert.equal(proposal.guarded, true);
  assert.equal(classifyFleetDossier(minor, TODAY), 'keep_in_touch');
  const card = buildFleetCard(minor, TODAY);
  assert.equal(card?.kind, 'keep_in_touch');
  assert.equal(card?.payload.guarded, true);

  const flagged = dossier({
    client_id: 'flagged-id',
    full_name: 'Fiona Flagged',
    goal: 'lose',
    calorie_target: 2200,
    logged_nutrition_days: 12,
    avg_calories: 2180,
    avg_adherence_nutrition: 90,
    weight_start_kg: 80,
    weight_end_kg: 80,
    weight_delta_kg: 0,
    workout_count: 8,
    has_medical_flags: true,
  });
  assert.equal(proposeWeeklyNutrition(flagged).guarded, true);
});

test('I03/I04: evidence carries target, span and window; fleet copy has guarded strings', () => {
  const row = dossier({ client_id: 'ev-id', full_name: 'Evi Dence' });
  const ev = fleetEvidenceFromDossier(row);
  assert.equal(ev.window_days, 14);
  assert.equal(typeof ev.target_avg_kcal, 'number');
  assert.match(
    readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/fleetCopy.ts'), 'utf8'),
    /guardedCause/,
  );
  const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-fleet-round/index.ts'), 'utf8');
  for (const fn of ['trackingOn', 'effectiveCalorieTarget', 'isGuardedProfile', 'keepInTouchCard']) {
    assert.match(edge, new RegExp(`function ${fn}\\(`), `edge must mirror ${fn}`);
  }
});
