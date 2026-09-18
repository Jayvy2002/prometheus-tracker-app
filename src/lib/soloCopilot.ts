import {
  FLEET_WINDOW_DAYS,
  UNDER_EAT_RATIO,
  overeatRatio,
  proposeWeeklyNutrition,
  weeklyWeightPct,
  weightSpanDaysBetween,
  type WeeklyNutritionProposal,
} from './coachFleet';
import { weeklyNutritionWhyKey } from './weeklyNutritionWhy';
import { MIN_NUTRITION_LOG_DAYS, OVEREAT_RATIO } from './coachNutrition';
import { isLegacyFiveScaleCheckin, scoreOnTen } from './checkinScale';
import { addDaysToDateStr } from './utils';
import type { AthleteDecisionLog, AthleteSignal, CoachFleetDossier, DailyCheckin } from './types';
import {
  isoWeekStart,
  runAthleteWeeklyReview,
  weeklyReviewInputFromSolo,
} from '../features/signals/domain/weeklyReview';

/**
 * Solo copilot — weekly kcal / macros review (docs/VISION.md, points 6 and 7).
 * Same data-driven rules as the coach fleet (`proposeWeeklyNutrition`), fed by the solo's own
 * logs. The copilot proposes and explains; the solo accepts or keeps. Nothing is auto-applied.
 */

export const SOLO_REVIEW_WINDOW_DAYS = FLEET_WINDOW_DAYS;
/** A start and an end weigh-in in the window — below that, no trajectory to judge. */
export const SOLO_MIN_WEIGH_INS = 2;

export interface SoloReviewInputs {
  today: string;
  goal: string;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  weightKg: number;
  trainingFrequency: number;
  nutritionLogs: Array<{ logged_at: string; calories: number }>;
  weights: Array<{ measured_at: string; weight_kg: number }>;
  workouts?: Array<{ date: string; completed: boolean }>;
  checkins?: Pick<DailyCheckin, 'checked_at' | 'adherence_nutrition' | 'adherence_training' | 'fatigue' | 'sleep_quality' | 'muscle_soreness' | 'energy_level' | 'hunger' | 'stress' | 'motivation' | 'joint_pain' | 'mood'>[];
  /** I03 : historique daté des cibles — chaque jour jugé contre sa cible. */
  targetHistory?: Array<{ effective_from: string; calories: number }>;
  /** I04 : profil protégé — accompagnement général, jamais d'objectif auto. */
  isMinor?: boolean;
  hasMedicalFlags?: boolean;
}

export interface SoloReviewEvidence {
  windowStart: string;
  windowEnd: string;
  loggedDays: number;
  avgCalories: number;
  /** avg / cible effective moyenne ; 0 quand l'une manque. */
  ratio: number;
  /** I03 : moyenne des cibles journalières effectives sur la fenêtre. */
  targetAvg: number;
  weighIns: number;
  weightStart: number | null;
  weightEnd: number | null;
  deltaKg: number | null;
  /** I03 : jours réels entre les deux pesées ; null = tendance inconnue. */
  weightSpanDays: number | null;
  pctPerWeek: number | null;
  workouts: number;
  expectedWorkouts: number;
  followingPlan: boolean;
  /** I04 : moyennes déclarées 0–10 (null = non mesuré, jamais déduit). */
  avgFatigue: number | null;
  avgEnergy: number | null;
}

export type SoloRelanceDetail = 'few_logs' | 'over_target' | 'under_target';

export interface SoloWeeklyReview {
  weekStart: string;
  status: 'insufficient' | 'ready';
  /** The target the proposal starts from (profile.daily_calorie_target). */
  currentCalories: number;
  proposal: WeeklyNutritionProposal;
  evidence: SoloReviewEvidence;
  relanceDetail: SoloRelanceDetail | null;
}

export type SoloReviewDecision = 'accepted' | 'kept' | 'dismissed';

/** ISO Monday of the week containing `today` (YYYY-MM-DD). One review per week. */
export const soloReviewWeekStart = isoWeekStart;

/** Shared P2.2 weekly loop (signals + wait/propose). Nutrition card stays `computeSoloWeeklyReview`. */
export function computeAthleteWeeklyReviewForSolo(
  inputs: SoloReviewInputs,
  existingSignals: AthleteSignal[] = [],
  athleteId = 'self',
  recentDecisions: AthleteDecisionLog[] = [],
) {
  return runAthleteWeeklyReview(
    weeklyReviewInputFromSolo(inputs, buildSoloEvidence(inputs), existingSignals, athleteId, recentDecisions),
  );
}

function inWindow(date: string, start: string, end: string): boolean {
  const d = date.slice(0, 10);
  return d >= start && d <= end;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
}

