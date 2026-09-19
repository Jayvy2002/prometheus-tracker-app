import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import type { AthleteDecisionLog, AthleteSignal, AthleteWeeklyReview } from '../types';
import {
  buildPrometheusWatchItems,
  humanizeDataUsed,
  watchItemHasRawJson,
} from './explainability';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function signal(partial: Partial<AthleteSignal> = {}): AthleteSignal {
  return {
    id: 'sig-1',
    athlete_id: 'athlete',
    domain: 'training',
    type: 'missed_sessions',
    hypothesis: 'Moins de séances loggées que prévu sur la fenêtre',
    evidence_for: [{ kind: 'workouts', summary: '1 séance / 4 attendues' }],
    evidence_against: [],
    confidence: 'medium',
    status: 'open',
    first_seen_at: '2026-09-01T00:00:00Z',
    last_seen_at: '2026-09-18T00:00:00Z',
    next_review_at: '2026-09-25T00:00:00Z',
    resolved_at: null,
    resolution_reason: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-18T00:00:00Z',
    ...partial,
  };
}

function decision(partial: Partial<AthleteDecisionLog> = {}): AthleteDecisionLog {
  return {
    id: 'dec-1',
    athlete_id: 'athlete',
    actor_id: 'athlete',
    actor_role: 'athlete',
    domain: 'training',
    type: 'missed_sessions',
    decision: 'refused',
    proposal: { action: 'relance' },
    why: 'Moins de séances que prévu',
    data_used: { workout_count: 1, expected_workouts: 4 },
    human_reason: 'Pas le bon moment',
    applied_effect: {},
    source: 'solo_weekly_reviews',
    source_id: null,
    created_at: '2026-09-14T00:00:00Z',
    ...partial,
  };
}

function review(partial: Partial<AthleteWeeklyReview> = {}): AthleteWeeklyReview {
  return {
    id: 'rev-1',
    athlete_id: 'athlete',
    week_start: '2026-09-14',
    authority: 'athlete',
    data_quality: 'adequate',
    decision: 'propose',
    summary: 'Proposition d’entraînement',
    aggregates: {
      window_start: '2026-09-05',
      window_end: '2026-09-18',
      workout_count: 1,
      expected_workouts: 4,
    },
    tracking: { nutrition: true, workouts: true, weight: true, checkins: true },
    signal_actions: [],
    created_at: '2026-09-18T00:00:00Z',
    updated_at: '2026-09-18T00:00:00Z',
    ...partial,
  };
}

test('watch list explains an open signal without dumping JSON or auto-applying', () => {
  const items = buildPrometheusWatchItems({
    signals: [signal()],
    decisions: [],
    latestReview: review(),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].domainKey, 'prometheusWatch.domains.training');
  assert.equal(items[0].headlineKey, 'prometheusWatch.types.missed_sessions');
  assert.equal(items[0].observed, '1 séance / 4 attendues');
  assert.equal(items[0].suppressed, false);
  assert.equal(items[0].proposalKey, null);
  assert.equal(watchItemHasRawJson(items[0]), false);
  assert.doesNotMatch(src('src/features/signals/domain/explainability.ts'), /JSON\.stringify/);
  assert.doesNotMatch(src('src/components/dashboard/PrometheusWatchPanel.tsx'), /upsert_athlete_signal|resolve_athlete_signal|record_athlete_decision/);
});

test('a refusal with unchanged proofs hides the proposal and asks for new data', () => {
  const items = buildPrometheusWatchItems({
    signals: [signal()],
    decisions: [decision()],
    latestReview: review({ aggregates: { workout_count: 1, expected_workouts: 4, window_start: '2026-09-05', window_end: '2026-09-18' } }),
  });
  assert.equal(items[0].suppressed, true);
  assert.equal(items[0].proposalKey, null);
  assert.equal(items[0].whyHiddenKey, 'prometheusWatch.hidden.unchanged');
  assert.equal(items[0].lastDecisionKey, 'prometheusWatch.decision.refused');
  assert.equal(items[0].humanReason, 'Pas le bon moment');
  assert.equal(items[0].reevaluateKey, 'prometheusWatch.reevaluate.needNewProof');
});

test('new proofs after a refusal surface the row again without rewriting history', () => {
  const refused = decision();
  const items = buildPrometheusWatchItems({
    signals: [signal()],
    decisions: [refused],
    latestReview: review({ aggregates: { workout_count: 4, expected_workouts: 4 } }),
  });
  assert.equal(items[0].suppressed, false);
  assert.equal(items[0].whyHiddenKey, 'prometheusWatch.hidden.changed');
  assert.equal(items[0].lastDecisionKey, 'prometheusWatch.decision.refused');
  assert.equal(refused.decision, 'refused');
});

test('a hidden proposal without an open signal still appears as a quiet row', () => {
  const items = buildPrometheusWatchItems({
    signals: [],
    decisions: [decision({ decision: 'ignored', actor_role: 'coach' })],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].suppressed, true);
  assert.equal(items[0].lastActorKey, 'prometheusWatch.actor.coach');
  assert.match(items[0].id, /^hidden:/);
});

test('data_used is turned into labeled points, never nested objects', () => {
  const points = humanizeDataUsed({
    workout_count: 1,
    expected_workouts: 4,
    proposal: { action: 'relance' },
    assign_client_id: 'x',
  });
  assert.deepEqual(points.map((row) => row.key).sort(), [
    'prometheusWatch.data.expectedWorkouts',
    'prometheusWatch.data.workouts',
  ]);
});

test('FR/EN copy exists for the watch panel and both surfaces mount it', () => {
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  for (const locale of [fr, en]) {
    assert.match(locale, /prometheusWatch/);
    assert.match(locale, /Ce que Prometheus surveille|What Prometheus is watching/);
    assert.match(locale, /missed_sessions/);
    assert.match(locale, /needNewProof/);
  }
  assert.match(src('src/components/dashboard/Dashboard.tsx'), /PrometheusWatchPanel/);
  assert.match(src('src/components/coaching/ClientDetailPage.tsx'), /PrometheusWatchPanel/);
  assert.match(src('src/components/dashboard/PrometheusWatchPanel.tsx'), /canReadAthleteWatch/);
  assert.doesNotMatch(src('src/components/dashboard/PrometheusWatchPanel.tsx'), /canCorrectAthleteWatchContext\(/);
  assert.match(src('docs/P2_4_EXPLAINABILITY.md'), /Lecture seule/);
});

test('an accepted decision still shows the proposal and does not rewrite the journal row', () => {
  const accepted = decision({
    decision: 'accepted',
    domain: 'nutrition',
    type: 'not_following',
    proposal: { action: 'calorie_adjustment' },
  });
  const before = structuredClone(accepted);
  const items = buildPrometheusWatchItems({
    signals: [signal({ domain: 'nutrition', type: 'not_following' })],
    decisions: [accepted],
    latestReview: review(),
  });
  assert.equal(items[0].suppressed, false);
  assert.equal(items[0].proposalKey, 'prometheusWatch.proposal.calories');
  assert.deepEqual(accepted, before);
});

test('the watch list stays short and does not invent a second engine', () => {
  const signals = Array.from({ length: 13 }, (_, index) => signal({
    id: `sig-${index}`,
    type: index % 2 === 0 ? 'missed_sessions' : 'fatigue',
    domain: index % 2 === 0 ? 'training' : 'recovery',
  }));
  const items = buildPrometheusWatchItems({ signals, decisions: [] });
  assert.equal(items.length, 12);
  assert.doesNotMatch(src('src/features/signals/domain/explainability.ts'), /openai|anthropic/i);
});
