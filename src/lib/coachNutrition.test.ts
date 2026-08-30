import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoachPriorities } from './coachPriorities';
import { groupQueueByClient, resolveQueueAction } from './coachQueue';
import {
  canAskCalorieAdjustment,
  detectCutCalorieStall,
  shouldShowCutStallCard,
  isProgressHref,
  nutritionStallFocusHref,
  nutritionStallReviewRows,
} from './coachNutrition';
import type {
  ClientOpsRow,
  CoachClientSummary,
  CoachIntervention,
  CoachRosterSignals,
  DailyCheckin,
  NutritionLogSnapshot,
  WeightMeasurement,
} from './types';

const TODAY = '2026-08-29';

function client(id: string, name: string, goal: string, target: number): CoachClientSummary {
  return {
    id,
    full_name: name,
    email: `${id}@example.com`,
    avatar_url: '',
    linked_at: '2026-07-01T00:00:00Z',
    onboarding_completed: true,
    goal,
    training_frequency: 4,
    target_weight_kg: 88,
    weight_kg: 95,
    last_visited_at: null,
    last_nudged_at: null,
  };
}

function ops(row: CoachClientSummary): ClientOpsRow {
  return {
    client: row,
    alerts: [],
    hasScheduledTrainingToday: true,
    hasProgram: true,
    setupCompleted: true,
  };
}

function weight(userId: string, date: string, kg: number): WeightMeasurement {
  return {
    id: `${userId}-${date}`,
    user_id: userId,
    weight_kg: kg,
    measured_at: date,
    notes: '',
    created_at: `${date}T08:00:00Z`,
  };
}

function log(userId: string, date: string, calories: number): NutritionLogSnapshot {
  return { user_id: userId, logged_at: date, calories };
}

