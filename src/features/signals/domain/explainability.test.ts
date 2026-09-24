import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import type {
  AthleteDecisionLog,
  AthleteSignal,
  AthleteSignalDomain,
  AthleteWeeklyReview,
} from '../types';
import {
  buildPrometheusWatchItems,
  humanizeDataUsed,
  parseEvidenceFingerprint,
  parseEvidenceWindow,
  reviewProposesFor,
  watchItemHasRawJson,
  META_EVIDENCE_KINDS,
} from './explainability';
import {
  addUtcDays,
  runAthleteWeeklyReview,
  weeklyReviewActionsToRpcPayload,
  type WeeklyReviewAggregates,
  type WeeklyReviewInput,
  type WeeklyReviewResult,
  type WeeklyReviewSignalAction,
} from './weeklyReview';
import { formatDate } from '../../../lib/utils';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
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
    athleteId: 'athlete',
    today: '2026-09-03',
    identity: 'solo',
    tracking: { nutrition: true, workouts: true, weight: true, checkins: true },
    aggregates: aggregates(),
    existingSignals: [],
    ...partial,
  };
}

function reviewFromEngine(
  result: WeeklyReviewResult,
  extra: Partial<AthleteWeeklyReview> = {},
): AthleteWeeklyReview {
  return {
    id: 'rev-1',
    athlete_id: 'athlete',
    week_start: result.weekStart,
    authority: result.authority,
    data_quality: result.dataQuality,
    decision: result.decision,
    summary: result.summary,
    aggregates: {
      window_start: result.aggregates.windowStart,
      window_end: result.aggregates.windowEnd,
      logged_nutrition_days: result.aggregates.loggedNutritionDays,
      avg_calories: result.aggregates.avgCalories,
      calorie_target: result.aggregates.calorieTarget,
      workout_count: result.aggregates.workoutCount,
      expected_workouts: result.aggregates.expectedWorkouts,
      weigh_ins: result.aggregates.weighIns,
      weight_delta_kg: result.aggregates.weightDeltaKg,
      weight_start_kg: result.aggregates.weightStartKg,
      weight_span_days: result.aggregates.weightSpanDays,
      checkin_count: result.aggregates.checkinCount,
      avg_fatigue: result.aggregates.avgFatigue,
      avg_energy: result.aggregates.avgEnergy,
      goal: result.aggregates.goal,
    },
    tracking: result.tracking,
    signal_actions: result.signalActions,
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
    ...extra,
  };
}

function signalFromAction(
  action: WeeklyReviewSignalAction,
  extra: Partial<AthleteSignal> = {},
): AthleteSignal {
  assert.equal(action.op, 'upsert');
  assert.ok(action.domain);
  assert.ok(action.type);
  return {
    id: extra.id ?? 'sig-1',
    athlete_id: 'athlete',
    domain: action.domain as AthleteSignalDomain,
    type: action.type,
    hypothesis: action.hypothesis ?? '',
    evidence_for: action.evidenceFor ?? [],
    evidence_against: action.evidenceAgainst ?? [],
    confidence: action.confidence ?? 'low',
    status: action.status ?? 'open',
    first_seen_at: '2026-08-21T00:00:00Z',
    last_seen_at: extra.last_seen_at ?? '2026-09-03T00:00:00Z',
    next_review_at: action.nextReviewAt ?? null,
    resolved_at: null,
    resolution_reason: null,
    created_at: '2026-08-21T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
    ...extra,
  };
}

function upsertOf(result: WeeklyReviewResult, type: string): WeeklyReviewSignalAction {
  const action = result.signalActions.find((row) => row.op === 'upsert' && row.type === type);
  assert.ok(action, `expected engine upsert for ${type}`);
  return action!;
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
    data_used: { workout_count: 0, expected_workouts: 6, window_start: '2026-08-07', window_end: '2026-08-20' },
    human_reason: 'Pas le bon moment',
    applied_effect: {},
    source: 'solo_weekly_reviews',
    source_id: null,
    created_at: '2026-08-27T00:00:00Z',
    ...partial,
  };
}

