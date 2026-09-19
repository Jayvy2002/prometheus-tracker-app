import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import {
  WATCH_PROPOSAL_DECISIONS,
  WATCH_PROPOSAL_KIND,
  WATCH_PROPOSAL_SOURCE,
  isWatchProposalDecision,
  isWatchProposalWeekStart,
  watchProposalIdempotencyKey,
  watchProposalReasonRequired,
} from './watchProposal';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('watch proposal decisions stay a closed Vision 8.6 set', () => {
  assert.deepEqual([...WATCH_PROPOSAL_DECISIONS], ['accepted', 'modified', 'refused']);
  assert.equal(WATCH_PROPOSAL_KIND, 'watch_proposal_decision');
  assert.equal(WATCH_PROPOSAL_SOURCE, 'prometheus_watch');
  assert.equal(isWatchProposalDecision('accepted'), true);
  assert.equal(isWatchProposalDecision('modified'), true);
  assert.equal(isWatchProposalDecision('refused'), true);
  assert.equal(isWatchProposalDecision('ignored'), false);
  assert.equal(isWatchProposalDecision('corrected'), false);
  assert.equal(watchProposalReasonRequired('accepted'), false);
  assert.equal(watchProposalReasonRequired('modified'), true);
  assert.equal(watchProposalReasonRequired('refused'), true);
  assert.equal(
    watchProposalIdempotencyKey('sig-1', 'refused', '2026-08-31'),
    'watch-decide:sig-1:refused:2026-08-31',
  );
  assert.equal(isWatchProposalWeekStart('2026-08-31'), true);
  assert.equal(isWatchProposalWeekStart('2026-8-31'), false);
  assert.equal(isWatchProposalWeekStart(''), false);
});

test('P2.5 reuses the journal primitive, not a third apply engine, with Solo/Coach authority', () => {
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.decide_athlete_watch_proposal');
  assert.equal(latest.file, '20260919141146_watch_proposal_decision.sql');
  assert.match(latest.sql, /actor_is_actively_coached/);
  assert.match(latest.sql, /is_coach_of/);
  assert.match(latest.sql, /queue_and_record_athlete_decision/);
  assert.match(latest.sql, /watch_proposal_decision/);
  assert.match(latest.sql, /no_current_proposal/);
  assert.match(latest.sql, /already_decided/);
  assert.match(latest.sql, /prometheus_watch_signal_data_used/);
  assert.match(latest.sql, /watch-decide:' \|\| v_signal\.id/);
  assert.match(latest.sql, /v_review\.week_start::text/);
  assert.match(latest.sql, /FOR UPDATE/);
  assert.doesNotMatch(latest.sql, /CREATE TABLE/);
  assert.doesNotMatch(latest.sql, /resolve_athlete_signal/);
  assert.doesNotMatch(latest.sql, /commit_solo_weekly_review_decision/);
  assert.doesNotMatch(latest.sql, /apply_intervention/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(latest.sql, /UPDATE public\.(programs|program_assignments|nutrition_logs|workouts|user_profiles|weight_logs)/);
  assert.doesNotMatch(latest.sql, /daily_calorie_target/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_signals TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_decision_log TO authenticated/);

  const api = src('src/features/signals/domain/watchProposalApi.ts');
  assert.match(api, /rpc\('decide_athlete_watch_proposal'/);
  assert.doesNotMatch(api, /from\('athlete_signals'\)\.(insert|update)/);
  assert.doesNotMatch(api, /BestEffort/);
  assert.doesNotMatch(api, /commit_solo_weekly_review_decision/);
  assert.doesNotMatch(api, /apply_intervention/);
  assert.match(api, /ok: false/);
  assert.match(api, /isWatchProposalWeekStart/);
  assert.match(api, /weekStart/);

  const panel = src('src/components/dashboard/PrometheusWatchPanel.tsx');
  assert.match(panel, /canDecideAthleteWatchProposal\(/);
  assert.match(panel, /decideAthleteWatchProposal/);
  assert.match(panel, /item\.currentProposalKey/);
  assert.match(panel, /item\.reviewWeekStart/);
  assert.match(panel, /prometheusWatch\.decide/);
  assert.doesNotMatch(panel, /commit_solo_weekly_review_decision/);
  assert.doesNotMatch(panel, /apply_intervention/);
  assert.doesNotMatch(panel, /upsert_athlete_signal|resolve_athlete_signal|record_athlete_decision/);
  assert.doesNotMatch(panel, /useSoloCopilotStore/);

  const engine = src('supabase/functions/_shared/weeklyReviewEngine.ts');
  assert.match(engine, /isWatchProposalSettled/);
  const fleet = src('src/features/coaching/domain/coachFleet.ts');
  assert.match(fleet, /isWatchProposalSettled/);
  const edge = src('supabase/functions/coach-fleet-round/index.ts');
  assert.match(edge, /isWatchProposalSettled/);

  const sqlTest = src('supabase/tests/athlete_watch_proposal.sql');
  assert.match(sqlTest, /custom B inherited proposal A/);
  assert.match(sqlTest, /coached self-decide allowed/);
  assert.match(sqlTest, /coached coach self-decide allowed/);
  assert.match(sqlTest, /stranger decide allowed/);
  assert.match(sqlTest, /solo accept not idempotent/);
  assert.match(sqlTest, /solo accept closed the signal/);
  assert.match(sqlTest, /decide_athlete_watch_proposal mutates tracker data/);
  assert.match(sqlTest, /third apply engine/);
  assert.match(sqlTest, /unrelated coach decide allowed/);
  assert.match(sqlTest, /week 2 reused week 1 idempotency key/);
  assert.match(sqlTest, /wait review inherited current proposal/);
  assert.match(sqlTest, /low confidence inherited current proposal/);
  assert.match(sqlTest, /empty modified reason allowed/);
  assert.match(sqlTest, /transitive coach decide allowed/);
  assert.match(sqlTest, /closed signal decide allowed/);
  assert.match(sqlTest, /decide idempotency key is not week-scoped/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /athlete_watch_proposal\.sql/);
  assert.match(
    ci,
    /athlete watch proposal: solo and coach can decide, coached cannot, refuse keeps signal open, custom B does not inherit A/,
  );

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.length, 2);
  assert.equal(pending.pending[0]?.version, '20260919134856');
  assert.equal(pending.pending[1]?.version, '20260919141146');
  assert.equal(pending.pending[1]?.name, 'watch_proposal_decision');
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /watch_proposal_decision/);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /watch_context_correction/);

  const edges = src('supabase/functions.manifest.json');
  assert.doesNotMatch(edges, /watch.proposal|decide_athlete_watch/);
  const manifest = JSON.parse(edges) as { expected: unknown[] };
  assert.equal(manifest.expected.length, 13);
});