/** I03 : cible effective moyenne — pour chaque jour, la cible en vigueur ce jour-là. */
export function avgEffectiveTargetForWindow(
  history: Array<{ effective_from: string; calories: number }>,
  windowStart: string,
  windowEnd: string,
  fallbackTarget: number,
): number {
  const rows = [...history]
    .filter(h => Number.isFinite(h.calories) && h.calories > 0)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  if (rows.length === 0) return Math.round(fallbackTarget) || 0;
  let total = 0;
  let days = 0;
  let cursor = windowStart;
  while (cursor <= windowEnd && days < 60) {
    let eff = fallbackTarget;
    for (const row of rows) {
      if (row.effective_from.slice(0, 10) <= cursor) eff = row.calories;
      else break;
    }
    // Avant la première ligne d'historique : repli sur la cible actuelle.
    if (eff <= 0) eff = fallbackTarget;
    total += eff;
    days += 1;
    cursor = addDaysToDateStr(cursor, 1);
  }
  return days > 0 ? Math.round(total / days) : Math.round(fallbackTarget) || 0;
}

export function buildSoloEvidence(inputs: SoloReviewInputs): SoloReviewEvidence {
  const windowEnd = inputs.today;
  // I03 : même fenêtre que la fleet — 14 dates incluses (today-13..today).
  const windowStart = addDaysToDateStr(inputs.today, -(SOLO_REVIEW_WINDOW_DAYS - 1));

  const byDay = new Map<string, number>();
  for (const log of inputs.nutritionLogs) {
    const day = log.logged_at.slice(0, 10);
    if (!inWindow(day, windowStart, windowEnd)) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + (Number(log.calories) || 0));
  }
  const loggedDays = byDay.size;
  const avgCalories = loggedDays > 0
    ? Math.round([...byDay.values()].reduce((s, v) => s + v, 0) / loggedDays)
    : 0;
  const targetAvg = avgEffectiveTargetForWindow(inputs.targetHistory ?? [], windowStart, windowEnd, inputs.calorieTarget);
  const ratio = overeatRatio(avgCalories, targetAvg);

  const weights = inputs.weights
    .filter(w => inWindow(w.measured_at, windowStart, windowEnd) && Number.isFinite(w.weight_kg) && w.weight_kg > 0)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const weightStart = weights.length ? weights[0].weight_kg : null;
  const weightEnd = weights.length ? weights[weights.length - 1].weight_kg : null;
  const deltaKg = weightStart != null && weightEnd != null && weights.length >= SOLO_MIN_WEIGH_INS
    ? round1(weightEnd - weightStart)
    : null;
  // I03 : durée vraie entre les deux pesées — même taux impossible à durées différentes.
  const weightSpanDays = weights.length >= SOLO_MIN_WEIGH_INS
    ? weightSpanDaysBetween(weights[0].measured_at, weights[weights.length - 1].measured_at)
    : null;
  const pctPerWeek = weeklyWeightPct(deltaKg, weightStart ?? inputs.weightKg, weightSpanDays ?? -1);

  const workouts = (inputs.workouts ?? []).filter(w => w.completed && inWindow(w.date, windowStart, windowEnd)).length;
  const freq = inputs.trainingFrequency > 0 ? inputs.trainingFrequency : 3;
  const expectedWorkouts = Math.round(freq * (SOLO_REVIEW_WINDOW_DAYS / 7));

  const followingPlan = targetAvg > 0
    && loggedDays >= MIN_NUTRITION_LOG_DAYS
    && ratio > UNDER_EAT_RATIO
    && ratio < OVEREAT_RATIO;

  // I04 : signaux déclarés normalisés 0–10 (legacy 1–5 ×2), jamais déduits.
  const windowCheckins = (inputs.checkins ?? []).filter(c => inWindow(c.checked_at, windowStart, windowEnd));
  const fatigueValues: number[] = [];
  const energyValues: number[] = [];
  for (const c of windowCheckins) {
    const legacy = isLegacyFiveScaleCheckin(c);
    const f = scoreOnTen(c.fatigue, legacy);
    const e = scoreOnTen(c.energy_level, legacy);
    if (f != null) fatigueValues.push(f);
    if (e != null) energyValues.push(e);
  }

  return {
    windowStart,
    windowEnd,
    loggedDays,
    avgCalories,
    ratio,
    targetAvg,
    weighIns: weights.length,
    weightStart,
    weightEnd,
    deltaKg,
    weightSpanDays,
    pctPerWeek: pctPerWeek == null ? null : Math.round(pctPerWeek * 100) / 100,
    workouts,
    expectedWorkouts,
    followingPlan,
    avgFatigue: avg(fatigueValues),
    avgEnergy: avg(energyValues),
  };
}