function stubSignal(partial: Partial<AthleteSignal> = {}): AthleteSignal {
  return {
    id: 'sig-1',
    athlete_id: 'athlete',
    domain: 'training',
    type: 'missed_sessions',
    hypothesis: 'Moins de séances loggées que prévu sur la fenêtre',
    evidence_for: [],
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

test('real engine evidence_for starts with window then fingerprint; watch copy skips both', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 1, expectedWorkouts: 6 }),
  }));
  const action = upsertOf(week1, 'missed_sessions');
  const evidence = action.evidenceFor ?? [];
  assert.equal(evidence[0]?.kind, META_EVIDENCE_KINDS[0]);
  assert.equal(evidence[1]?.kind, META_EVIDENCE_KINDS[1]);
  assert.match(evidence[0]?.summary ?? '', /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/);
  assert.equal(evidence[0]?.summary, '2026-08-21..2026-09-03');
  const fingerprint = parseEvidenceFingerprint(evidence);
  const window = parseEvidenceWindow(evidence);
  assert.deepEqual(window, { start: '2026-08-21', end: '2026-09-03' });
  assert.equal(fingerprint?.workout_count, 1);
  assert.equal(fingerprint?.expected_workouts, 6);

  const items = buildPrometheusWatchItems({
    signals: [signalFromAction(action)],
    decisions: [],
    latestReview: reviewFromEngine(week1),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'current');
  assert.equal(items[0].observedCopy?.key, 'prometheusWatch.observedCopy.workouts');
  assert.equal(items[0].observedCopy?.params.count, 1);
  assert.equal(items[0].observedCopy?.params.expected, 6);
  assert.equal(items[0].periodStart, '2026-08-21');
  assert.equal(items[0].periodEnd, '2026-09-03');
  assert.notEqual(items[0].observedCopy?.params.count, '2026-08-21..2026-09-03');
  assert.equal(week1.decision, 'wait');
  assert.equal(items[0].currentProposalKey, null);
  assert.equal(watchItemHasRawJson(items[0]), false);
  assert.doesNotMatch(JSON.stringify(items[0]), /2026-08-21\.\.2026-09-03/);
  assert.doesNotMatch(JSON.stringify(items[0]), /Moins de séances loggées/);
  assert.doesNotMatch(JSON.stringify(items[0]), /séance\(s\) \//);
});

test('nutrition and fatigue observations come from structured metrics, not French summaries', () => {
  const nutritionWeek = runAthleteWeeklyReview(input({
    aggregates: aggregates({ avgCalories: 2800, calorieTarget: 2000, workoutCount: 6 }),
  }));
  const nutritionAction = upsertOf(nutritionWeek, 'not_following');
  assert.equal(nutritionAction.evidenceFor?.[0]?.kind, 'window');
  assert.equal(nutritionAction.evidenceFor?.[1]?.kind, 'fingerprint');
  const nutritionItems = buildPrometheusWatchItems({
    signals: [signalFromAction(nutritionAction)],
    decisions: [],
    latestReview: reviewFromEngine(nutritionWeek),
  });
  assert.equal(nutritionItems[0].observedCopy?.key, 'prometheusWatch.observedCopy.nutrition');
  assert.equal(nutritionItems[0].observedCopy?.params.avg, 2800);
  assert.equal(nutritionItems[0].observedCopy?.params.target, 2000);
  assert.doesNotMatch(JSON.stringify(nutritionItems[0]), /moyenne 2800 kcal vs cible/);

  const fatigueWeek = runAthleteWeeklyReview(input({
    aggregates: aggregates({ avgFatigue: 8, avgEnergy: 2, workoutCount: 6 }),
  }));
  const fatigueAction = upsertOf(fatigueWeek, 'fatigue');
  const fatigueItems = buildPrometheusWatchItems({
    signals: [signalFromAction(fatigueAction)],
    decisions: [],
    latestReview: reviewFromEngine(fatigueWeek),
  });
  assert.equal(fatigueItems[0].observedCopy?.key, 'prometheusWatch.observedCopy.fatigue');
  assert.equal(fatigueItems[0].observedCopy?.params.fatigue, 8);
  assert.equal(fatigueItems[0].observedCopy?.params.energy, 2);
  assert.doesNotMatch(JSON.stringify(fatigueItems[0]), /fatigue 8 \/ énergie/);
});