function days(userId: string, start: string, count: number, calories: number): NutritionLogSnapshot[] {
  const out: NutritionLogSnapshot[] = [];
  const startMs = Date.parse(`${start}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const d = new Date(startMs + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    out.push(log(userId, iso, calories));
  }
  return out;
}

function emptySignals(partial: Partial<CoachRosterSignals> = {}): CoachRosterSignals {
  return {
    checkins: [] as DailyCheckin[],
    weights: [],
    lifts: [],
    nutritionLogs: [],
    calorieTargets: {},
    lastNoteAt: {},
    lastInterventionAt: {},
    assignmentStart: {},
    assignmentWeeks: {},
    assignmentName: {},
    scheduledDays: {},
    ...partial,
  };
}

function marcLogs(): NutritionLogSnapshot[] {
  return days('marc-id', '2026-08-11', 13, 3130);
}

function marcWeights(): WeightMeasurement[] {
  return [
    weight('marc-id', '2026-08-08', 94.9),
    weight('marc-id', '2026-08-15', 95.2),
    weight('marc-id', '2026-08-22', 95.4),
    weight('marc-id', '2026-08-28', 95.4),
  ];
}

test('stall deep-link opens that client Progression, not overview', () => {
  const href = nutritionStallFocusHref('marc-id');
  assert.equal(href, '/clients/marc-id?tab=progress');
  assert.equal(isProgressHref(href), true);
  assert.equal(isProgressHref('/clients/marc-id'), false);
  assert.equal(isProgressHref('/clients/marc-id?tab=checkins'), false);
});

test('Marc cut + calories trop élevées is a nutrition stall; Sofia ghost is not', () => {
  const marc = detectCutCalorieStall({
    clientId: 'marc-id',
    goal: 'lose',
    calorieTarget: 2200,
    logs: marcLogs(),
    weights: marcWeights(),
    today: TODAY,
  });
  assert.ok(marc);
  assert.equal(canAskCalorieAdjustment(marc), false);
  assert.ok(marc.avgCalories > 2200 * 1.15);
  assert.ok(marc.weightDeltaKg >= -0.2);

  const sofia = detectCutCalorieStall({
    clientId: 'sofia-id',
    goal: 'gain',
    calorieTarget: 2300,
    logs: days('sofia-id', '2026-08-08', 9, 1710),
    weights: [
      weight('sofia-id', '2026-08-10', 56.9),
      weight('sofia-id', '2026-08-19', 57.1),
    ],
    today: TODAY,
  });
  assert.equal(sofia, null);
  assert.equal(canAskCalorieAdjustment(sofia), false);
});

test('no adherence data does not invent a cut', () => {
  const noLogs = detectCutCalorieStall({
    clientId: 'marc-id',
    goal: 'cut',
    calorieTarget: 2200,
    logs: [],
    weights: marcWeights(),
    today: TODAY,
  });
  assert.equal(noLogs, null);

  const onTarget = detectCutCalorieStall({
    clientId: 'camille-id',
    goal: 'lose',
    calorieTarget: 1850,
    logs: days('camille-id', '2026-08-19', 10, 1790),
    weights: [
      weight('camille-id', '2026-08-10', 70.1),
      weight('camille-id', '2026-08-28', 68.2),
    ],
    today: TODAY,
  });
  assert.equal(onTarget, null);
});

test('bulk/gain never gets a cut-stall card even with a calorie draft sitting around', () => {
  const stall = detectCutCalorieStall({
    clientId: 'hugo-id',
    goal: 'gain',
    calorieTarget: 3200,
    logs: days('hugo-id', '2026-08-08', 9, 3600),
    weights: [
      weight('hugo-id', '2026-08-10', 82.0),
      weight('hugo-id', '2026-08-28', 82.2),
    ],
    today: TODAY,
  });
  assert.equal(stall, null);
  assert.equal(shouldShowCutStallCard('gain', stall), false);
  assert.equal(shouldShowCutStallCard('bulk', stall), false);
  const fakeCutStall = {
    clientId: 'marc-id',
    goal: 'cut' as const,
    calorieTarget: 2200,
    avgCalories: 2800,
    loggedDays: 9,
    lastLogDate: '2026-08-28',
    weightDeltaKg: 0.4,
    newestKg: 95.4,
    oldestKg: 95,
    overeatRatio: 1.27,
  };
  assert.equal(shouldShowCutStallCard('cut', fakeCutStall), true);
  assert.equal(shouldShowCutStallCard('gain', fakeCutStall), false);
});

test('Aujourd’hui stall row and File du jour item deep-link to Progression', () => {
  const marc = client('marc-id', 'Marc Bouchard', 'lose', 2200);
  const sofia = client('sofia-id', 'Sofia Nguyen', 'gain', 2300);
  const signals = emptySignals({
    nutritionLogs: [...marcLogs(), ...days('sofia-id', '2026-08-08', 9, 1710)],
    calorieTargets: { 'marc-id': 2200, 'sofia-id': 2300 },
    weights: [
      ...marcWeights(),
      weight('sofia-id', '2026-08-10', 56.9),
      weight('sofia-id', '2026-08-19', 57.1),
    ],
  });
  const priorities = buildCoachPriorities([ops(marc), ops(sofia)], signals);
  const stall = priorities.find(p => p.kind === 'nutrition_stall');
  assert.ok(stall);
  assert.equal(stall?.clientId, 'marc-id');
  assert.equal(stall?.href, '/clients/marc-id?tab=progress');
  assert.equal(priorities.some(p => p.clientId === 'sofia-id' && p.kind === 'nutrition_stall'), false);

  const groups = groupQueueByClient(priorities.filter(p => p.kind === 'nutrition_stall' || p.kind === 'weight_off_trajectory'));
  assert.equal(groups[0]?.items[0]?.href, '/clients/marc-id?tab=progress');
  const action = resolveQueueAction(stall!, []);
  assert.equal(action.href, '/clients/marc-id?tab=progress');
  assert.equal(action.kind, 'open_360');
  const actionWithDraft = resolveQueueAction(stall!, [{
    id: 'draft-marc',
    coach_id: 'coach',
    client_id: 'marc-id',
    kind: 'calorie_adjustment',
    title: 'Calories trop élevées — stall cut',
    rationale: '',
    payload: { calories: 2000, protein: 0, carbs: 0, fat: 0 },
    status: 'pending',
    source: 'second',
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    resolved_at: null,
  }]);
  assert.equal(actionWithDraft.href, '/clients/marc-id?tab=progress');
  assert.equal(actionWithDraft.kind, 'open_360');

  const actionRelance = resolveQueueAction(stall!, [{
    id: 'draft-marc',
    coach_id: 'coach',
    client_id: 'marc-id',
    kind: 'adherence_nutrition',
    title: 'Il n’applique pas les 2200',
    rationale: '',
    payload: { body: 'Salut Marc, tes logs sont au-dessus des 2200.', notes: 'Salut Marc, tes logs sont au-dessus des 2200.' },
    status: 'pending',
    source: 'fleet',
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    resolved_at: null,
  }]);
  assert.equal(actionRelance.kind, 'open_draft');
  assert.equal(actionRelance.href, '/clients/marc-id/draft/draft-marc');

  const draft: CoachIntervention = {
    id: 'draft-marc',
    coach_id: 'coach',
    client_id: 'marc-id',
    kind: 'adherence_nutrition',
    title: 'Il n’applique pas les 2200',
    rationale: 'Poids en hausse, logs trop hauts vs cible.',
    payload: { body: 'Salut Marc' },
    status: 'pending',
    source: 'fleet',
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    resolved_at: null,
  };
  const rows = nutritionStallReviewRows([ops(marc), ops(sofia)], signals, priorities, [draft], TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.clientId, 'marc-id');
  assert.equal(rows[0]?.href, '/clients/marc-id?tab=progress');
  assert.equal(rows[0]?.relanceHref, '/messages/marc-id?nudge=general_followup');
  assert.equal(rows[0]?.draftHref, '/clients/marc-id/draft/draft-marc');
  assert.equal(rows[0]?.title, 'Il n’applique pas les 2200');

  const hugoDraft: CoachIntervention = {
    ...draft,
    id: 'draft-hugo',
    client_id: 'hugo-id',
    kind: 'calorie_adjustment',
    title: 'CUT STALL leftover',
  };
  const hugo = client('hugo-id', 'Hugo Pelletier', 'gain', 3200);
  const withHugo = nutritionStallReviewRows(
    [ops(marc), ops(sofia), ops(hugo)],
    signals,
    priorities,
    [draft, hugoDraft],
    TODAY,
  );
  assert.equal(withHugo.every(r => r.clientId !== 'hugo-id'), true);
});

test('File du jour weight item also deep-links to Progression, not overview', () => {
  const lea = client('lea-id', 'Léa Martin', 'gain', 2400);
  lea.goal = 'gain';
  const signals = emptySignals({
    calorieTargets: { 'lea-id': 2400 },
    weights: [
      weight('lea-id', '2026-08-10', 62.5),
      weight('lea-id', '2026-08-20', 61.2),
      weight('lea-id', '2026-08-28', 60.4),
    ],
  });
  const priorities = buildCoachPriorities([ops(lea)], signals);
  const weightItem = priorities.find(p => p.kind === 'weight_off_trajectory');
  assert.ok(weightItem);
  assert.equal(weightItem?.href, '/clients/lea-id?tab=progress');
  assert.equal(isProgressHref(weightItem?.href ?? ''), true);
});
