import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { FLEET_WINDOW_DAYS } from '../../coaching/domain/coachFleet';
import { MIN_NUTRITION_LOG_DAYS } from '../../coaching/domain/coachNutrition';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import type { AthleteDecisionLog, AthleteSignal } from '../types';
import {
  WEEKLY_REVIEW_WINDOW_DAYS,
  isoWeekStart,
  runAthleteWeeklyReview,
  weeklyReviewActionsToRpcPayload,
  weeklyReviewInputFromFleet,
  weeklyReviewInputFromSolo,
  type WeeklyReviewAggregates,
  type WeeklyReviewInput,
} from './weeklyReview';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function aggregates(partial: Partial<WeeklyReviewAggregates> = {}): WeeklyReviewAggregates {
  return {
    windowStart: '2026-08-21',
    windowEnd: '2026-09-03',
    loggedNutritionDays: 10,
    avgCalories: 2000,
    calorieTarget: 2000,
    workoutCount: 6,
    expectedWorkouts: 6,
    weighIns: 4,
    weightDeltaKg: -0.6,
    weightStartKg: 80,
    weightSpanDays: 13,
    checkinCount: 4,
    avgFatigue: 4,
    avgEnergy: 6,
    goal: 'cut',
    ...partial,
  };
}

function input(partial: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    athleteId: 'athlete-1',
    today: '2026-09-03',
    identity: 'solo',
    tracking: { nutrition: true, workouts: true, weight: true, checkins: true },
    aggregates: aggregates(),
    existingSignals: [],
    ...partial,
  };
}

function signal(partial: Partial<AthleteSignal> = {}): AthleteSignal {
  return {
    id: 'sig-1',
    athlete_id: 'athlete-1',
    domain: 'training',
    type: 'missed_sessions',
    hypothesis: 'Moins de séances',
    evidence_for: [],
    evidence_against: [],
    confidence: 'low',
    status: 'open',
    first_seen_at: '2026-08-25T00:00:00Z',
    last_seen_at: '2026-08-25T00:00:00Z',
    next_review_at: null,
    resolved_at: null,
    resolution_reason: null,
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
    ...partial,
  };
}

function decision(partial: Partial<AthleteDecisionLog> = {}): AthleteDecisionLog {
  return {
    id: 'dec-1',
    athlete_id: 'athlete-1',
    actor_id: 'athlete-1',
    actor_role: 'athlete',
    domain: 'training',
    type: 'missed_sessions',
    decision: 'refused',
    proposal: { type: 'missed_sessions' },
    why: 'Moins de séances loggées que prévu',
    data_used: { avg_calories: 2000, calorie_target: 2000, workout_count: 1 },
    human_reason: null,
    applied_effect: {},
    source: 'solo_weekly_reviews',
    source_id: null,
    created_at: '2026-08-27T00:00:00Z',
    ...partial,
  };
}

test('ISO week start is Monday; window matches fleet 14 days', () => {
  assert.equal(isoWeekStart('2026-09-03'), '2026-08-31');
  assert.equal(isoWeekStart('2026-08-31'), '2026-08-31');
  assert.equal(isoWeekStart('2026-09-06'), '2026-08-31');
  assert.equal(WEEKLY_REVIEW_WINDOW_DAYS, FLEET_WINDOW_DAYS);
  assert.equal(MIN_NUTRITION_LOG_DAYS, 4);
});

test('on-track week waits — a week without modification is valid', () => {
  const solo = runAthleteWeeklyReview(input());
  assert.equal(solo.decision, 'wait');
  assert.equal(solo.authority, 'athlete');
  assert.equal(solo.dataQuality, 'adequate');
  assert.equal(solo.weekStart, '2026-08-31');
  assert.equal(solo.signalActions.length, 0);
  assert.match(solo.summary, /aucune modification/);

  const coach = runAthleteWeeklyReview(input({ identity: 'coached' }));
  assert.equal(coach.authority, 'coach');
  assert.equal(coach.decision, 'wait');
  assert.match(coach.summary, /Aucun changement à proposer/);
});

test('disabled nutrition module does not feed a nutrition judgment', () => {
  const review = runAthleteWeeklyReview(input({
    tracking: { nutrition: false, workouts: true, weight: true, checkins: true },
    aggregates: aggregates({ loggedNutritionDays: 10, avgCalories: 2800, calorieTarget: 2000 }),
  }));
  assert.equal(review.signalActions.some((row) => row.domain === 'nutrition' || row.type === 'sparse_nutrition'), false);
  assert.equal(review.decision, 'wait');
});