test('a first-week wait does not present a journal proposal as the current proposal', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 1, expectedWorkouts: 6 }),
  }));
  const action = upsertOf(week1, 'missed_sessions');
  const items = buildPrometheusWatchItems({
    signals: [signalFromAction(action)],
    decisions: [decision()],
    latestReview: reviewFromEngine(week1),
  });
  assert.equal(week1.decision, 'wait');
  assert.equal(items[0].kind, 'current');
  assert.equal(items[0].statusKey, 'prometheusWatch.status.open');
  assert.equal(items[0].currentProposalKey, null);
  assert.equal(items[0].lastProposalKey, 'prometheusWatch.proposal.relance');
  assert.equal(items[0].lastDecisionKey, 'prometheusWatch.decision.refused');
  assert.equal(items[0].periodStart, '2026-08-21');
  assert.equal(items[0].lastPeriodStart, '2026-08-07');
  assert.equal(items[0].suppressed, true);
  assert.equal(items[0].whyHiddenKey, 'prometheusWatch.hidden.unchanged');
});

test('changed proofs after a refusal do not resurrect the old proposal as current', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 0, expectedWorkouts: 6 }),
  }));
  const week1Action = upsertOf(week1, 'missed_sessions');
  const week2Agg = aggregates({
    workoutCount: 2,
    expectedWorkouts: 6,
    windowStart: addUtcDays('2026-08-21', 7),
    windowEnd: addUtcDays('2026-09-03', 7),
  });
  const week2 = runAthleteWeeklyReview(input({
    today: '2026-09-10',
    aggregates: week2Agg,
    existingSignals: [signalFromAction(week1Action, { confidence: 'low' })],
  }));
  const week2Action = upsertOf(week2, 'missed_sessions');
  assert.equal(week2.decision, 'propose');
  assert.equal(week2Action.confidence, 'medium');

  const items = buildPrometheusWatchItems({
    signals: [signalFromAction(week2Action, {
      first_seen_at: '2026-08-21T00:00:00Z',
      last_seen_at: '2026-09-10T00:00:00Z',
    })],
    decisions: [decision({
      proposal: { action: 'relance' },
      data_used: { workout_count: 0, expected_workouts: 6, window_start: '2026-08-21', window_end: '2026-09-03' },
    })],
    latestReview: reviewFromEngine(week2),
  });
  assert.equal(items[0].kind, 'current');
  assert.equal(items[0].suppressed, false);
  assert.equal(items[0].currentProposalKey, 'prometheusWatch.proposal.relance');
  assert.equal(items[0].lastProposalKey, 'prometheusWatch.proposal.relance');
  assert.equal(items[0].observedCopy?.params.count, 2);
  assert.equal(items[0].periodStart, '2026-08-28');
  assert.equal(items[0].lastPeriodStart, '2026-08-21');
  assert.equal(items[0].whyHiddenKey, 'prometheusWatch.hidden.changed');
  assert.equal(items[0].lastDecisionKey, 'prometheusWatch.decision.refused');
});

