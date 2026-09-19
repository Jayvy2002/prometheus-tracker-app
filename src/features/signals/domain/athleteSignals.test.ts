import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  canMutateAthleteSignal,
  canReadAthleteSignal,
  isAthleteSignalConfidence,
  isAthleteSignalDomain,
  isClosedAthleteSignalStatus,
  isOpenAthleteSignalStatus,
  ATHLETE_SIGNAL_CONFIDENCE,
  ATHLETE_SIGNAL_DOMAINS,
} from './athleteSignals';
import { latestMigrationContaining } from '../../../lib/migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('P2.1 domains and qualitative confidence match Vision; workspace never grants access', () => {
  assert.deepEqual([...ATHLETE_SIGNAL_DOMAINS], [
    'training', 'nutrition', 'recovery', 'weight', 'goal', 'adherence',
  ]);
  assert.deepEqual([...ATHLETE_SIGNAL_CONFIDENCE], ['low', 'medium', 'high']);
  assert.equal(isAthleteSignalDomain('training'), true);
  assert.equal(isAthleteSignalDomain('sleep'), false);
  assert.equal(isAthleteSignalConfidence('medium'), true);
  assert.equal(isAthleteSignalConfidence('0.87'), false);
  assert.equal(isOpenAthleteSignalStatus('waiting'), true);
  assert.equal(isClosedAthleteSignalStatus('not_relevant'), true);

  assert.equal(canMutateAthleteSignal({ actorId: 'a', athleteId: 'a', isCoachOfAthlete: false }), true);
  assert.equal(canMutateAthleteSignal({ actorId: 'coach', athleteId: 'a', isCoachOfAthlete: true }), true);
  assert.equal(canMutateAthleteSignal({ actorId: 'other', athleteId: 'a', isCoachOfAthlete: false }), false);
  assert.equal(canReadAthleteSignal({ actorId: null, athleteId: 'a', isCoachOfAthlete: true }), false);
});

test('signals are a new table after auditing interventions; writes go through RPCs without applying programs', () => {
  const latest = latestMigrationContaining('CREATE TABLE public.athlete_signals');
  assert.equal(latest.file, '20260918185709_athlete_signals.sql');
  assert.match(latest.sql, /evidence_for jsonb/);
  assert.match(latest.sql, /evidence_against jsonb/);
  assert.match(latest.sql, /confidence text NOT NULL DEFAULT 'low'/);
  assert.match(latest.sql, /status IN \(\s*'open', 'waiting', 'resolved', 'not_relevant'/);
  assert.match(latest.sql, /athlete_signals_one_open/);
  assert.match(latest.sql, /REVOKE ALL ON TABLE public\.athlete_signals FROM PUBLIC, anon, authenticated/);
  assert.match(latest.sql, /GRANT SELECT ON TABLE public\.athlete_signals TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_signals TO authenticated/);
  assert.match(latest.sql, /CREATE OR REPLACE FUNCTION public\.upsert_athlete_signal/);
  assert.match(latest.sql, /CREATE OR REPLACE FUNCTION public\.resolve_athlete_signal/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(latest.sql, /UPDATE public\.(programs|program_assignments|nutrition_logs|workouts|user_profiles)/);
  assert.doesNotMatch(latest.sql, /daily_calorie_target/);

  const interventions = src('supabase/migrations/20260825132955_coach_interventions.sql');
  assert.match(interventions, /status IN \('pending', 'sent', 'dismissed', 'kept'\)/);
  assert.doesNotMatch(interventions, /evidence_against/);

  const weekly = src('supabase/migrations/20260905002152_solo_weekly_reviews.sql');
  assert.match(weekly, /UNIQUE \(user_id, week_start\)/);
  assert.doesNotMatch(weekly, /next_review_at/);

  const api = src('src/features/signals/domain/athleteSignalsApi.ts');
  assert.match(api, /rpc\('upsert_athlete_signal'/);
  assert.match(api, /rpc\('resolve_athlete_signal'/);
  assert.doesNotMatch(api, /from\('athlete_signals'\)\.insert/);

  const sqlTest = src('supabase/tests/athlete_signals.sql');
  assert.match(sqlTest, /open signal duplicated/);
  assert.match(sqlTest, /stranger reads signals/);
  assert.match(sqlTest, /former coach reads signals/);
  assert.match(sqlTest, /numeric confidence accepted/);
  assert.match(sqlTest, /closed history overwritten/);
  assert.match(sqlTest, /direct signal writes allowed/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /athlete_signals\.sql/);
  assert.match(ci, /athlete signals: persistence, isolation, no auto-apply/);

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.some((row) => row.version === '20260918185709'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"name": "athlete_signals"/);
});
