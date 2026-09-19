/**
 * P2.2 — universal weekly review engine (docs/VISION.md §8.2–8.4).
 * Shared by the app and Deno `coach-fleet-round`. No I/O.
 * Wait is valid. Weak signals wait. Nothing is auto-applied.
 * Confidence is idempotent on the same evidence fingerprint (metrics only).
 * Window dates alone must not raise confidence.
 */

import {
  isContextCorrectionHeld,
  isProposalSuppressed,
  isWatchProposalSettled,
  type ProposalMemoryDecision,
} from "./proposalMemory.ts";

export const WEEKLY_REVIEW_WINDOW_DAYS = 14;
const MIN_NUTRITION_LOG_DAYS = 4;
const MIN_WEIGH_INS = 2;
const OVEREAT_RATIO = 1.15;
const UNDER_EAT_RATIO = 0.85;
const CUT_STALL_MIN_DELTA_KG = -0.2;
const CUT_GAIN_MIN_DELTA_KG = 0.3;
const CUT_TOO_FAST_PCT_PER_WEEK = 1.5;
const BULK_TOO_FAST_PCT_PER_WEEK = 0.7;
const FATIGUE_DECLARED_MIN = 7;
const ENERGY_DECLARED_MAX = 3;
const WEEKLY_SMALL_KCAL = 100;
const WEEKLY_LARGE_KCAL = 200;

export type EngineSignalDomain = "training" | "nutrition" | "recovery" | "weight" | "goal" | "adherence";
export type EngineSignalConfidence = "low" | "medium" | "high";
export type EngineSignalOpenStatus = "open" | "waiting";
export type EngineSignalStatus = EngineSignalOpenStatus | "resolved" | "not_relevant";

export interface EngineEvidenceItem {
  kind: string;
  summary: string;
  at?: string;
}

export interface EngineSignal {
  id: string;
  athlete_id?: string;
  domain: EngineSignalDomain;
  type: string;
  hypothesis: string;
  evidence_for: EngineEvidenceItem[];
  evidence_against: EngineEvidenceItem[];
  confidence: EngineSignalConfidence;
  status: EngineSignalStatus;
}

export interface WeeklyReviewTracking {
  nutrition: boolean;
  workouts: boolean;
  weight: boolean;
  checkins: boolean;
}

export interface WeeklyReviewAggregates {
  windowStart: string;
  windowEnd: string;
  loggedNutritionDays: number;
  avgCalories: number;
  calorieTarget: number;
  workoutCount: number;
  expectedWorkouts: number;
  weighIns: number;
  weightDeltaKg: number | null;
  weightStartKg: number | null;
  weightSpanDays: number | null;
  checkinCount: number;
  avgFatigue: number | null;
  avgEnergy: number | null;
  goal: string;
}

export type WeeklyReviewDecision = "wait" | "request_info" | "propose" | "close";
export type WeeklyReviewAuthority = "athlete" | "coach";
export type WeeklyReviewDataQuality = "insufficient" | "sparse" | "adequate";

export interface WeeklyReviewInput {
  athleteId: string;
  today: string;
  identity: "solo" | "coached";
  tracking: WeeklyReviewTracking;
  aggregates: WeeklyReviewAggregates;
  existingSignals: EngineSignal[];
  recentDecisions?: ProposalMemoryDecision[];
  guarded?: boolean;
}

export interface WeeklyReviewSignalAction {
  op: "upsert" | "resolve";
  domain?: EngineSignalDomain;
  type?: string;
  hypothesis?: string;
  evidenceFor?: EngineEvidenceItem[];
  evidenceAgainst?: EngineEvidenceItem[];
  confidence?: EngineSignalConfidence;
  status?: EngineSignalOpenStatus | "resolved" | "not_relevant";
  reason?: string;
  id?: string;
  nextReviewAt?: string | null;
  /** Concrete Solo/fleet proposal judged by P2.5. Absent when the row is not decidable. */
  proposal?: WatchProposalSnapshot;
}

export interface WatchProposalSnapshot {
  kind: string;
  action: string;
  reason?: string;
  domain: string;
  type: string;
  flag?: string;
  week_start: string;
  draft?: { calories: number };
}

export interface WeeklyReviewResult {
  weekStart: string;
  authority: WeeklyReviewAuthority;
  dataQuality: WeeklyReviewDataQuality;
  decision: WeeklyReviewDecision;
  summary: string;
  signalActions: WeeklyReviewSignalAction[];
  aggregates: WeeklyReviewAggregates;
  tracking: WeeklyReviewTracking;
}