test('a review that proposes for signal A does not invent a current proposal on custom signal B', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 0, expectedWorkouts: 6 }),
  }));
  const week1Action = upsertOf(week1, 'missed_sessions');
  const week2 = runAthleteWeeklyReview(input({
    today: '2026-09-10',
    aggregates: aggregates({
      workoutCount: 2,
      expectedWorkouts: 6,
      windowStart: addUtcDays('2026-08-21', 7),
      windowEnd: addUtcDays('2026-09-03', 7),
    }),
    existingSignals: [signalFromAction(week1Action, { confidence: 'low' })],
  }));
  const week2Action = upsertOf(week2, 'missed_sessions');
  assert.equal(week2.decision, 'propose');
  const persisted = reviewFromEngine(week2, {
    signal_actions: weeklyReviewActionsToRpcPayload(week2.signalActions),
  });
  assert.equal(reviewProposesFor(persisted, 'training', 'missed_sessions'), true);
  assert.equal(reviewProposesFor(persisted, 'goal', 'custom_habit'), false);

  const custom = stubSignal({
    id: 'sig-custom',
    domain: 'goal',
    type: 'custom_habit',
    hypothesis: 'Un signal custom hors moteur',
    confidence: 'high',
    status: 'open',
  });
  const items = buildPrometheusWatchItems({
    signals: [signalFromAction(week2Action), custom],
    decisions: [],
    latestReview: persisted,
  });
  const training = items.find((row) => row.type === 'missed_sessions');
  const other = items.find((row) => row.type === 'custom_habit');
  assert.ok(training);
  assert.ok(other);
  assert.equal(training?.currentProposalKey, 'prometheusWatch.proposal.relance');
  assert.equal(other?.currentProposalKey, null);
  assert.equal(other?.kind, 'current');
  assert.equal(other?.statusKey, 'prometheusWatch.status.open');
  assert.equal(other?.headlineKey, 'prometheusWatch.types.other');
});

test('a watch-panel accept or refuse hides the current proposal without inventing history', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 0, expectedWorkouts: 6 }),
  }));
  const week2 = runAthleteWeeklyReview(input({
    today: '2026-09-10',
    aggregates: aggregates({
      workoutCount: 2,
      expectedWorkouts: 6,
      windowStart: addUtcDays('2026-08-21', 7),
      windowEnd: addUtcDays('2026-09-03', 7),
    }),
    existingSignals: [signalFromAction(upsertOf(week1, 'missed_sessions'), { confidence: 'low' })],
  }));
  const action = upsertOf(week2, 'missed_sessions');
  assert.equal(week2.decision, 'propose');
  const persisted = reviewFromEngine(week2, {
    signal_actions: weeklyReviewActionsToRpcPayload(week2.signalActions),
  });
  const sameEvidence = {
    workout_count: 2,
    expected_workouts: 6,
    window_start: addUtcDays('2026-08-21', 7),
    window_end: addUtcDays('2026-09-03', 7),
  };

  const accepted = buildPrometheusWatchItems({
    signals: [signalFromAction(action)],
    decisions: [decision({
      decision: 'accepted',
      proposal: { kind: 'watch_proposal_decision', action: 'relance', domain: 'training', type: 'missed_sessions' },
      source: 'prometheus_watch',
      data_used: sameEvidence,
      human_reason: null,
    })],
    latestReview: persisted,
  });
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].kind, 'current');
  assert.equal(accepted[0].statusKey, 'prometheusWatch.status.open');
  assert.equal(accepted[0].currentProposalKey, null);
  assert.equal(accepted[0].lastProposalKey, 'prometheusWatch.proposal.relance');
  assert.equal(accepted[0].lastDecisionKey, 'prometheusWatch.decision.accepted');
  assert.equal(accepted[0].whyHiddenKey, 'prometheusWatch.hidden.unchanged');
  assert.equal(accepted[0].reviewWeekStart, persisted.week_start);

  const modified = buildPrometheusWatchItems({
    signals: [signalFromAction(action)],
    decisions: [decision({
      decision: 'modified',
      proposal: { kind: 'watch_proposal_decision', action: 'relance', domain: 'training', type: 'missed_sessions' },
      source: 'prometheus_watch',
      data_used: sameEvidence,
      human_reason: 'Volume plus tard',
    })],
    latestReview: persisted,
  });
  assert.equal(modified[0].currentProposalKey, null);
  assert.equal(modified[0].lastDecisionKey, 'prometheusWatch.decision.modified');
  assert.equal(modified[0].reviewWeekStart, persisted.week_start);

  const refused = buildPrometheusWatchItems({
    signals: [signalFromAction(action)],
    decisions: [decision({
      decision: 'refused',
      proposal: { kind: 'watch_proposal_decision', action: 'relance', domain: 'training', type: 'missed_sessions' },
      source: 'prometheus_watch',
      data_used: sameEvidence,
    })],
    latestReview: persisted,
  });
  assert.equal(refused[0].kind, 'current');
  assert.equal(refused[0].currentProposalKey, null);
  assert.equal(refused[0].lastDecisionKey, 'prometheusWatch.decision.refused');
  assert.equal(refused[0].suppressed, true);

  const custom = stubSignal({
    id: 'sig-custom',
    domain: 'goal',
    type: 'custom_habit',
    confidence: 'high',
    status: 'open',
  });
  const mixed = buildPrometheusWatchItems({
    signals: [signalFromAction(action), custom],
    decisions: [],
    latestReview: persisted,
  });
  assert.equal(mixed.find((row) => row.type === 'missed_sessions')?.currentProposalKey, 'prometheusWatch.proposal.relance');
  assert.equal(mixed.find((row) => row.type === 'missed_sessions')?.reviewWeekStart, persisted.week_start);
  assert.equal(mixed.find((row) => row.type === 'custom_habit')?.currentProposalKey, null);
  assert.equal(mixed.find((row) => row.type === 'custom_habit')?.reviewWeekStart, persisted.week_start);
});