test('sparse nutrition asks for info instead of blaming adherence', () => {
  const review = runAthleteWeeklyReview(input({
    aggregates: aggregates({ loggedNutritionDays: 2, avgCalories: 1800 }),
  }));
  assert.equal(review.decision, 'request_info');
  assert.equal(review.dataQuality, 'sparse');
  const sparse = review.signalActions.find((row) => row.type === 'sparse_nutrition');
  assert.ok(sparse);
  assert.equal(sparse?.domain, 'adherence');
  assert.equal(sparse?.status, 'waiting');
  assert.equal(sparse?.confidence, 'low');
});

test('weak new signal waits; confidence rises across weeks then proposes; recovery closes', () => {
  const missedAgg = aggregates({ workoutCount: 1, expectedWorkouts: 6, loggedNutritionDays: 10 });
  const week1 = runAthleteWeeklyReview(input({ aggregates: missedAgg }));
  const missed1 = week1.signalActions.find((row) => row.type === 'missed_sessions');
  assert.ok(missed1);
  assert.equal(missed1?.confidence, 'low');
  assert.equal(week1.decision, 'wait');

  const week2 = runAthleteWeeklyReview(input({
    aggregates: missedAgg,
    existingSignals: [signal({ confidence: 'low' })],
  }));
  assert.equal(week2.signalActions.find((row) => row.type === 'missed_sessions')?.confidence, 'medium');
  assert.equal(week2.decision, 'propose');
  assert.match(week2.summary, /Rien n’a été appliqué|prête à examiner/);

  const week3 = runAthleteWeeklyReview(input({
    aggregates: missedAgg,
    existingSignals: [signal({ confidence: 'medium' })],
  }));
  assert.equal(week3.signalActions.find((row) => row.type === 'missed_sessions')?.confidence, 'high');
  assert.equal(week3.decision, 'propose');

  const week4 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 6, expectedWorkouts: 6 }),
    existingSignals: [signal({ confidence: 'high' })],
  }));
  assert.equal(week4.decision, 'close');
  assert.equal(week4.signalActions[0]?.op, 'resolve');
  assert.equal(week4.signalActions[0]?.id, 'sig-1');
});

test('human refusal waits instead of re-proposing until evidence changes', () => {
  const missedAgg = aggregates({ workoutCount: 1, expectedWorkouts: 6, loggedNutritionDays: 10 });
  const refused = runAthleteWeeklyReview(input({
    aggregates: missedAgg,
    existingSignals: [signal({ confidence: 'medium' })],
    recentDecisions: [decision({ data_used: { avg_calories: 2000, calorie_target: 2000, workout_count: 1 } })],
  }));
  assert.equal(refused.decision, 'wait');
  assert.match(refused.summary, /refusée|n’ont pas changé|nouvel élément/);
  assert.equal(refused.signalActions.some((row) => row.op === 'upsert' && row.type === 'missed_sessions'), true);

  const moved = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 0, expectedWorkouts: 6, loggedNutritionDays: 10, avgCalories: 2000 }),
    existingSignals: [signal({ confidence: 'medium' })],
    recentDecisions: [decision({ data_used: { avg_calories: 2000, calorie_target: 2000, workout_count: 3 } })],
  }));
  assert.equal(moved.decision, 'propose');
});

test('guarded profile never proposes a calorie/weight change', () => {
  const review = runAthleteWeeklyReview(input({
    guarded: true,
    aggregates: aggregates({ weightDeltaKg: 0.5, loggedNutritionDays: 10 }),
    existingSignals: [signal({ domain: 'weight', type: 'stall', confidence: 'high' })],
  }));
  assert.notEqual(review.decision, 'propose');
});