export interface WeeklyReviewFleetLike {
  client_id: string;
  goal: string;
  training_frequency: number;
  calorie_target: number;
  avg_effective_target?: number;
  logged_nutrition_days: number;
  avg_calories: number;
  workout_count: number;
  checkin_count: number;
  weight_delta_kg: number | null;
  weight_start_kg?: number | null;
  weight_end_kg?: number | null;
  weight_kg: number;
  weight_span_days?: number | null;
  avg_fatigue?: number | null;
  avg_energy?: number | null;
  weigh_ins?: number | null;
  tracking?: WeeklyReviewTracking;
  is_minor?: boolean;
  has_medical_flags?: boolean;
}

const ALL_TRACKING: WeeklyReviewTracking = {
  nutrition: true,
  workouts: true,
  weight: true,
  checkins: true,
};

const ENGINE_SPECS: Array<{
  domain: EngineSignalDomain;
  type: string;
  module: keyof WeeklyReviewTracking;
  dataSufficient: (agg: WeeklyReviewAggregates) => boolean;
}> = [
  {
    domain: "adherence",
    type: "sparse_nutrition",
    module: "nutrition",
    dataSufficient: () => true,
  },
  {
    domain: "nutrition",
    type: "not_following",
    module: "nutrition",
    dataSufficient: (agg) => agg.loggedNutritionDays >= MIN_NUTRITION_LOG_DAYS && agg.calorieTarget > 0,
  },
  {
    domain: "training",
    type: "missed_sessions",
    module: "workouts",
    dataSufficient: (agg) => agg.expectedWorkouts > 0,
  },
  {
    domain: "weight",
    type: "too_fast",
    module: "weight",
    dataSufficient: (agg) => agg.weighIns >= MIN_WEIGH_INS && agg.weightDeltaKg != null,
  },
  {
    domain: "weight",
    type: "stall",
    module: "weight",
    dataSufficient: (agg) => agg.weighIns >= MIN_WEIGH_INS && agg.weightDeltaKg != null,
  },
  {
    domain: "recovery",
    type: "fatigue",
    module: "checkins",
    dataSufficient: (agg) => agg.avgFatigue != null || agg.avgEnergy != null,
  },
];

export function isoWeekStart(today: string): string {
  const ms = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(ms)) return today;
  const day = new Date(ms).getUTCDay();
  const back = (day + 6) % 7;
  const start = new Date(ms);
  start.setUTCDate(start.getUTCDate() - back);
  return start.toISOString().slice(0, 10);
}

export function addUtcDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function trackingOf(input: WeeklyReviewTracking | undefined): WeeklyReviewTracking {
  if (!input) return { ...ALL_TRACKING };
  return {
    nutrition: input.nutrition !== false,
    workouts: input.workouts !== false,
    weight: input.weight !== false,
    checkins: input.checkins !== false,
  };
}

function normalizeGoal(goal: string): "cut" | "bulk" | "maintain" | "" {
  const g = goal.trim().toLowerCase();
  if (g === "cut" || g === "lose" || g === "fat_loss" || g === "weight_loss") return "cut";
  if (g === "bulk" || g === "gain" || g === "muscle") return "bulk";
  if (g === "maintain" || g === "recomp") return "maintain";
  return "";
}

function overeatRatio(avgCalories: number, calorieTarget: number): number {
  if (calorieTarget <= 0 || avgCalories <= 0) return 0;
  return avgCalories / calorieTarget;
}

function weeklyWeightPct(
  deltaKg: number | null,
  startKg: number | null,
  spanDays: number | null,
): number | null {
  if (deltaKg == null || startKg == null || startKg <= 0) return null;
  const span = spanDays ?? WEEKLY_REVIEW_WINDOW_DAYS;
  if (!Number.isFinite(span) || span < 1) return null;
  return (deltaKg / startKg) * 100 / (span / 7);
}

function isOpenStatus(status: string): status is EngineSignalOpenStatus {
  return status === "open" || status === "waiting";
}

function findOpen(
  signals: EngineSignal[],
  domain: EngineSignalDomain,
  type: string,
): EngineSignal | null {
  return signals.find((row) => (
    row.domain === domain
    && row.type === type
    && isOpenStatus(row.status)
  )) ?? null;
}

