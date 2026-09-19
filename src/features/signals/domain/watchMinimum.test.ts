/** P2.6 Vision 8.7 — apply the accepted watch calorie draft. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import {
  calorieDraftFromUnknown,
  isCompleteCalorieDraft,
  WEEKLY_SMALL_KCAL,
} from '../../../../supabase/functions/_shared/weeklyNutritionProposal.ts';
import {
  WATCH_MINIMUM_APPLY_KIND,
  calorieDraftFromDecisionProposal,
  isWatchMinimumApplyEligible,
  watchMinimumApplyIdempotencyKey,
} from './watchMinimum';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const completeDraft = { calories: 1900, protein: 145, carbs: 190, fat: 63 };

test('watch minimum apply is gated on a complete accepted calorie draft', () => {
  assert.equal(WATCH_MINIMUM_APPLY_KIND, 'watch_minimum_apply');
  assert.equal(WEEKLY_SMALL_KCAL, 100);
  assert.equal(isCompleteCalorieDraft(completeDraft), true);
  assert.deepEqual(calorieDraftFromUnknown(completeDraft), completeDraft);
  assert.equal(calorieDraftFromUnknown({ calories: 1900, protein: 0, carbs: 190, fat: 63 }), null);
  assert.equal(calorieDraftFromUnknown({ calories: 1900 }), null);
  assert.equal(
    watchMinimumApplyIdempotencyKey('sig-1', '2026-08-31'),
    'watch-apply:sig-1:2026-08-31',
  );
  const accepted = {
    decision: 'accepted' as const,
    source: 'prometheus_watch',
    proposal: {
      kind: 'watch_proposal_decision',
      action: 'calorie_adjustment',
      draft: completeDraft,
      week_start: '2026-08-31',
    },
    applied_effect: {},
  };
  assert.equal(isWatchMinimumApplyEligible(accepted), true);
  assert.deepEqual(calorieDraftFromDecisionProposal(accepted.proposal), completeDraft);
  assert.equal(isWatchMinimumApplyEligible({
    ...accepted,
    decision: 'modified',
  }), false);
  assert.equal(isWatchMinimumApplyEligible({
    ...accepted,
    decision: 'refused',
  }), false);
  assert.equal(isWatchMinimumApplyEligible({
    ...accepted,
    proposal: { kind: 'watch_proposal_decision', action: 'relance', week_start: '2026-08-31' },
  }), false);
  assert.equal(isWatchMinimumApplyEligible({
    ...accepted,
    proposal: { kind: WATCH_MINIMUM_APPLY_KIND, action: 'calorie_adjustment', draft: completeDraft },
  }), false);
  assert.equal(isWatchMinimumApplyEligible({
    ...accepted,
    applied_effect: { daily_calorie_target: 1900 },
  }), false);
  assert.equal(isWatchMinimumApplyEligible({
    ...accepted,
    source: 'solo_weekly_reviews',
  }), false);
});

test('P2.6 reuses existing calorie writes, not a third apply engine', () => {
  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.apply_athlete_watch_minimum');
  assert.equal(latest.file, '20260919181919_watch_minimum_apply.sql');
  assert.match(latest.sql, /actor_is_actively_coached/);
  assert.match(latest.sql, /is_coach_of/);
  assert.match(latest.sql, /coach_set_client_nutrition_targets/);
  assert.match(latest.sql, /queue_and_record_athlete_decision/);
  assert.match(latest.sql, /watch_minimum_apply/);
  assert.match(latest.sql, /no_prior_accept/);
  assert.match(latest.sql, /no_applicable_minimum/);
  assert.match(latest.sql, /stale_proposal/);
  assert.match(latest.sql, /idempotency_conflict/);
  assert.match(latest.sql, /invalid_idempotency_key/);
  assert.match(latest.sql, /prometheus_is_complete_calorie_draft/);
  assert.match(latest.sql, /watch-apply:' \|\| v_signal\.id/);
  assert.match(latest.sql, /FOR UPDATE/);
  assert.match(latest.sql, /UPDATE public\.user_profiles/);
  const applySql = latest.sql.slice(latest.sql.indexOf('CREATE OR REPLACE FUNCTION public.apply_athlete_watch_minimum'));
  assert.doesNotMatch(latest.sql, /CREATE TABLE/);
  assert.doesNotMatch(applySql, /commit_solo_weekly_review_decision/);
  assert.doesNotMatch(applySql, /apply_intervention/);
  assert.doesNotMatch(applySql, /_apply_intervention_effects/);
  assert.doesNotMatch(applySql, /resolve_athlete_signal/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(applySql, /nutrition_logs|program_assignments|weight_measurements/);
  assert.doesNotMatch(latest.sql, /GRANT INSERT ON TABLE public\.athlete_decision_log TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT EXECUTE ON FUNCTION public\.prometheus_is_complete_calorie_draft/);

  const api = src('src/features/signals/domain/watchMinimumApi.ts');
  assert.match(api, /rpc\('apply_athlete_watch_minimum'/);
  assert.doesNotMatch(api, /from\('athlete_signals'\)\.(insert|update)/);
  assert.doesNotMatch(api, /BestEffort/);
  assert.doesNotMatch(api, /commit_solo_weekly_review_decision/);
  assert.doesNotMatch(api, /apply_intervention/);
  assert.match(api, /ok: false/);
  assert.match(api, /p_journal_id/);
  assert.match(api, /p_seen_proposal/);

  const panel = src('src/components/dashboard/PrometheusWatchPanel.tsx');
  assert.match(panel, /canApplyAthleteWatchMinimum\(/);
  assert.match(panel, /applyAthleteWatchMinimum/);
  assert.match(panel, /item\.canApplyMinimum/);
  assert.match(panel, /prometheusWatch\.apply/);
  assert.match(panel, /isWatchProposalWeekStart/);
  assert.match(panel, /applyWeek === item\.reviewWeekStart/);
  assert.doesNotMatch(panel, /commit_solo_weekly_review_decision/);
  assert.doesNotMatch(panel, /apply_intervention/);
  assert.doesNotMatch(panel, /upsert_athlete_signal|resolve_athlete_signal|record_athlete_decision/);
  assert.doesNotMatch(panel, /useSoloCopilotStore/);

  const sqlTest = src('supabase/tests/athlete_watch_minimum.sql');
  const resets = [...sqlTest.matchAll(/^reset role;$/gm)];
  const clears = [...sqlTest.matchAll(/^reset role;\nselect set_config\('request.jwt.claim.sub','',true\);$/gm)];
  assert.equal(clears.length, resets.length);
  assert.ok(resets.length > 0);
  assert.match(sqlTest, /solo apply missed targets/);
  assert.match(sqlTest, /solo apply closed the signal/);
  assert.match(sqlTest, /solo apply not idempotent/);
  assert.match(sqlTest, /relance apply wrote targets/);
  assert.match(sqlTest, /modified apply wrote targets/);
  assert.match(sqlTest, /coached self-apply allowed/);
  assert.match(sqlTest, /stranger apply allowed/);
  assert.match(sqlTest, /accept without apply wrote targets/);
  assert.match(sqlTest, /long idempotency key applied/);
  assert.match(sqlTest, /apply_athlete_watch_minimum is a third apply engine/);
  assert.match(sqlTest, /incomplete draft applied/);
  assert.match(sqlTest, /older journal still applied after newer review/);
  assert.match(sqlTest, /coach apply missed client targets/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /athlete_watch_minimum\.sql/);
  assert.match(
    ci,
    /athlete watch minimum: solo and coach can apply accepted calorie draft, coached cannot, no auto-apply, no program rewrite/,
  );

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.length, 1);
  assert.equal(pending.pending[0]?.version, '20260919181919');
  assert.equal(pending.pending[0]?.name, 'watch_minimum_apply');
  assert.match(src('supabase/schema_migrations.lock.json'), /"name": "watch_proposal_decision"/);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /watch_minimum_apply/);

  const edges = src('supabase/functions.manifest.json');
  assert.doesNotMatch(edges, /watch.minimum|apply_athlete_watch_minimum/);
  const manifest = JSON.parse(edges) as { expected: unknown[] };
  assert.equal(manifest.expected.length, 13);
  assert.match(src('docs/P2_6_MINIMUM_ADAPT.md'), /Aucune auto-application/);
  assert.match(src('docs/P2_6_MINIMUM_ADAPT.md'), /20260919181919_watch_minimum_apply/);
  assert.match(src('docs/MIGRATIONS.md'), /20260919181919_watch_minimum_apply/);
});
