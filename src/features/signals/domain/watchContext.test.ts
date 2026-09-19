import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import {
  WATCH_CONTEXT_CORRECTION_ACTIONS,
  WATCH_CONTEXT_CORRECTION_KIND,
  isWatchContextCorrectionAction,
  watchContextCorrectionIdempotencyKey,
} from './watchContext';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('watch context correction actions stay a closed set', () => {
  assert.deepEqual([...WATCH_CONTEXT_CORRECTION_ACTIONS], ['not_relevant', 'corrected']);
  assert.equal(WATCH_CONTEXT_CORRECTION_KIND, 'watch_context_correction');
  assert.equal(isWatchContextCorrectionAction('not_relevant'), true);
  assert.equal(isWatchContextCorrectionAction('corrected'), true);
  assert.equal(isWatchContextCorrectionAction('refused'), false);
  assert.equal(
    watchContextCorrectionIdempotencyKey('sig-1', 'not_relevant'),
    'watch-correct:sig-1:not_relevant',
  );
});

test('P2.4 context correction reuses journal + resolve, with Solo/Coach authority and no source rewrite', () => {
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.correct_athlete_watch_context');
  assert.equal(latest.file, '20260919134856_watch_context_correction.sql');
  assert.match(latest.sql, /decision IN \('accepted', 'modified', 'refused', 'ignored', 'corrected'\)/);
  assert.match(latest.sql, /actor_is_actively_coached/);
  assert.match(latest.sql, /is_coach_of/);
  assert.match(latest.sql, /resolve_athlete_signal/);
  assert.match(latest.sql, /queue_and_record_athlete_decision/);
  assert.match(latest.sql, /not_persisted/);
  assert.match(latest.sql, /idempotency_conflict/);
  assert.match(latest.sql, /not_relevant/);
  assert.match(latest.sql, /watch_context_correction/);
  assert.match(latest.sql, /prometheus_watch/);
  assert.match(latest.sql, /stale_context/);
  assert.match(latest.sql, /p_seen_updated_at/);
  assert.match(latest.sql, /p_seen_evidence/);
  assert.doesNotMatch(latest.sql, /CREATE TABLE/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(latest.sql, /UPDATE public\.(programs|program_assignments|nutrition_logs|workouts|user_profiles|weight_logs)/);
  assert.doesNotMatch(latest.sql, /daily_calorie_target/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_signals TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_decision_log TO authenticated/);

  const api = src('src/features/signals/domain/watchContextApi.ts');
  assert.match(api, /rpc\('correct_athlete_watch_context'/);
  assert.doesNotMatch(api, /from\('athlete_signals'\)\.(insert|update)/);
  assert.doesNotMatch(api, /BestEffort/);
  assert.match(api, /p_seen_updated_at/);
  assert.match(api, /p_seen_evidence/);
  assert.match(api, /stale_context/);

  const panel = src('src/components/dashboard/PrometheusWatchPanel.tsx');
  assert.match(panel, /canCorrectAthleteWatchContext\(/);
  assert.match(panel, /correctAthleteWatchContext/);
  assert.doesNotMatch(panel, /upsert_athlete_signal|resolve_athlete_signal|record_athlete_decision/);
  assert.match(panel, /prometheusWatch\.correct/);
  assert.match(panel, /seenUpdatedAt/);
  assert.match(panel, /seenEvidence/);

  const engine = src('supabase/functions/_shared/weeklyReviewEngine.ts');
  assert.match(engine, /isContextCorrectionHeld/);

  const sqlTest = src('supabase/tests/athlete_watch_context.sql');
  assert.match(sqlTest, /coached self-correct allowed/);
  assert.match(sqlTest, /coached coach self-correct allowed/);
  assert.match(sqlTest, /stranger correct allowed/);
  assert.match(sqlTest, /solo correction not idempotent/);
  assert.match(sqlTest, /correct_athlete_watch_context mutates tracker data/);
  assert.match(sqlTest, /different reason replay allowed/);
  assert.match(sqlTest, /journal failure closed the signal/);
  assert.match(sqlTest, /journal failure still persisted/);
  assert.match(sqlTest, /stale context still closed/);
  assert.match(sqlTest, /stale context closed the new interpretation/);
  assert.match(sqlTest, /correct_athlete_watch_context missing seen token/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /athlete_watch_context\.sql/);
  assert.match(ci, /athlete watch context: solo and coach can correct, coached cannot, no source rewrite/);

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.some((row) => row.version === '20260919134856'), true);
  assert.equal(pending.pending.some((row) => row.name === 'watch_context_correction'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /watch_context_correction/);

  const edges = src('supabase/functions.manifest.json');
  assert.doesNotMatch(edges, /watch.context|correct_athlete_watch/);
});
