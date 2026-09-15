import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  SOLO_MIN_WEIGH_INS,
  SOLO_REVIEW_WINDOW_DAYS,
  buildSoloDossier,
  buildSoloEvidence,
  computeSoloWeeklyReview,
  soloReviewHasAnyData,
  soloReviewMessageKey,
  soloReviewWeekStart,
  type SoloReviewInputs,
} from './soloCopilot';
import { isCompleteCalorieDraft } from './coachInterventions';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const TODAY = '2026-09-03';

function daysBack(n: number): string {
  const ms = Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function logs(days: number, calories: number): Array<{ logged_at: string; calories: number }> {
  const out: Array<{ logged_at: string; calories: number }> = [];
  for (let i = 0; i < days; i++) {
    // two meals a day so per-day aggregation is exercised
    out.push({ logged_at: daysBack(i), calories: calories * 0.6 });
    out.push({ logged_at: daysBack(i), calories: calories * 0.4 });
  }
  return out;
}

function weights(startKg: number, endKg: number, count = 4): Array<{ measured_at: string; weight_kg: number }> {
  const out: Array<{ measured_at: string; weight_kg: number }> = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    out.push({ measured_at: daysBack(13 - Math.round(13 * t)), weight_kg: startKg + (endKg - startKg) * t });
  }
  return out;
}

function inputs(partial: Partial<SoloReviewInputs> = {}): SoloReviewInputs {
  return {
    today: TODAY,
    goal: 'cut',
    calorieTarget: 2000,
    proteinTarget: 160,
    carbsTarget: 190,
    fatTarget: 60,
    weightKg: 80,
    trainingFrequency: 3,
    nutritionLogs: logs(10, 2000),
    weights: weights(80, 79.4),
    workouts: [],
    ...partial,
  };
}

test('week start is the ISO Monday — one review per week', () => {
  assert.equal(soloReviewWeekStart('2026-09-03'), '2026-08-31'); // Thursday → Monday
  assert.equal(soloReviewWeekStart('2026-08-31'), '2026-08-31'); // Monday stays
  assert.equal(soloReviewWeekStart('2026-09-06'), '2026-08-31'); // Sunday → previous Monday
  assert.equal(soloReviewWeekStart('2026-09-07'), '2026-09-07');
});

test('solo dossier counts check-ins in the 14-day window, not a hardcoded 0', () => {
  const inWindow = { checked_at: daysBack(2) };
  const outOfWindow = { checked_at: daysBack(30) };
  const sample = inputs({ checkins: [inWindow, inWindow, outOfWindow] });
  const dossier = buildSoloDossier(sample, buildSoloEvidence(sample));
  assert.equal(dossier.checkin_count, 2);
  assert.equal(dossier.last_checkin_at, daysBack(2));
  assert.doesNotMatch(src('src/lib/soloCopilot.ts'), /checkin_count: 0/);
  assert.match(src('src/components/dashboard/SoloWeeklyReview.tsx'), /checkins,/);
});

test('evidence aggregates the 14-day window: per-day kcal, weigh-ins start → end, sessions', () => {
  const ev = buildSoloEvidence(inputs({
    workouts: [
      { date: `${daysBack(1)}T18:00:00`, completed: true },
      { date: `${daysBack(3)}T18:00:00`, completed: true },
      { date: `${daysBack(30)}T18:00:00`, completed: true },
      { date: `${daysBack(2)}T18:00:00`, completed: false },
    ],
  }));
  assert.equal(ev.loggedDays, 10);
  assert.equal(ev.avgCalories, 2000);
  assert.equal(ev.ratio, 1);
  assert.equal(ev.weighIns, 4);
  assert.equal(ev.weightStart, 80);
  assert.equal(ev.weightEnd, 79.4);
  assert.equal(ev.deltaKg, -0.6);
  assert.equal(ev.workouts, 2);
  assert.equal(ev.expectedWorkouts, 6);
  assert.equal(ev.followingPlan, true);
  assert.equal(SOLO_REVIEW_WINDOW_DAYS, 14);
});

test('not enough weigh-ins or no target → insufficient, silent when the account is empty', () => {
  const noWeights = computeSoloWeeklyReview(inputs({ weights: [] }));
  assert.equal(noWeights.status, 'insufficient');
  assert.equal(soloReviewMessageKey(noWeights), 'soloReview.insufficient');
  assert.equal(soloReviewHasAnyData(noWeights.evidence), true); // has logs → gentle hint

  const oneWeighIn = computeSoloWeeklyReview(inputs({ weights: weights(80, 80, 1) }));
  assert.equal(oneWeighIn.status, 'insufficient');
  assert.equal(SOLO_MIN_WEIGH_INS, 2);

  const noTarget = computeSoloWeeklyReview(inputs({ calorieTarget: 0 }));
  assert.equal(noTarget.status, 'insufficient');

  const empty = computeSoloWeeklyReview(inputs({ weights: [], nutritionLogs: [] }));
  assert.equal(soloReviewHasAnyData(empty.evidence), false);
});