test('Solo and Coach adapters share the engine; fleet identity is coached', () => {
  const fromSolo = weeklyReviewInputFromSolo(
    { today: '2026-09-03', goal: 'cut', calorieTarget: 2000, trainingFrequency: 3 },
    {
      windowStart: '2026-08-21',
      windowEnd: '2026-09-03',
      loggedDays: 10,
      avgCalories: 2000,
      targetAvg: 2000,
      weighIns: 4,
      weightStart: 80,
      deltaKg: -0.6,
      weightSpanDays: 13,
      workouts: 6,
      expectedWorkouts: 6,
      avgFatigue: 4,
      avgEnergy: 6,
    },
  );
  assert.equal(fromSolo.identity, 'solo');
  assert.equal(runAthleteWeeklyReview(fromSolo).authority, 'athlete');

  const fromFleet = weeklyReviewInputFromFleet({
    client_id: 'client-1',
    goal: 'cut',
    training_frequency: 3,
    calorie_target: 2000,
    logged_nutrition_days: 10,
    avg_calories: 2000,
    workout_count: 6,
    checkin_count: 4,
    weight_delta_kg: -0.6,
    weight_start_kg: 80,
    weight_kg: 79.4,
    avg_fatigue: 4,
    avg_energy: 6,
  }, '2026-09-03');
  assert.equal(fromFleet.identity, 'coached');
  assert.equal(runAthleteWeeklyReview(fromFleet).authority, 'coach');
});

test('rpc payload uses snake_case and never includes raw logs', () => {
  const review = runAthleteWeeklyReview(input({
    aggregates: aggregates({ loggedNutritionDays: 2 }),
  }));
  const payload = weeklyReviewActionsToRpcPayload(review.signalActions);
  assert.equal((payload[0] as { op: string }).op, 'upsert');
  assert.ok('evidence_for' in (payload[0] as object));
});

test('P2.2 source-lock: new table after audit, RPC writes, Solo+fleet share engine, no auto-apply', () => {
  const latest = latestMigrationContaining('CREATE TABLE public.athlete_weekly_reviews');
  assert.equal(latest.file, '20260918194013_athlete_weekly_reviews.sql');
  assert.match(latest.sql, /decision text NOT NULL CHECK \(decision IN \('wait', 'request_info', 'propose', 'close'\)\)/);
  assert.match(latest.sql, /authority text NOT NULL CHECK \(authority IN \('athlete', 'coach'\)\)/);
  assert.match(latest.sql, /UNIQUE \(athlete_id, week_start\)/);
  assert.match(latest.sql, /REVOKE ALL ON TABLE public\.athlete_weekly_reviews FROM PUBLIC, anon, authenticated/);
  assert.match(latest.sql, /GRANT SELECT ON TABLE public\.athlete_weekly_reviews TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_weekly_reviews TO authenticated/);
  assert.match(latest.sql, /CREATE OR REPLACE FUNCTION public\.save_athlete_weekly_review/);
  assert.match(latest.sql, /raw_logs_forbidden/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(latest.sql, /UPDATE public\.(programs|program_assignments|nutrition_logs|workouts|user_profiles)/);
  assert.doesNotMatch(latest.sql, /daily_calorie_target/);

  const historical = src('supabase/migrations/20260905002152_solo_weekly_reviews.sql');
  assert.match(historical, /UNIQUE \(user_id, week_start\)/);
  assert.doesNotMatch(historical, /request_info/);

  const api = src('src/features/signals/domain/weeklyReviewApi.ts');
  assert.match(api, /rpc\('save_athlete_weekly_review'/);
  assert.doesNotMatch(api, /from\('athlete_weekly_reviews'\)\.insert/);

  const solo = src('src/lib/soloCopilot.ts');
  assert.match(solo, /weeklyReviewInputFromSolo|runAthleteWeeklyReview/);
  const fleet = src('src/features/coaching/domain/coachFleet.ts');
  assert.match(fleet, /planAthleteWeeklyReview/);
  assert.match(fleet, /runAthleteWeeklyReview|weeklyReviewInputFromFleet/);

  const sqlTest = src('supabase/tests/athlete_weekly_reviews.sql');
  assert.match(sqlTest, /wait is not stored/);
  assert.match(sqlTest, /stranger reads weekly reviews/);
  assert.match(sqlTest, /former coach saves weekly review/);
  assert.match(sqlTest, /raw logs accepted/);
  assert.match(sqlTest, /direct weekly review writes allowed/);
  assert.match(sqlTest, /save mutates tracker data/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /athlete_weekly_reviews\.sql/);
  assert.match(ci, /weekly review: universal engine, wait is valid, no auto-apply/);

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.some((row) => row.version === '20260918194013' && row.name === 'athlete_weekly_reviews'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /"name": "athlete_weekly_reviews"/);
});