function evidence(kind: string, summary: string): EngineEvidenceItem {
  return { kind, summary };
}

const FINGERPRINT_WINDOW_KEYS = new Set(["window_start", "window_end"]);

export function normalizeFingerprint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (FINGERPRINT_WINDOW_KEYS.has(key)) continue;
      out[key] = value;
    }
    return JSON.stringify(out);
  } catch {
    return raw;
  }
}

export function evidenceFingerprint(
  domain: string,
  type: string,
  agg: WeeklyReviewAggregates,
): string {
  let metrics: Record<string, unknown>;
  if (domain === "training" || type === "missed_sessions" || type === "program_adjustment") {
    metrics = { workout_count: agg.workoutCount, expected_workouts: agg.expectedWorkouts };
  } else if (domain === "weight" || type === "stall" || type === "too_fast") {
    metrics = {
      weigh_ins: agg.weighIns,
      weight_delta_kg: agg.weightDeltaKg,
      weight_start_kg: agg.weightStartKg,
    };
  } else if (domain === "recovery" || type === "fatigue") {
    metrics = {
      avg_fatigue: agg.avgFatigue,
      avg_energy: agg.avgEnergy,
      checkin_count: agg.checkinCount,
    };
  } else {
    metrics = {
      logged_nutrition_days: agg.loggedNutritionDays,
      avg_calories: agg.avgCalories,
      calorie_target: agg.calorieTarget,
    };
  }
  return JSON.stringify(metrics);
}

export function fingerprintFromEvidence(items: EngineEvidenceItem[] | undefined): string | null {
  const row = (items ?? []).find((item) => item.kind === "fingerprint");
  return row?.summary ?? null;
}

export function nextSignalConfidence(
  prev: EngineSignal | null,
  supported: boolean,
  fingerprint: string,
): EngineSignalConfidence {
  if (!supported) return prev?.confidence ?? "low";
  if (!prev) return "low";
  const previous = normalizeFingerprint(fingerprintFromEvidence(prev.evidence_for));
  const current = normalizeFingerprint(fingerprint);
  if (!previous || previous === current) return prev.confidence;
  if (prev.confidence === "low") return "medium";
  return "high";
}

function withFingerprint(
  items: EngineEvidenceItem[],
  fingerprint: string,
  windowStart: string,
  windowEnd: string,
): EngineEvidenceItem[] {
  return [
    evidence("window", `${windowStart}..${windowEnd}`),
    evidence("fingerprint", fingerprint),
    ...items.filter((item) => item.kind !== "fingerprint" && item.kind !== "window"),
  ];
}

function findSpec(domain: string, type: string) {
  return ENGINE_SPECS.find((row) => row.domain === domain && row.type === type) ?? null;
}

function evaluateQuality(
  tracking: WeeklyReviewTracking,
  agg: WeeklyReviewAggregates,
): WeeklyReviewDataQuality {
  const judged: Array<{ on: boolean; hasAny: boolean; sparse: boolean }> = [
    {
      on: tracking.nutrition,
      hasAny: agg.loggedNutritionDays > 0,
      sparse: agg.loggedNutritionDays > 0 && agg.loggedNutritionDays < MIN_NUTRITION_LOG_DAYS,
    },
    {
      on: tracking.workouts,
      hasAny: agg.workoutCount > 0,
      sparse: false,
    },
    {
      on: tracking.weight,
      hasAny: agg.weighIns > 0,
      sparse: agg.weighIns > 0 && agg.weighIns < MIN_WEIGH_INS,
    },
  ];
  const enabled = judged.filter((row) => row.on);
  if (enabled.length === 0) {
    return tracking.checkins && agg.checkinCount > 0 ? "adequate" : "insufficient";
  }
  if (enabled.every((row) => !row.hasAny)) return "insufficient";
  if (enabled.some((row) => row.sparse || !row.hasAny)) return "sparse";
  return "adequate";
}

interface Candidate {
  domain: EngineSignalDomain;
  type: string;
  hypothesis: string;
  for: EngineEvidenceItem[];
  against: EngineEvidenceItem[];
  supported: boolean;
  waiting: boolean;
  proposeWorthy: boolean;
}