test('not following the plan → relance with the right detail, numbers untouched', () => {
  const fewLogs = computeSoloWeeklyReview(inputs({ nutritionLogs: logs(2, 2000) }));
  assert.equal(fewLogs.proposal.action, 'relance');
  assert.equal(fewLogs.proposal.draft, null);
  assert.equal(fewLogs.relanceDetail, 'few_logs');
  assert.equal(soloReviewMessageKey(fewLogs), 'soloReview.relance.few_logs');

  const over = computeSoloWeeklyReview(inputs({ nutritionLogs: logs(10, 2500) }));
  assert.equal(over.proposal.action, 'relance');
  assert.equal(over.relanceDetail, 'over_target');

  const under = computeSoloWeeklyReview(inputs({ nutritionLogs: logs(10, 1500) }));
  assert.equal(under.proposal.action, 'relance');
  assert.equal(under.relanceDetail, 'under_target');
});

test('cut: normal loss keeps, stall −100, regain −200, too fast +100 — complete macros every time', () => {
  const keep = computeSoloWeeklyReview(inputs());
  assert.equal(keep.proposal.action, 'keep');
  assert.equal(soloReviewMessageKey(keep), 'soloReview.keep');
  assert.equal(keep.currentCalories, 2000);

  const stall = computeSoloWeeklyReview(inputs({ weights: weights(80, 80) }));
  assert.equal(stall.proposal.action, 'calorie_adjustment');
  assert.equal(stall.proposal.reason, 'cut_stall');
  assert.equal(stall.proposal.draft?.calories, 1900);
  assert.equal(isCompleteCalorieDraft(stall.proposal.draft), true);
  assert.equal(soloReviewMessageKey(stall), 'soloReview.adjust.cut_stall');

  const regain = computeSoloWeeklyReview(inputs({ weights: weights(80, 80.5) }));
  assert.equal(regain.proposal.reason, 'cut_gain');
  assert.equal(regain.proposal.draft?.calories, 1800);

  const tooFast = computeSoloWeeklyReview(inputs({ weights: weights(80, 76.8) })); // −3.2 kg / 2 wk ≈ −2 %/wk
  assert.equal(tooFast.proposal.reason, 'too_fast_cut');
  assert.equal(tooFast.proposal.draft?.calories, 2100);
  assert.ok((tooFast.evidence.pctPerWeek ?? 0) < -1.5);
});

test('bulk and maintain follow the fleet rules', () => {
  const bulkStall = computeSoloWeeklyReview(inputs({ goal: 'bulk', weights: weights(70, 70) }));
  assert.equal(bulkStall.proposal.reason, 'bulk_stall');
  assert.equal(bulkStall.proposal.draft?.calories, 2100);

  const bulkFast = computeSoloWeeklyReview(inputs({ goal: 'bulk', weights: weights(70, 71.4) })); // +1 %/wk
  assert.equal(bulkFast.proposal.reason, 'bulk_too_fast');
  assert.equal(bulkFast.proposal.draft?.calories, 1900);

  const bulkOk = computeSoloWeeklyReview(inputs({ goal: 'bulk', weights: weights(70, 70.5) }));
  assert.equal(bulkOk.proposal.action, 'keep');

  const maintainDrift = computeSoloWeeklyReview(inputs({ goal: 'maintain', weights: weights(70, 71.6) }));
  assert.equal(maintainDrift.proposal.action, 'calorie_adjustment');
  assert.equal(maintainDrift.proposal.draft?.calories, 1900);

  const maintainOk = computeSoloWeeklyReview(inputs({ goal: 'maintain', weights: weights(70, 70.4) }));
  assert.equal(maintainOk.proposal.action, 'keep');
});

