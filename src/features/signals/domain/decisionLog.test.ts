import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import type { AthleteDecisionLog, WeeklyReviewAggregates } from '../types';
import {
  DECISION_EVIDENCE_KCAL_DELTA,
  DECISION_EVIDENCE_LOG_DAYS_DELTA,
  DECISION_EVIDENCE_WEIGHT_DELTA_KG,
  DECISION_EVIDENCE_WORKOUT_DELTA,
  canReadAthleteDecisionLog,
  canRecordAthleteDecision,
  compactEvidence,
  decisionEvidenceChanged,
  effectsAreMaterial,
  evidenceFromProposalPayload,
  isAthleteHumanDecision,
  isProposalSuppressed,
  latestAthleteDecision,
  mapInterventionDecision,
  mapInterventionKind,
  mapSoloProposalTarget,
  mapSoloReviewDecision,
  proposalMateriallyEdited,
} from './decisionLog';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function aggregates(partial: Partial<WeeklyReviewAggregates> = {}): WeeklyReviewAggregates {
  return {
    windowStart: '2026-08-21',
    windowEnd: '2026-09-03',
    loggedNutritionDays: 10,
    avgCalories: 2800,
    calorieTarget: 2000,
    workoutCount: 1,
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

function row(partial: Partial<AthleteDecisionLog> = {}): AthleteDecisionLog {
  return {
    id: 'dec-1',
    athlete_id: 'athlete-1',
    actor_id: 'athlete-1',
    actor_role: 'athlete',
    domain: 'nutrition',
    type: 'not_following',
    decision: 'refused',
    proposal: { action: 'calorie_adjustment' },
    why: 'Apports au-dessus de la cible',
    data_used: { avg_calories: 2800, calorie_target: 2000, workout_count: 1 },
    human_reason: 'plus tard',
    applied_effect: {},
    source: 'solo_weekly_reviews',
    source_id: null,
    created_at: '2026-08-27T00:00:00Z',
    ...partial,
  };
}

test('P2.3 maps human taps to accepted/modified/refused/ignored', () => {
  assert.equal(isAthleteHumanDecision('refused'), true);
  assert.equal(isAthleteHumanDecision('kept'), false);
  assert.equal(mapSoloReviewDecision('accepted'), 'accepted');
  assert.equal(mapSoloReviewDecision('kept'), 'ignored');
  assert.equal(mapSoloReviewDecision('dismissed'), 'refused');
  assert.equal(mapInterventionDecision('sent', false), 'accepted');
  assert.equal(mapInterventionDecision('sent', true), 'modified');
  assert.equal(mapInterventionDecision('kept', false), 'ignored');
  assert.equal(mapInterventionDecision('dismissed', false), 'refused');
  assert.deepEqual(mapSoloProposalTarget('calorie_adjustment', 'not_following'), {
    domain: 'nutrition',
    type: 'not_following',
  });
  assert.deepEqual(mapSoloProposalTarget('calorie_adjustment', 'cut_stall'), {
    domain: 'weight',
    type: 'stall',
  });
  assert.deepEqual(mapInterventionKind('adherence_training'), {
    domain: 'training',
    type: 'missed_sessions',
  });
  assert.deepEqual(mapInterventionKind('program_adjustment'), {
    domain: 'training',
    type: 'program_adjustment',
  });
  assert.deepEqual(mapInterventionKind('calorie_adjustment', 'stall_adherent'), {
    domain: 'weight',
    type: 'stall',
  });
  assert.equal(mapInterventionDecision('kept', false, true), 'accepted');
  assert.equal(mapInterventionDecision('sent', false), 'accepted');
  assert.equal(proposalMateriallyEdited({ calories: 2000 }, { calories: 2000 }), false);
  assert.equal(proposalMateriallyEdited({ calories: 2000 }, { calories: 1800 }), true);
  assert.equal(effectsAreMaterial({ note: { body: 'ok' } }), true);
  assert.equal(effectsAreMaterial({}), false);
  assert.equal(canRecordAthleteDecision({ actorId: 'a', athleteId: 'a', isCoachOfAthlete: false }), true);
  assert.equal(canRecordAthleteDecision({ actorId: 'coach', athleteId: 'a', isCoachOfAthlete: true }), true);
  assert.equal(canReadAthleteDecisionLog({ actorId: 'other', athleteId: 'a', isCoachOfAthlete: false }), false);
});

test('refusal suppresses the same proposal until evidence moves', () => {
  const agg = aggregates();
  const refused = [row()];
  assert.equal(isProposalSuppressed(refused, 'nutrition', 'not_following', agg), true);
  assert.equal(isProposalSuppressed([row({ decision: 'ignored' })], 'nutrition', 'not_following', agg), true);
  assert.equal(isProposalSuppressed([row({ decision: 'accepted' })], 'nutrition', 'not_following', agg), false);
  assert.equal(isProposalSuppressed(refused, 'training', 'missed_sessions', agg), false);

  const moved = aggregates({ avgCalories: 2500 });
  assert.equal(decisionEvidenceChanged(row().data_used, moved), true);
  assert.equal(isProposalSuppressed(refused, 'nutrition', 'not_following', moved), false);

  const laterAccept = [
    row({ created_at: '2026-08-20T00:00:00Z', decision: 'refused' }),
    row({ id: 'dec-2', created_at: '2026-08-28T00:00:00Z', decision: 'accepted' }),
  ];
  assert.equal(latestAthleteDecision(laterAccept, 'nutrition', 'not_following')?.decision, 'accepted');
  assert.equal(isProposalSuppressed(laterAccept, 'nutrition', 'not_following', agg), false);

  const trainingRefusal = [row({
    domain: 'training',
    type: 'missed_sessions',
    data_used: { avg_calories: 2800, calorie_target: 2000, workout_count: 1 },
  })];
  const nutritionMoved = aggregates({ avgCalories: 2500, workoutCount: 1 });
  assert.equal(decisionEvidenceChanged(trainingRefusal[0].data_used, nutritionMoved, 'training', 'missed_sessions'), false);
  assert.equal(isProposalSuppressed(trainingRefusal, 'training', 'missed_sessions', nutritionMoved), true);
  assert.equal(isProposalSuppressed(trainingRefusal, 'training', 'missed_sessions', aggregates({ workoutCount: 4 })), false);
});

test('evidence thresholds match the fleet snapshot', () => {
  const fleet = src('src/features/coaching/domain/coachFleet.ts');
  assert.match(fleet, new RegExp(`>= ${DECISION_EVIDENCE_KCAL_DELTA}`));
  assert.match(fleet, new RegExp(`>= ${DECISION_EVIDENCE_WORKOUT_DELTA}`));
  assert.match(fleet, new RegExp(`>= ${DECISION_EVIDENCE_LOG_DAYS_DELTA}`));
  assert.match(fleet, new RegExp(`>= ${DECISION_EVIDENCE_WEIGHT_DELTA_KG}`));
});

test('nested payload evidence and numeric strings feed suppression', () => {
  const nested = evidenceFromProposalPayload({
    evidence: {
      avg_calories: '2800',
      target_avg_kcal: '2000',
      workout_count: '1',
      logged_nutrition_days: '10',
      weight_delta_kg: '-0.6',
    },
  });
  assert.deepEqual(compactEvidence({ a: 1, b: null, c: undefined }), { a: 1 });
  assert.equal(nested.avg_calories, '2800');
  assert.equal(decisionEvidenceChanged(nested, aggregates()), false);
  assert.equal(decisionEvidenceChanged(nested, aggregates({ avgCalories: 2500 })), true);
});

test('P2.3 source-lock: new table after audit, RPC writes, no auto-apply', () => {
  const latest = latestMigrationContaining('CREATE TABLE public.athlete_decision_log');
  assert.equal(latest.file, '20260918201237_athlete_decision_log.sql');
  assert.match(latest.sql, /decision text NOT NULL CHECK \(decision IN \('accepted', 'modified', 'refused', 'ignored'\)\)/);
  assert.match(latest.sql, /actor_role text NOT NULL CHECK \(actor_role IN \('athlete', 'coach'\)\)/);
  assert.match(latest.sql, /REVOKE ALL ON TABLE public\.athlete_decision_log FROM PUBLIC, anon, authenticated/);
  assert.match(latest.sql, /GRANT SELECT ON TABLE public\.athlete_decision_log TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_decision_log TO authenticated/);
  assert.match(latest.sql, /CREATE OR REPLACE FUNCTION public\.record_athlete_decision/);
  assert.doesNotMatch(latest.sql, /CREATE OR REPLACE FUNCTION public\.update_athlete_decision/);
  assert.match(latest.sql, /raw_logs_forbidden/);
  assert.match(latest.sql, /applied_effect_forbidden/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(latest.sql, /ALTER TABLE public\.solo_weekly_reviews/);
  assert.doesNotMatch(latest.sql, /ALTER TABLE public\.coach_interventions/);
  assert.doesNotMatch(latest.sql, /UPDATE public\.(programs|program_assignments|nutrition_logs|workouts|user_profiles)/);
  assert.doesNotMatch(latest.sql, /daily_calorie_target/);

  const historicalSolo = src('supabase/migrations/20260905002152_solo_weekly_reviews.sql');
  assert.match(historicalSolo, /CHECK \(decision IN \('accepted', 'kept', 'dismissed'\)\)/);
  assert.doesNotMatch(historicalSolo, /applied_effect/);

  const historicalInbox = src('supabase/migrations/20260825132955_coach_interventions.sql');
  assert.match(historicalInbox, /status IN \('pending', 'sent', 'dismissed', 'kept'\)/);
  assert.doesNotMatch(historicalInbox, /human_reason/);

  const api = src('src/features/signals/domain/decisionLogApi.ts');
  assert.match(api, /rpc\('record_athlete_decision'/);
  assert.match(api, /recordAthleteDecisionDurable/);
  assert.match(api, /listLatestAthleteDecisionsBestEffort/);
  assert.doesNotMatch(api, /from\('athlete_decision_log'\)\.insert/);
  assert.match(api, /enqueue_athlete_decision_outbox/);

  const sqlTest = src('supabase/tests/athlete_decision_log.sql');
  assert.match(sqlTest, /refused is not stored/);
  assert.match(sqlTest, /stranger reads decision log/);
  assert.match(sqlTest, /former coach records decision/);
  assert.match(sqlTest, /raw logs accepted/);
  assert.match(sqlTest, /direct decision log writes allowed/);
  assert.match(sqlTest, /record mutates tracker data/);
  assert.match(sqlTest, /decision log overwritten/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /athlete_decision_log\.sql/);
  assert.match(ci, /decision log: human refusal shapes the next review, no auto-apply/);

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.some((row) => row.version === '20260918201237' && row.name === 'athlete_decision_log'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /"name": "athlete_decision_log"/);

  const soloStore = src('src/stores/soloCopilotStore.ts');
  assert.match(soloStore, /commit_solo_weekly_review_decision|recordAthleteDecisionDurable/);
  assert.match(soloStore, /mapSoloReviewDecision/);
  const slice = src('src/features/coaching/model/interventionsSlice.ts');
  assert.match(slice, /journalInterventionDecision/);
  assert.match(slice, /recordAthleteDecisionDurable/);
  assert.match(slice, /proposalMateriallyEdited/);
  assert.match(slice, /fetchIntervention/);
  assert.doesNotMatch(slice, /edited: !!payload/);

  const soloEngine = src('src/lib/soloCopilot.ts');
  assert.match(soloEngine, /isProposalSuppressed/);
  assert.match(soloEngine, /recentDecisions/);
  const card = src('src/components/dashboard/SoloWeeklyReview.tsx');
  assert.match(card, /listAthleteDecisionLogBestEffort|listLatestAthleteDecisionsBestEffort/);
  assert.match(card, /recentDecisions: decisions/);
  assert.match(src('src/i18n/locales/fr/coaching.ts'), /refusedWait:/);
  assert.match(src('src/i18n/locales/en/coaching.ts'), /refusedWait:/);

  const shared = src('supabase/functions/_shared/proposalMemory.ts');
  assert.match(shared, /export function mapInterventionKind/);
  assert.match(shared, /export function decisionEvidenceChanged/);
  const fleet = src('src/features/coaching/domain/coachFleet.ts');
  assert.match(fleet, /isProposalSuppressed/);
  assert.match(fleet, /recentDecisions: AthleteDecisionLog\[\] = \[\]/);
  const edge = src('supabase/functions/coach-fleet-round/index.ts');
  assert.match(edge, /proposalMemory/);
  assert.match(edge, /list_latest_athlete_decisions_for_athletes/);
  assert.match(edge, /isProposalSuppressed/);
  assert.doesNotMatch(edge, /function journalEvidenceChanged/);
  assert.doesNotMatch(edge, /function mapInterventionKind/);
});