test('a propose review without a concrete proposal object is not decidable', () => {
  const week2 = runAthleteWeeklyReview(input({
    today: '2026-09-10',
    aggregates: aggregates({
      workoutCount: 2,
      expectedWorkouts: 6,
      windowStart: addUtcDays('2026-08-21', 7),
      windowEnd: addUtcDays('2026-09-03', 7),
    }),
    existingSignals: [signalFromAction(upsertOf(runAthleteWeeklyReview(input({
      aggregates: aggregates({ workoutCount: 0, expectedWorkouts: 6 }),
    })), 'missed_sessions'), { confidence: 'low' })],
  }));
  assert.equal(week2.decision, 'propose');
  const stripped = weeklyReviewActionsToRpcPayload(week2.signalActions).map((raw) => {
    const row = { ...(raw as Record<string, unknown>) };
    delete row.proposal;
    return row;
  });
  const persisted = reviewFromEngine(week2, { signal_actions: stripped });
  assert.equal(reviewProposesFor(persisted, 'training', 'missed_sessions'), false);
  const items = buildPrometheusWatchItems({
    signals: [signalFromAction(upsertOf(week2, 'missed_sessions'))],
    decisions: [],
    latestReview: persisted,
  });
  assert.equal(items[0].currentProposalKey, null);
  assert.equal(items[0].currentProposalDetail, null);
});

test('why copy is a real explanation, not a repeat of the type title', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 1, expectedWorkouts: 6 }),
  }));
  const items = buildPrometheusWatchItems({
    signals: [signalFromAction(upsertOf(week1, 'missed_sessions'))],
    decisions: [],
    latestReview: reviewFromEngine(week1),
  });
  assert.equal(items[0].headlineKey, 'prometheusWatch.types.missed_sessions');
  assert.equal(items[0].whyKey, 'prometheusWatch.whyCopy.missed_sessions');
  assert.notEqual(items[0].whyKey, items[0].headlineKey);
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /plan mérite d’être réévalué/);
  assert.match(en, /plan deserves another look/);
  assert.doesNotMatch(src('src/features/signals/domain/explainability.ts'), /whyKey: typeKeyOf/);
});

test('a corrected interpretation becomes quiet history without inventing an open signal or a current proposal', () => {
  const items = buildPrometheusWatchItems({
    signals: [],
    decisions: [decision({
      decision: 'corrected',
      proposal: { kind: 'watch_context_correction', action: 'not_relevant', domain: 'training', type: 'missed_sessions' },
      human_reason: 'Semaine de déplacement',
      source: 'prometheus_watch',
    })],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'history');
  assert.equal(items[0].statusKey, 'prometheusWatch.status.quiet');
  assert.equal(items[0].currentProposalKey, null);
  assert.equal(items[0].lastProposalKey, null);
  assert.equal(items[0].lastDecisionKey, 'prometheusWatch.decision.corrected');
  assert.equal(items[0].humanReason, 'Semaine de déplacement');
  assert.equal(items[0].whyKey, 'prometheusWatch.whyCopy.missed_sessions');
  assert.notEqual(items[0].whyKey, items[0].headlineKey);
});

test('watch panel dates follow the UI language', () => {
  const fr = formatDate('2026-09-03', 'fr');
  const en = formatDate('2026-09-03', 'en');
  assert.notEqual(fr, en);
  assert.match(fr, /sept/i);
  assert.doesNotMatch(en, /sept\./i);
  const panel = src('src/components/dashboard/PrometheusWatchPanel.tsx');
  const calls = [...panel.matchAll(/formatDate\(([^)]*)\)/g)];
  assert.ok(calls.length >= 2);
  for (const call of calls) {
    assert.match(call[1], /i18n\.language/);
  }
});

