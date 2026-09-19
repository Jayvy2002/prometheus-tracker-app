import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runAthleteWeeklyReview, type WeeklyReviewInput } from './weeklyReview';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('orchestration persists wait weeks through the shared engine', () => {
  const input: WeeklyReviewInput = {
    athleteId: 'athlete-1',
    today: '2026-09-03',
    identity: 'solo',
    tracking: { nutrition: true, workouts: true, weight: true, checkins: true },
    aggregates: {
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
    },
    existingSignals: [],
  };
  const review = runAthleteWeeklyReview(input);
  assert.equal(review.decision, 'wait');
  assert.match(src('src/features/signals/domain/weeklyReviewCycle.ts'), /export async function persistAthleteWeeklyReviewCycle/);
});

test('P2.2 orchestration is wired on Solo and Coach fleet; integrity candidate is pending', () => {
  assert.match(src('src/components/dashboard/SoloWeeklyReview.tsx'), /persistAthleteWeeklyReviewCycle/);
  assert.match(src('src/components/dashboard/SoloWeeklyReview.tsx'), /persistVersion/);
  assert.match(src('src/components/dashboard/SoloWeeklyReview.tsx'), /persistFailed/);
  assert.match(src('src/features/signals/domain/weeklyReviewCycle.ts'), /saveAthleteWeeklyReview/);
  assert.match(src('src/features/signals/domain/weeklyReviewCycle.ts'), /drainAthleteDecisionOutboxBestEffort/);
  assert.match(src('supabase/functions/coach-fleet-round/index.ts'), /persistWeeklyReview/);
  assert.match(src('supabase/functions/coach-fleet-round/index.ts'), /triage_eligible_solo_weekly/);
  assert.match(src('supabase/functions/coach-fleet-round/index.ts'), /drain_athlete_decision_outbox/);
  assert.match(src('supabase/functions/coach-fleet-round/index.ts'), /runAthleteWeeklyReview/);
  assert.match(src('supabase/functions/_shared/weeklyReviewEngine.ts'), /nextSignalConfidence/);
  assert.match(src('supabase/functions/_shared/weeklyReviewEngine.ts'), /normalizeFingerprint/);
  assert.match(src('supabase/functions/_shared/proposalMemory.ts'), /evidenceScope/);

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.some((row) => row.version === '20260918224935'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"name": "athlete_review_integrity"/);
  assert.match(src('.github/workflows/ci.yml'), /athlete_review_integrity\.sql/);
  assert.match(src('supabase/tests/athlete_review_integrity.sql'), /signal_athlete_mismatch/);
  assert.match(src('supabase/tests/athlete_review_integrity.sql'), /atomic upsert missing/);
  assert.match(src('supabase/migrations/20260918224935_athlete_review_integrity.sql'), /ON CONFLICT \(athlete_id, domain, type\) WHERE status IN \('open', 'waiting'\)/);
  assert.match(src('supabase/migrations/20260918224935_athlete_review_integrity.sql'), /signal_athlete_mismatch/);
  assert.match(src('supabase/migrations/20260918224935_athlete_review_integrity.sql'), /list_latest_athlete_decisions/);
  assert.match(src('supabase/migrations/20260918224935_athlete_review_integrity.sql'), /commit_solo_weekly_review_decision/);
  assert.doesNotMatch(src('supabase/migrations/20260918224935_athlete_review_integrity.sql'), /stripe/i);

  assert.equal(pending.pending.some((row) => row.version === '20260918232507'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"name": "athlete_decision_durability"/);
  assert.match(src('.github/workflows/ci.yml'), /athlete_decision_durability\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /immutable intent, solo journal-fail reprise/);
  assert.match(src('.github/workflows/ci.yml'), /test-decision-drain-concurrency\.sh/);
  assert.match(src('.github/workflows/ci.yml'), /skip occupied key, two sessions no deadlock/);
  assert.match(src('scripts/test-decision-drain-concurrency.sh'), /pg_advisory_xact_lock/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /outbox collision returned another dossier/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /drain did not recover journal/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /solo replay duplicated journal/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /coached athlete in solo weekly loop/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /athlete_decision_outbox_athlete_key/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /drain_athlete_decision_outbox/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /triage_eligible_solo_weekly/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /outbox_athlete_mismatch/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_write_athlete_decision/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /record_athlete_decision_replay/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /next_attempt_at/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_resolve_decision_evidence/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /BETWEEN v_from AND v_to/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_calendar_age_years/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_intake_has_medical_flags/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_decision_outbox_payload/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_outbox_intents_equal/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_record_stored_outbox/);
  assert.match(src('supabase/migrations/20260918232507_athlete_decision_durability.sql'), /prometheus_try_lock_decision_key/);
  assert.doesNotMatch(
    src('supabase/migrations/20260918232507_athlete_decision_durability.sql'),
    /p_source_id uuid DEFAULT NULL,\s*p_idempotency_key text,/,
  );
  assert.doesNotMatch(
    src('supabase/migrations/20260918232507_athlete_decision_durability.sql'),
    /p_applied_effect jsonb DEFAULT '\{\}'::jsonb,\s*p_idempotency_key text/,
  );
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /42P13/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /empty coach evidence still blocking/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /solo replay rewrote calorie targets/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /coach drain attributed the decision to the coach/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /poison outbox must not starve later rows/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /triage window included out-of-range sessions/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /questionnaire without PAR-Q flag counted medical/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /Poison fixtures run as postgres/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /injected_journal_failure/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /solo replay after journal failure rewrote calorie targets/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /immutable intent accepted different proposal/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /coach reprise replaced stored author/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /stored outbox helper exposed to clients/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /drain locks outbox before try-advisory/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /drain order is not a total order/);
  assert.match(src('scripts/test-decision-drain-concurrency.sh'), /drain waited on occupied key/);
  assert.match(src('scripts/test-decision-drain-concurrency.sh'), /concurrent drains deadlocked or stalled/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /solo replay with different data_used accepted/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /journal replay with different data_used accepted/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /journal replay with different source accepted/);
  assert.match(src('supabase/tests/athlete_decision_durability.sql'), /solo lock order is not advisory, outbox, journal/);
  {
    const mig = src('supabase/migrations/20260918232507_athlete_decision_durability.sql');
    const drainFn = mig.slice(
      mig.indexOf('CREATE OR REPLACE FUNCTION public.drain_athlete_decision_outbox'),
      mig.indexOf('CREATE OR REPLACE FUNCTION public.coach_intervention_queue_decision'),
    );
    const drainLock = drainFn.indexOf('prometheus_try_lock_decision_key');
    const drainRow = drainFn.indexOf('FOR UPDATE');
    assert.ok(drainLock > 0 && drainLock < drainRow, 'drain must try-advisory before FOR UPDATE');
    assert.match(drainFn, /ORDER BY next_attempt_at, created_at, id/);
    const enqueueFn = mig.slice(
      mig.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_athlete_decision_outbox'),
      mig.indexOf('CREATE OR REPLACE FUNCTION public.queue_and_record_athlete_decision'),
    );
    assert.ok(
      enqueueFn.indexOf('prometheus_lock_decision_key') < enqueueFn.indexOf('INSERT INTO public.athlete_decision_outbox'),
      'enqueue must take advisory before INSERT',
    );
  }
  assert.doesNotMatch(src('supabase/tests/athlete_decision_durability.sql'), /set local role authenticated[\s\S]{0,200}insert into public\.athlete_decision_outbox/i);
});