test('solo copilot lives on the solo home, writes targets only on an explicit accept, never for a coached client', () => {
  const card = src('src/components/dashboard/SoloWeeklyReview.tsx');
  assert.match(card, /const solo = !coached && coachingRole !== 'coach'/);
  assert.match(card, /if \(!user \|\| !solo \|\| !review\) return null/);
  assert.match(card, /onDecide\('accepted'\)/);
  assert.match(card, /onDecide\('kept'\)/);
  assert.doesNotMatch(card, /updateProfile/);
  assert.match(card, /soloReview\.nothingAuto/);

  const store = src('src/stores/soloCopilotStore.ts');
  const decide = store.slice(store.indexOf('decide: async'));
  assert.match(decide, /if \(decision === 'accepted' && draft\)/);
  assert.match(decide, /updateProfile\(userId, \{\s*daily_calorie_target: draft\.calories/);
  assert.match(decide, /from\('solo_weekly_reviews'\)/);
  assert.match(decide, /onConflict: 'user_id,week_start'/);
  assert.match(decide, /track\('solo_review_decided'/);

  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /\{!hasCoach && !activityPending && !firstRun && <SoloWeeklyReview \/>\}/);
  const nutrition = src('src/components/nutrition/NutritionPage.tsx');
  assert.doesNotMatch(nutrition, /WeeklyAdjustment/);
  assert.doesNotMatch(nutrition, /weeklyAdjustmentDismissed/);

  const sql = src('supabase/migrations/20260905002152_solo_weekly_reviews.sql');
  assert.match(sql, /UNIQUE \(user_id, week_start\)/);
  assert.match(sql, /CHECK \(action IN \('keep', 'relance', 'calorie_adjustment'\)\)/);
  assert.match(sql, /CHECK \(decision IN \('accepted', 'kept', 'dismissed'\)\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_coach_of\(user_id\)/);
});

test('I03: solo window is the same 14 dates as the fleet (today-13..today)', () => {
  const ev = buildSoloEvidence(inputs());
  assert.equal(ev.windowEnd, TODAY);
  assert.equal(ev.windowStart, daysBack(13));
  const spanDays = Math.round((Date.parse(`${ev.windowEnd}T00:00:00Z`) - Date.parse(`${ev.windowStart}T00:00:00Z`)) / 86_400_000) + 1;
  assert.equal(spanDays, 14);
});

test('I03: pace uses the real span; same-day weigh-ins give no trend', () => {
  const wide = buildSoloEvidence(inputs({ weights: [{ measured_at: daysBack(13), weight_kg: 80 }, { measured_at: daysBack(0), weight_kg: 79 }] }));
  const narrow = buildSoloEvidence(inputs({ weights: [{ measured_at: daysBack(1), weight_kg: 80 }, { measured_at: daysBack(0), weight_kg: 79 }] }));
  assert.equal(wide.deltaKg, -1);
  assert.equal(narrow.deltaKg, -1);
  assert.ok(Math.abs(narrow.pctPerWeek ?? 0) > Math.abs(wide.pctPerWeek ?? 0) * 5);
  const sameDay = buildSoloEvidence(inputs({ weights: [{ measured_at: `${TODAY}T08:00:00`, weight_kg: 80 }, { measured_at: `${TODAY}T20:00:00`, weight_kg: 79.5 }] }));
  assert.equal(sameDay.weightSpanDays, 0);
  assert.equal(sameDay.pctPerWeek, null);
});

test('I03: days are judged against the target that governed them', () => {
  const history = [
    { effective_from: daysBack(13), calories: 2000 },
    { effective_from: TODAY, calories: 2600 },
  ];
  const ev = buildSoloEvidence(inputs({ calorieTarget: 2600, targetHistory: history }));
  // 13 days at 2000 + today at 2600 → ~2043, not 2600.
  assert.ok(ev.targetAvg > 1900 && ev.targetAvg < 2200);
  assert.ok(ev.ratio > 0.9 && ev.ratio < 1.1);
  assert.equal(ev.followingPlan, true);
});

test('I04: minor or medical flags → guarded accompaniment, never an adjustment', () => {
  const minor = computeSoloWeeklyReview(inputs({ weights: weights(80, 80), isMinor: true }));
  assert.equal(minor.proposal.action, 'keep');
  assert.equal(minor.proposal.guarded, true);
  assert.equal(soloReviewMessageKey(minor), 'soloReview.guarded');
  const flagged = computeSoloWeeklyReview(inputs({ weights: weights(80, 80), hasMedicalFlags: true }));
  assert.equal(flagged.proposal.guarded, true);
});

test('I04: solo dossier carries real check-in signals, not nulls', () => {
  const sample = inputs({
    checkins: [
      { checked_at: daysBack(1), adherence_nutrition: 80, adherence_training: 70, fatigue: 8, sleep_quality: 6, muscle_soreness: 4, energy_level: 5, hunger: 5, stress: 4, motivation: 6, joint_pain: 2, mood: 6 },
      { checked_at: daysBack(2), adherence_nutrition: 90, adherence_training: 80, fatigue: 6, sleep_quality: 7, muscle_soreness: 3, energy_level: 6, hunger: 4, stress: 3, motivation: 7, joint_pain: 1, mood: 7 },
    ],
  });
  const dossier = buildSoloDossier(sample, buildSoloEvidence(sample));
  assert.equal(dossier.avg_adherence_nutrition, 85);
  assert.equal(dossier.avg_fatigue, 7);
  assert.deepEqual(dossier.tracking, { nutrition: true, workouts: true, weight: true, checkins: true });
});