test('a historical refusal without an open signal stays history and never invents open', () => {
  const items = buildPrometheusWatchItems({
    signals: [],
    decisions: [decision({ decision: 'ignored', actor_role: 'coach' })],
    latestReview: reviewFromEngine(runAthleteWeeklyReview(input({
      aggregates: aggregates({ workoutCount: 4, expectedWorkouts: 6 }),
    }))),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'history');
  assert.equal(items[0].statusKey, 'prometheusWatch.status.quiet');
  assert.equal(items[0].currentProposalKey, null);
  assert.equal(items[0].lastProposalKey, 'prometheusWatch.proposal.relance');
  assert.equal(items[0].lastActorKey, 'prometheusWatch.actor.coach');
  assert.match(items[0].id, /^hidden:/);
  assert.equal(items[0].whyHiddenKey, 'prometheusWatch.hidden.changedNoSignal');
  assert.equal(items[0].reevaluateKey, 'prometheusWatch.reevaluate.noOpenSignal');
  assert.equal(items[0].periodStart, null);
  assert.equal(items[0].lastPeriodStart, '2026-08-07');
});

test('unchanged historical refusal stays quiet and suppressed', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ workoutCount: 0, expectedWorkouts: 6 }),
  }));
  const items = buildPrometheusWatchItems({
    signals: [],
    decisions: [decision({ data_used: { workout_count: 0, expected_workouts: 6 } })],
    latestReview: reviewFromEngine(week1),
  });
  assert.equal(items[0].kind, 'history');
  assert.equal(items[0].statusKey, 'prometheusWatch.status.quiet');
  assert.equal(items[0].suppressed, true);
  assert.equal(items[0].currentProposalKey, null);
  assert.equal(items[0].whyHiddenKey, 'prometheusWatch.hidden.unchanged');
});