function collectCandidates(input: WeeklyReviewInput): Candidate[] {
  const { tracking, aggregates: agg } = input;
  const out: Candidate[] = [];
  const goal = normalizeGoal(agg.goal);
  const span = agg.weightSpanDays ?? WEEKLY_REVIEW_WINDOW_DAYS;
  const pct = weeklyWeightPct(agg.weightDeltaKg, agg.weightStartKg, span);
  const ratio = overeatRatio(agg.avgCalories, agg.calorieTarget);

  if (tracking.nutrition && agg.loggedNutritionDays > 0 && agg.loggedNutritionDays < MIN_NUTRITION_LOG_DAYS) {
    out.push({
      domain: "adherence",
      type: "sparse_nutrition",
      hypothesis: "Pas assez de jours nutrition loggés pour juger la semaine",
      for: [evidence("nutrition", `${agg.loggedNutritionDays} jour(s) loggés / ${MIN_NUTRITION_LOG_DAYS} requis`)],
      against: [],
      supported: true,
      waiting: true,
      proposeWorthy: false,
    });
  }

  if (
    tracking.nutrition
    && agg.loggedNutritionDays >= MIN_NUTRITION_LOG_DAYS
    && agg.calorieTarget > 0
    && (ratio >= OVEREAT_RATIO || (ratio > 0 && ratio <= UNDER_EAT_RATIO))
  ) {
    const side = ratio >= OVEREAT_RATIO ? "au-dessus" : "en-dessous";
    out.push({
      domain: "nutrition",
      type: "not_following",
      hypothesis: `Apports souvent ${side} de la cible effective`,
      for: [evidence("nutrition", `moyenne ${agg.avgCalories} kcal vs cible ${agg.calorieTarget}`)],
      against: [],
      supported: true,
      waiting: false,
      proposeWorthy: true,
    });
  }

  if (tracking.workouts && agg.expectedWorkouts > 0) {
    const missed = agg.workoutCount <= Math.max(0, Math.floor(agg.expectedWorkouts * 0.4));
    if (missed) {
      out.push({
        domain: "training",
        type: "missed_sessions",
        hypothesis: "Moins de séances loggées que prévu sur la fenêtre",
        for: [evidence("workouts", `${agg.workoutCount} séance(s) / ${agg.expectedWorkouts} attendues`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    }
  }

  if (tracking.weight && agg.weighIns >= MIN_WEIGH_INS && agg.weightDeltaKg != null) {
    const tooFast = (goal === "cut" && pct != null && pct <= -CUT_TOO_FAST_PCT_PER_WEEK)
      || (goal === "bulk" && pct != null && pct >= BULK_TOO_FAST_PCT_PER_WEEK);
    const stall = (goal === "cut" && agg.weightDeltaKg >= CUT_STALL_MIN_DELTA_KG)
      || (goal === "bulk" && agg.weightDeltaKg <= 0.1)
      || (goal === "maintain" && Math.abs(agg.weightDeltaKg) >= 1.5);
    if (tooFast) {
      out.push({
        domain: "weight",
        type: "too_fast",
        hypothesis: "Trajectoire de poids trop rapide pour l’objectif",
        for: [evidence("weight", `delta ${agg.weightDeltaKg} kg`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    } else if (stall) {
      out.push({
        domain: "weight",
        type: "stall",
        hypothesis: "Trajectoire de poids éloignée de l’objectif",
        for: [evidence("weight", `delta ${agg.weightDeltaKg} kg`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    }
  }

  if (tracking.checkins) {
    const fatigue = agg.avgFatigue != null && agg.avgFatigue >= FATIGUE_DECLARED_MIN;
    const lowEnergy = agg.avgEnergy != null && agg.avgEnergy <= ENERGY_DECLARED_MAX;
    if (fatigue || lowEnergy) {
      out.push({
        domain: "recovery",
        type: "fatigue",
        hypothesis: "Fatigue ou énergie basse déclarée en check-in",
        for: [evidence("checkins", `fatigue ${agg.avgFatigue ?? "n/a"} / énergie ${agg.avgEnergy ?? "n/a"}`)],
        against: [],
        supported: true,
        waiting: false,
        proposeWorthy: true,
      });
    }
  }

  return out;
}

function snapshotWatchProposal(
  candidate: Candidate,
  agg: WeeklyReviewAggregates,
  weekStart: string,
): WatchProposalSnapshot | null {
  const domain = candidate.domain;
  const type = candidate.type;
  const goal = normalizeGoal(agg.goal);
  const base = Math.round(agg.calorieTarget);
  const draftOf = (calories: number | null): { calories: number } | undefined =>
    calories != null && calories > 0 ? { calories } : undefined;

  if (domain === "training" && type === "missed_sessions") {
    return {
      kind: "adherence_training",
      action: "relance",
      domain,
      type,
      flag: "adherence_training",
      week_start: weekStart,
    };
  }
  if (domain === "nutrition" && type === "not_following") {
    return {
      kind: "adherence_nutrition",
      action: "relance",
      reason: "not_following",
      domain,
      type,
      flag: "adherence_nutrition",
      week_start: weekStart,
    };
  }
  if (domain === "adherence" && type === "sparse_nutrition") {
    return {
      kind: "adherence_nutrition",
      action: "relance",
      reason: "sparse",
      domain,
      type,
      flag: "adherence_nutrition",
      week_start: weekStart,
    };
  }
  if (domain === "weight" && type === "too_fast") {
    const calories = goal === "bulk" ? base - WEEKLY_SMALL_KCAL : base + WEEKLY_SMALL_KCAL;
    return {
      kind: "calorie_adjustment",
      action: "calorie_adjustment",
      reason: goal === "bulk" ? "bulk_too_fast" : "too_fast_cut",
      domain,
      type,
      flag: "too_fast",
      week_start: weekStart,
      draft: draftOf(calories),
    };
  }
  if (domain === "weight" && type === "stall") {
    const gain = goal === "cut" && agg.weightDeltaKg != null && agg.weightDeltaKg >= CUT_GAIN_MIN_DELTA_KG;
    const calories = goal === "bulk"
      ? base + WEEKLY_SMALL_KCAL
      : gain
        ? base - WEEKLY_LARGE_KCAL
        : base - WEEKLY_SMALL_KCAL;
    return {
      kind: "calorie_adjustment",
      action: "calorie_adjustment",
      reason: goal === "bulk" ? "bulk_stall" : gain ? "cut_gain" : "cut_stall",
      domain,
      type,
      flag: "stall_adherent",
      week_start: weekStart,
      draft: draftOf(calories),
    };
  }
  if (domain === "recovery" && type === "fatigue") {
    return {
      kind: "calorie_adjustment",
      action: "calorie_adjustment",
      reason: "carb_support",
      domain,
      type,
      flag: "carb_support",
      week_start: weekStart,
      draft: draftOf(base),
    };
  }
  return null;
}

function summaryFor(
  authority: WeeklyReviewAuthority,
  decision: WeeklyReviewDecision,
  dataQuality: WeeklyReviewDataQuality,
  suppressed = false,
): string {
  if (suppressed && decision === "wait") {
    return authority === "coach"
      ? "Une proposition récente a été refusée ou ignorée. Pas de nouvelle proposition tant que les preuves n’ont pas changé."
      : "Une proposition récente a été refusée. Prometheus attend un nouvel élément. Rien n’a été appliqué.";
  }
  if (authority === "coach") {
    if (decision === "wait") {
      return dataQuality === "adequate"
        ? "Aucun changement à proposer pour l’athlète cette semaine."
        : "Signal trop faible : attendre davantage de données. Rien n’a été appliqué.";
    }
    if (decision === "request_info") {
      return "Demander plus de données suivies avant de proposer un changement.";
    }
    if (decision === "propose") {
      return "Une proposition est prête à valider. Rien n’a été appliqué.";
    }
    return "Un signal du dossier n’est plus soutenu ; clôturé. Rien n’a été appliqué.";
  }
  if (decision === "wait") {
    return dataQuality === "adequate"
      ? "Cette semaine, aucune modification n’est nécessaire."
      : "Le signal est encore trop faible : Prometheus attend. Rien n’a été appliqué.";
  }
  if (decision === "request_info") {
    return "Il manque encore des données suivies pour juger cette semaine.";
  }
  if (decision === "propose") {
    return "Une piste est prête à examiner. Rien n’a été appliqué.";
  }
  return "Un signal n’est plus soutenu par les données de la semaine.";
}

export function weeklyReviewInputFromFleet(
  dossier: WeeklyReviewFleetLike,
  today: string,
  existingSignals: EngineSignal[] = [],
  recentDecisions: ProposalMemoryDecision[] = [],
  identity: "solo" | "coached" = "coached",
): WeeklyReviewInput {
  const tracking = trackingOf(dossier.tracking);
  const target = dossier.avg_effective_target && dossier.avg_effective_target > 0
    ? Math.round(dossier.avg_effective_target)
    : Math.round(dossier.calorie_target);
  const freq = dossier.training_frequency > 0 ? dossier.training_frequency : 3;
  const expectedWorkouts = Math.round(freq * (WEEKLY_REVIEW_WINDOW_DAYS / 7));
  const hasWeightPair = dossier.weight_delta_kg != null
    || (dossier.weight_start_kg != null && (dossier.weight_end_kg != null || dossier.weight_kg > 0));
  const weighIns = dossier.weigh_ins != null && dossier.weigh_ins > 0
    ? dossier.weigh_ins
    : hasWeightPair ? MIN_WEIGH_INS : 0;
  return {
    athleteId: dossier.client_id,
    today,
    identity,
    tracking,
    guarded: dossier.is_minor === true || dossier.has_medical_flags === true,
    existingSignals,
    recentDecisions,
    aggregates: {
      windowStart: addUtcDays(today, -(WEEKLY_REVIEW_WINDOW_DAYS - 1)),
      windowEnd: today,
      loggedNutritionDays: dossier.logged_nutrition_days,
      avgCalories: Math.round(dossier.avg_calories),
      calorieTarget: target,
      workoutCount: dossier.workout_count,
      expectedWorkouts,
      weighIns,
      weightDeltaKg: dossier.weight_delta_kg,
      weightStartKg: dossier.weight_start_kg ?? dossier.weight_kg,
      weightSpanDays: dossier.weight_span_days ?? WEEKLY_REVIEW_WINDOW_DAYS,
      checkinCount: dossier.checkin_count,
      avgFatigue: dossier.avg_fatigue ?? null,
      avgEnergy: dossier.avg_energy ?? null,
      goal: dossier.goal,
    },
  };
}

export function runAthleteWeeklyReview(input: WeeklyReviewInput): WeeklyReviewResult {
  const tracking = trackingOf(input.tracking);
  const weekStart = isoWeekStart(input.today);
  const nextReviewAt = `${addUtcDays(weekStart, 7)}T00:00:00.000Z`;
  const authority: WeeklyReviewAuthority = input.identity === "coached" ? "coach" : "athlete";
  const dataQuality = evaluateQuality(tracking, input.aggregates);
  const candidates = collectCandidates({ ...input, tracking });
  const watched = new Set(candidates.map((row) => `${row.domain}:${row.type}`));
  const actions: WeeklyReviewSignalAction[] = [];
  let closed = 0;
  let upsertedWaiting = 0;
  let upsertedOpen = 0;
  let proposeWorthyOpen = 0;
  let suppressedPropose = 0;
  const recentDecisions = input.recentDecisions ?? [];

  for (const candidate of candidates) {
    if (isContextCorrectionHeld(recentDecisions, candidate.domain, candidate.type, input.aggregates)) {
      watched.add(`${candidate.domain}:${candidate.type}`);
      continue;
    }
    const prev = findOpen(input.existingSignals, candidate.domain, candidate.type);
    const fingerprint = evidenceFingerprint(candidate.domain, candidate.type, input.aggregates);
    const confidence = nextSignalConfidence(prev, candidate.supported, fingerprint);
    const status: EngineSignalOpenStatus = candidate.waiting ? "waiting" : "open";
    if (status === "waiting") upsertedWaiting += 1;
    else upsertedOpen += 1;
    if (candidate.proposeWorthy && status === "open" && (confidence === "medium" || confidence === "high")) {
      if (
        isProposalSuppressed(recentDecisions, candidate.domain, candidate.type, input.aggregates)
        || isWatchProposalSettled(recentDecisions, candidate.domain, candidate.type, input.aggregates)
      ) {
        suppressedPropose += 1;
      } else {
        proposeWorthyOpen += 1;
      }
    }
    const decidable = candidate.proposeWorthy
      && status === "open"
      && (confidence === "medium" || confidence === "high")
      && !isProposalSuppressed(recentDecisions, candidate.domain, candidate.type, input.aggregates)
      && !isWatchProposalSettled(recentDecisions, candidate.domain, candidate.type, input.aggregates);
    const action: WeeklyReviewSignalAction = {
      op: "upsert",
      domain: candidate.domain,
      type: candidate.type,
      hypothesis: candidate.hypothesis,
      evidenceFor: withFingerprint(candidate.for, fingerprint, input.aggregates.windowStart, input.aggregates.windowEnd),
      evidenceAgainst: candidate.against,
      confidence,
      status,
      nextReviewAt,
    };
    if (decidable) {
      const snapshot = snapshotWatchProposal(candidate, input.aggregates, weekStart);
      if (snapshot) action.proposal = snapshot;
    }
    actions.push(action);
  }

  for (const signal of input.existingSignals) {
    if (!isOpenStatus(signal.status)) continue;
    if (watched.has(`${signal.domain}:${signal.type}`)) continue;
    const spec = findSpec(signal.domain, signal.type);
    if (!spec) continue;
    if (!tracking[spec.module]) {
      actions.push({
        op: "resolve",
        id: signal.id,
        status: "not_relevant",
        reason: "Module de suivi désactivé",
      });
      closed += 1;
      continue;
    }
    if (!spec.dataSufficient(input.aggregates)) {
      const fingerprint = evidenceFingerprint(signal.domain, signal.type, input.aggregates);
      upsertedWaiting += 1;
      actions.push({
        op: "upsert",
        domain: signal.domain,
        type: signal.type,
        hypothesis: signal.hypothesis,
        evidenceFor: withFingerprint(
          [evidence("waiting", "Données insuffisantes — pas de conclusion d’amélioration")],
          fingerprint,
          input.aggregates.windowStart,
          input.aggregates.windowEnd,
        ),
        evidenceAgainst: signal.evidence_against ?? [],
        confidence: signal.confidence,
        status: "waiting",
        nextReviewAt,
      });
      continue;
    }
    actions.push({
      op: "resolve",
      id: signal.id,
      status: "resolved",
      reason: "Observations suffisantes : le problème n’est plus présent",
    });
    closed += 1;
  }

  let decision: WeeklyReviewDecision;
  if (dataQuality === "insufficient" || (dataQuality === "sparse" && proposeWorthyOpen === 0)) {
    decision = "request_info";
  } else if (input.guarded) {
    decision = closed > 0 && proposeWorthyOpen === 0 ? "close" : "wait";
  } else if (proposeWorthyOpen > 0) {
    decision = "propose";
  } else if (closed > 0 && upsertedOpen === 0 && upsertedWaiting === 0) {
    decision = "close";
  } else {
    decision = "wait";
  }

  return {
    weekStart,
    authority,
    dataQuality,
    decision,
    summary: summaryFor(authority, decision, dataQuality, suppressedPropose > 0),
    signalActions: actions,
    aggregates: input.aggregates,
    tracking,
  };
}

export function weeklyReviewActionsToRpcPayload(actions: WeeklyReviewSignalAction[]): unknown[] {
  return actions.map((action) => {
    if (action.op === "resolve") {
      return {
        op: "resolve",
        id: action.id,
        status: action.status,
        reason: action.reason ?? null,
      };
    }
    return {
      op: "upsert",
      domain: action.domain,
      type: action.type,
      hypothesis: action.hypothesis,
      evidence_for: action.evidenceFor ?? [],
      evidence_against: action.evidenceAgainst ?? [],
      confidence: action.confidence ?? "low",
      status: action.status ?? "open",
      next_review_at: action.nextReviewAt ?? null,
      ...(action.proposal ? { proposal: action.proposal } : {}),
    };
  });
}

export function weeklyReviewSaveArgs(athleteId: string, review: WeeklyReviewResult) {
  return {
    p_athlete_id: athleteId,
    p_week_start: review.weekStart,
    p_data_quality: review.dataQuality,
    p_decision: review.decision,
    p_summary: review.summary,
    p_aggregates: {
      window_start: review.aggregates.windowStart,
      window_end: review.aggregates.windowEnd,
      logged_nutrition_days: review.aggregates.loggedNutritionDays,
      avg_calories: review.aggregates.avgCalories,
      calorie_target: review.aggregates.calorieTarget,
      workout_count: review.aggregates.workoutCount,
      expected_workouts: review.aggregates.expectedWorkouts,
      weigh_ins: review.aggregates.weighIns,
      weight_delta_kg: review.aggregates.weightDeltaKg,
      weight_start_kg: review.aggregates.weightStartKg,
      weight_span_days: review.aggregates.weightSpanDays,
      checkin_count: review.aggregates.checkinCount,
      avg_fatigue: review.aggregates.avgFatigue,
      avg_energy: review.aggregates.avgEnergy,
      goal: review.aggregates.goal,
    },
    p_tracking: review.tracking,
    p_signal_actions: weeklyReviewActionsToRpcPayload(review.signalActions),
  };
}