/** The solo is his own coach: a fleet dossier built from his own logs so the fleet rules apply verbatim. */
export function buildSoloDossier(inputs: SoloReviewInputs, evidence: SoloReviewEvidence): CoachFleetDossier {
  const windowCheckins = (inputs.checkins ?? []).filter(c => inWindow(c.checked_at, evidence.windowStart, evidence.windowEnd));
  const adhNutri: number[] = [];
  const adhTrain: number[] = [];
  const sleepValues: number[] = [];
  const soreValues: number[] = [];
  for (const c of windowCheckins) {
    if (c.adherence_nutrition != null && Number.isFinite(c.adherence_nutrition)) adhNutri.push(c.adherence_nutrition);
    if (c.adherence_training != null && Number.isFinite(c.adherence_training)) adhTrain.push(c.adherence_training);
    const legacy = isLegacyFiveScaleCheckin(c);
    const s = scoreOnTen(c.sleep_quality, legacy);
    const so = scoreOnTen(c.muscle_soreness, legacy);
    if (s != null) sleepValues.push(s);
    if (so != null) soreValues.push(so);
  }
  return {
    coach_id: 'self',
    client_id: 'self',
    full_name: '',
    goal: inputs.goal,
    onboarding_completed: true,
    has_program: false,
    setup_completed: true,
    linked_days: SOLO_REVIEW_WINDOW_DAYS,
    training_frequency: inputs.trainingFrequency,
    calorie_target: inputs.calorieTarget,
    protein_target: inputs.proteinTarget,
    carbs_target: inputs.carbsTarget,
    fat_target: inputs.fatTarget,
    weight_kg: evidence.weightEnd ?? inputs.weightKg,
    logged_nutrition_days: evidence.loggedDays,
    avg_calories: evidence.avgCalories,
    last_nutrition_at: null,
    workout_count: evidence.workouts,
    last_workout_at: null,
    checkin_count: windowCheckins.length,
    last_checkin_at: (() => {
      const days = windowCheckins
        .map(c => c.checked_at.slice(0, 10))
        .sort();
      return days[days.length - 1] ?? null;
    })(),
    avg_adherence_nutrition: avg(adhNutri),
    avg_adherence_training: avg(adhTrain),
    weight_start_kg: evidence.weightStart,
    weight_end_kg: evidence.weightEnd,
    weight_delta_kg: evidence.deltaKg,
    weight_span_days: evidence.weightSpanDays,
    avg_effective_target: evidence.targetAvg,
    avg_fatigue: evidence.avgFatigue,
    avg_sleep_quality: avg(sleepValues),
    avg_soreness: avg(soreValues),
    avg_energy: evidence.avgEnergy,
    tracking: { nutrition: true, workouts: true, weight: true, checkins: true },
    is_minor: inputs.isMinor === true,
    has_medical_flags: inputs.hasMedicalFlags === true,
    last_message_at: null,
    last_coach_message_at: null,
    last_keep_in_touch_at: null,
    pending_fleet: false,
    fleet_handled: [],
  };
}

function relanceDetail(evidence: SoloReviewEvidence): SoloRelanceDetail {
  if (evidence.loggedDays < MIN_NUTRITION_LOG_DAYS) return 'few_logs';
  if (evidence.ratio >= OVEREAT_RATIO) return 'over_target';
  return 'under_target';
}

export function computeSoloWeeklyReview(inputs: SoloReviewInputs): SoloWeeklyReview {
  const evidence = buildSoloEvidence(inputs);
  const weekStart = soloReviewWeekStart(inputs.today);
  const currentCalories = Math.round(inputs.calorieTarget) || 0;
  if (inputs.calorieTarget <= 0 || evidence.weighIns < SOLO_MIN_WEIGH_INS) {
    return {
      weekStart,
      status: 'insufficient',
      currentCalories,
      proposal: { action: 'keep', reason: 'keep', draft: null },
      evidence,
      relanceDetail: null,
    };
  }
  const proposal = proposeWeeklyNutrition(buildSoloDossier(inputs, evidence));
  return {
    weekStart,
    status: 'ready',
    currentCalories,
    proposal,
    evidence,
    relanceDetail: proposal.action === 'relance' ? relanceDetail(evidence) : null,
  };
}

/** i18n key of the sentence the copilot shows — the « why », never a bare number. */
export function soloReviewMessageKey(review: SoloWeeklyReview): string {
  if (review.status === 'insufficient') return 'soloReview.insufficient';
  const { proposal } = review;
  // I04 : profil protégé — accompagnement général, pas d'injonction chiffrée.
  if (proposal.guarded) return 'soloReview.guarded';
  if (proposal.action === 'relance') return `soloReview.relance.${review.relanceDetail ?? 'few_logs'}`;
  return weeklyNutritionWhyKey(proposal.reason, 'self') ?? 'soloReview.keep';
}

/** Has any signal at all? Below this the card stays silent instead of nagging an empty account. */
export function soloReviewHasAnyData(evidence: SoloReviewEvidence): boolean {
  return evidence.loggedDays > 0 || evidence.weighIns > 0;
}