test('an accepted decision keeps last proposal in history and does not rewrite the journal', () => {
  const week1 = runAthleteWeeklyReview(input({
    aggregates: aggregates({ avgCalories: 2800, calorieTarget: 2000 }),
  }));
  const action = upsertOf(week1, 'not_following');
  const accepted = decision({
    decision: 'accepted',
    domain: 'nutrition',
    type: 'not_following',
    proposal: { action: 'calorie_adjustment' },
    data_used: { avg_calories: 2600, calorie_target: 2000, window_start: '2026-08-01', window_end: '2026-08-14' },
  });
  const before = structuredClone(accepted);
  const items = buildPrometheusWatchItems({
    signals: [signalFromAction(action)],
    decisions: [accepted],
    latestReview: reviewFromEngine(week1),
  });
  assert.equal(items[0].suppressed, false);
  assert.equal(items[0].currentProposalKey, null);
  assert.equal(items[0].lastProposalKey, 'prometheusWatch.proposal.calories');
  assert.equal(items[0].observedCopy?.params.avg, 2800);
  assert.equal(items[0].lastDataPoints.some((row) => row.params.n === 2600), true);
  assert.deepEqual(accepted, before);
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

test('FR/EN copy covers structured observations, quiet status, load error, and both surfaces', () => {
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  for (const locale of [fr, en]) {
    assert.match(locale, /prometheusWatch/);
    assert.match(locale, /Ce que Prometheus surveille|What Prometheus is watching/);
    assert.match(locale, /missed_sessions/);
    assert.match(locale, /needNewProof/);
    assert.match(locale, /observedCopy/);
    assert.match(locale, /changedNoSignal/);
    assert.match(locale, /loadError/);
    assert.match(locale, /status:[\s\S]*quiet/);
    assert.match(locale, /whyCopy/);
    assert.match(locale, /decision:[\s\S]*corrected/);
    assert.match(locale, /titleNotRelevant|Mark this observation as not relevant/);
    assert.match(locale, /decide:[\s\S]*accept/);
    assert.match(locale, /titleRefuse|Decline this proposal/);
    assert.match(locale, /Record a change \(without applying it\)|Noter une modification \(sans l’appliquer\)/);
    assert.match(locale, /nutritionRelance/);
    assert.match(locale, /draftCalories/);
  }
  assert.doesNotMatch(src('src/components/dashboard/Dashboard.tsx'), /PrometheusWatchPanel/);
  assert.match(src('src/components/navigation/WatchPage.tsx'), /PrometheusWatchPanel/);
  assert.match(src('src/components/coaching/ClientDetailPage.tsx'), /PrometheusWatchPanel/);
  const panel = src('src/components/dashboard/PrometheusWatchPanel.tsx');
  assert.match(panel, /canReadAthleteWatch/);
  assert.match(panel, /canCorrectAthleteWatchContext\(/);
  assert.match(panel, /canDecideAthleteWatchProposal\(/);
  assert.match(panel, /correctAthleteWatchContext/);
  assert.match(panel, /decideAthleteWatchProposal/);
  assert.match(panel, /listAthleteSignalsForWatch\(/);
  assert.match(panel, /listLatestAthleteDecisionsForWatch\(/);
  assert.match(panel, /listLatestAthleteWeeklyReviewForWatch\(/);
  assert.doesNotMatch(panel, /BestEffort/);
  assert.doesNotMatch(panel, /commit_solo_weekly_review_decision|apply_intervention/);
  assert.match(panel, /phase === 'error'/);
  assert.match(panel, /errors\.retry/);
  assert.match(panel, /loadError/);
  assert.match(panel, /observedCopy/);
  assert.match(panel, /currentProposalKey/);
  assert.match(panel, /currentProposalDetail/);
  assert.match(panel, /lastProposalKey/);
  assert.doesNotMatch(panel, /item\.hypothesis|evidence\.summary|item\.observed\b/);
  assert.match(src('docs/P2_4_EXPLAINABILITY.md'), /Lecture seule/);
  assert.match(src('docs/P2_4_EXPLAINABILITY.md'), /indisponible ≠ vide|Indisponible ≠ vide/);
});

test('watch loaders distinguish a failed query from an empty dossier', () => {
  const signalsApi = src('src/features/signals/domain/athleteSignalsApi.ts');
  const decisionsApi = src('src/features/signals/domain/decisionLogApi.ts');
  const reviewApi = src('src/features/signals/domain/weeklyReviewApi.ts');
  assert.match(signalsApi, /WatchQueryResult/);
  assert.match(signalsApi, /ok: false, message/);
  assert.match(decisionsApi, /listLatestAthleteDecisionsForWatch/);
  assert.match(decisionsApi, /ok: false, message/);
  assert.match(reviewApi, /listLatestAthleteWeeklyReviewForWatch/);
  assert.match(reviewApi, /ok: false, message/);
});

test('the watch list stays short and does not invent a second engine', () => {
  const signals = Array.from({ length: 13 }, (_, index) => stubSignal({
    id: `sig-${index}`,
    type: index % 2 === 0 ? 'missed_sessions' : 'fatigue',
    domain: index % 2 === 0 ? 'training' : 'recovery',
  }));
  const items = buildPrometheusWatchItems({ signals, decisions: [] });
  assert.equal(items.length, 12);
  const domain = src('src/features/signals/domain/explainability.ts');
  assert.doesNotMatch(domain, /openai|anthropic/i);
  assert.doesNotMatch(domain, /JSON\.stringify/);
  assert.doesNotMatch(domain, /observedBits|headlineFallback|hypothesis/);
  assert.doesNotMatch(src('src/components/dashboard/PrometheusWatchPanel.tsx'), /upsert_athlete_signal|resolve_athlete_signal|record_athlete_decision/);
});
