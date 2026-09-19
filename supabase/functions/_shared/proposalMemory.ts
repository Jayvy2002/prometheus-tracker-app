/**
 * Pure helpers shared by the app (P2.3 journal) and Deno `coach-fleet-round`.
 * Semantic proposal keys + relevant-evidence comparison. No I/O.
 */

export const DECISION_EVIDENCE_KCAL_DELTA = 150;
export const DECISION_EVIDENCE_WORKOUT_DELTA = 2;
export const DECISION_EVIDENCE_LOG_DAYS_DELTA = 3;
export const DECISION_EVIDENCE_WEIGHT_DELTA_KG = 0.4;

export const ATHLETE_HUMAN_DECISIONS = ["accepted", "modified", "refused", "ignored", "corrected"] as const;
export type AthleteHumanDecision = (typeof ATHLETE_HUMAN_DECISIONS)[number];

export const ATHLETE_DECISION_ACTOR_ROLES = ["athlete", "coach"] as const;
export const ATHLETE_SIGNAL_DOMAINS = [
  "training",
  "nutrition",
  "recovery",
  "weight",
  "goal",
  "adherence",
] as const;
export type AthleteSignalDomain = (typeof ATHLETE_SIGNAL_DOMAINS)[number];

export interface ProposalMemoryDecision {
  domain: string;
  type: string;
  decision: string;
  data_used: Record<string, unknown>;
  created_at: string;
  source?: string | null;
}

export interface ProposalEvidenceSnapshot {
  avgCalories: number;
  calorieTarget: number;
  workoutCount: number;
  loggedNutritionDays: number;
  weightDeltaKg: number | null;
  expectedWorkouts?: number;
  weighIns?: number;
  avgFatigue?: number | null;
  avgEnergy?: number | null;
  windowStart?: string;
  windowEnd?: string;
  goal?: string;
  proteinTarget?: number;
  carbsTarget?: number;
  fatTarget?: number;
  weightKg?: number;
  weightStartKg?: number | null;
  guarded?: boolean;
}

export type EvidenceScope = "nutrition" | "training" | "weight" | "recovery";

export function isAthleteHumanDecision(value: string): value is AthleteHumanDecision {
  return (ATHLETE_HUMAN_DECISIONS as readonly string[]).includes(value);
}

export function mapSoloReviewDecision(decision: "accepted" | "kept" | "dismissed"): AthleteHumanDecision {
  if (decision === "accepted") return "accepted";
  if (decision === "kept") return "ignored";
  return "refused";
}

const ROUTING_KEYS = new Set(["assign_client_id", "for_client_id", "client_id", "coach_id"]);

function stripRouting(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(stripRouting);
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (ROUTING_KEYS.has(key)) continue;
    out[key] = stripRouting(nested);
  }
  return out;
}

export function effectsAreMaterial(effects: Record<string, unknown> | null | undefined): boolean {
  if (!effects) return false;
  const stripped = stripRouting(effects) as Record<string, unknown>;
  for (const value of Object.values(stripped)) {
    if (value == null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      if (Object.keys(value as object).length === 0) continue;
      return true;
    }
    if (Array.isArray(value) && value.length === 0) continue;
    if (value === "" || value === false) continue;
    return true;
  }
  return false;
}

export function mapInterventionDecision(
  status: "sent" | "kept" | "dismissed",
  edited: boolean,
  hasAppliedEffect = false,
): AthleteHumanDecision {
  if (status === "dismissed") return "refused";
  if (status === "kept") {
    if (hasAppliedEffect) return edited ? "modified" : "accepted";
    return "ignored";
  }
  return edited ? "modified" : "accepted";
}

export function mapSoloProposalTarget(
  action: string,
  reason: string,
): { domain: AthleteSignalDomain; type: string } {
  if (action === "relance") return { domain: "adherence", type: "sparse_nutrition" };
  if (reason === "not_following") return { domain: "nutrition", type: "not_following" };
  if (reason === "cut_stall" || reason === "cut_gain" || reason === "bulk_stall") {
    return { domain: "weight", type: "stall" };
  }
  if (reason === "too_fast_cut" || reason === "bulk_too_fast") {
    return { domain: "weight", type: "too_fast" };
  }
  if (reason === "carb_support") return { domain: "recovery", type: "fatigue" };
  if (action === "calorie_adjustment") return { domain: "nutrition", type: "not_following" };
  return { domain: "nutrition", type: "keep" };
}

/** Semantic key: subject + cause. `hint` is a fleet flag or Solo reason. */
export function mapInterventionKind(
  kind: string,
  hint = "",
): { domain: AthleteSignalDomain; type: string } {
  const reason = hint.trim().toLowerCase();
  if (kind === "program_adjustment") return { domain: "training", type: "program_adjustment" };
  if (kind === "adherence_training") return { domain: "training", type: "missed_sessions" };
  if (kind === "adherence_nutrition") return { domain: "nutrition", type: "not_following" };
  if (kind === "calorie_adjustment") {
    if (reason.includes("too_fast")) return { domain: "weight", type: "too_fast" };
    if (
      reason.includes("stall")
      || reason.includes("cut_gain")
      || reason.includes("bulk_stall")
    ) {
      return { domain: "weight", type: "stall" };
    }
    if (reason.includes("carb")) return { domain: "recovery", type: "fatigue" };
    if (reason === "not_following" || reason.includes("adherence")) {
      return { domain: "nutrition", type: "not_following" };
    }
    return { domain: "nutrition", type: "not_following" };
  }
  if (kind === "keep_in_touch") return { domain: "adherence", type: "keep_in_touch" };
  if (kind === "onboarding_plan") return { domain: "goal", type: "onboarding" };
  if ((ATHLETE_SIGNAL_DOMAINS as readonly string[]).includes(kind)) {
    return { domain: kind as AthleteSignalDomain, type: kind };
  }
  return { domain: "goal", type: kind || "other" };
}

export function latestAthleteDecision(
  rows: ProposalMemoryDecision[],
  domain: string,
  type: string,
): ProposalMemoryDecision | null {
  let best: ProposalMemoryDecision | null = null;
  for (const row of rows) {
    if (row.domain !== domain || row.type !== type) continue;
    if (!best || row.created_at > best.created_at) best = row;
  }
  return best;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function compactEvidence(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

export function evidenceFromProposalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.evidence && typeof payload.evidence === "object" && !Array.isArray(payload.evidence)
    ? payload.evidence as Record<string, unknown>
    : {};
  return compactEvidence({
    avg_calories: payload.avg_calories ?? nested.avg_calories,
    calorie_target: payload.target_avg_kcal ?? payload.calorie_target ?? nested.target_avg_kcal ?? nested.calorie_target,
    workout_count: payload.workout_count ?? nested.workout_count,
    logged_nutrition_days: payload.logged_nutrition_days ?? nested.logged_nutrition_days,
    weight_delta_kg: payload.weight_delta_kg ?? nested.weight_delta_kg,
    expected_workouts: payload.expected_workouts ?? nested.expected_workouts,
    weigh_ins: payload.weigh_ins ?? nested.weigh_ins,
    avg_fatigue: payload.avg_fatigue ?? nested.avg_fatigue,
    avg_energy: payload.avg_energy ?? nested.avg_energy,
    window_start: payload.window_start ?? nested.window_start,
    window_end: payload.window_end ?? nested.window_end,
    goal: payload.goal ?? nested.goal,
    protein_target: payload.protein_target ?? nested.protein_target,
    carbs_target: payload.carbs_target ?? nested.carbs_target,
    fat_target: payload.fat_target ?? nested.fat_target,
    weight_kg: payload.weight_kg ?? nested.weight_kg,
    weight_start_kg: payload.weight_start_kg ?? nested.weight_start_kg,
    guarded: payload.guarded ?? nested.guarded,
  });
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = asNumber(row[key]);
    if (n != null) return n;
  }
  return null;
}

export function evidenceScope(domain?: string, type?: string): Set<EvidenceScope> | "all" {
  if (!domain && !type) return "all";
  if (domain === "training" || type === "missed_sessions" || type === "program_adjustment") {
    return new Set(["training"]);
  }
  if (domain === "nutrition" || type === "not_following" || type === "sparse_nutrition") {
    return new Set(["nutrition"]);
  }
  if (domain === "weight" || type === "stall" || type === "too_fast") {
    return new Set(["weight"]);
  }
  if (domain === "recovery" || type === "fatigue") {
    return new Set(["recovery"]);
  }
  if (type === "keep_in_touch") return new Set(["nutrition", "training"]);
  return "all";
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function firstString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeGoalKey(goal: string): string {
  const g = goal.trim().toLowerCase();
  if (g === "cut" || g === "lose" || g === "fat_loss" || g === "weight_loss") return "cut";
  if (g === "bulk" || g === "gain" || g === "muscle") return "bulk";
  if (g === "maintain" || g === "recomp") return "maintain";
  return g;
}

export function decisionEvidenceChanged(
  prev: Record<string, unknown> | null | undefined,
  next: ProposalEvidenceSnapshot,
  domain?: string,
  type?: string,
): boolean {
  if (!prev) return false;
  const scope = evidenceScope(domain, type);
  const allow = (key: EvidenceScope) => scope === "all" || scope.has(key);

  const prevGoal = firstString(prev, ["goal"]);
  if (prevGoal && next.goal && normalizeGoalKey(prevGoal) !== normalizeGoalKey(next.goal)) return true;
  const prevInputTarget = firstNumber(prev, ["calorie_target", "calorieTarget", "target_avg_kcal"]);
  if (prevInputTarget != null && next.calorieTarget !== prevInputTarget) return true;
  const prevProtein = firstNumber(prev, ["protein_target", "proteinTarget"]);
  if (prevProtein != null && next.proteinTarget != null && prevProtein !== next.proteinTarget) return true;
  const prevCarbs = firstNumber(prev, ["carbs_target", "carbsTarget"]);
  if (prevCarbs != null && next.carbsTarget != null && prevCarbs !== next.carbsTarget) return true;
  const prevFat = firstNumber(prev, ["fat_target", "fatTarget"]);
  if (prevFat != null && next.fatTarget != null && prevFat !== next.fatTarget) return true;
  const prevWeightKg = firstNumber(prev, ["weight_kg", "weightKg"]);
  if (
    prevWeightKg != null
    && next.weightKg != null
    && Math.abs(next.weightKg - prevWeightKg) >= DECISION_EVIDENCE_WEIGHT_DELTA_KG
  ) {
    return true;
  }
  const prevGuarded = asBoolean(prev.guarded);
  if (prevGuarded != null && next.guarded != null && prevGuarded !== next.guarded) return true;

  if (allow("nutrition")) {
    const prevCal = firstNumber(prev, ["avg_calories", "avgCalories"]);
    if (prevCal != null && Math.abs(next.avgCalories - prevCal) >= DECISION_EVIDENCE_KCAL_DELTA) return true;
    const prevLogs = firstNumber(prev, ["logged_nutrition_days", "loggedNutritionDays"]);
    if (prevLogs != null && next.loggedNutritionDays - prevLogs >= DECISION_EVIDENCE_LOG_DAYS_DELTA) return true;
  }
  if (allow("training")) {
    const prevWorkouts = firstNumber(prev, ["workout_count", "workoutCount"]);
    if (prevWorkouts != null && Math.abs(next.workoutCount - prevWorkouts) >= DECISION_EVIDENCE_WORKOUT_DELTA) {
      return true;
    }
  }
  if (allow("weight")) {
    const prevDelta = firstNumber(prev, ["weight_delta_kg", "weightDeltaKg"]);
    if (
      prevDelta != null
      && next.weightDeltaKg != null
      && Math.abs(next.weightDeltaKg - prevDelta) >= DECISION_EVIDENCE_WEIGHT_DELTA_KG
    ) {
      return true;
    }
  }
  if (allow("recovery")) {
    const prevFatigue = firstNumber(prev, ["avg_fatigue", "avgFatigue"]);
    if (prevFatigue != null && next.avgFatigue != null && Math.abs(next.avgFatigue - prevFatigue) >= 1) return true;
    const prevEnergy = firstNumber(prev, ["avg_energy", "avgEnergy"]);
    if (prevEnergy != null && next.avgEnergy != null && Math.abs(next.avgEnergy - prevEnergy) >= 1) return true;
  }
  return false;
}

export function isProposalSuppressed(
  recentDecisions: ProposalMemoryDecision[],
  domain: string,
  type: string,
  aggregates: ProposalEvidenceSnapshot,
): boolean {
  const last = latestAthleteDecision(recentDecisions, domain, type);
  if (!last) return false;
  if (last.decision !== "refused" && last.decision !== "ignored" && last.decision !== "corrected") {
    return false;
  }
  return !decisionEvidenceChanged(last.data_used, aggregates, last.domain, last.type);
}

/**
 * Vision 8.6: a watch-panel accept/modify is remembered. The engine must not
 * re-propose that exact (domain, type) until evidence moves. Solo calorie apply
 * and Coach inbox keeps (`source !== prometheus_watch`) still use
 * `isProposalSuppressed` only, so a real applied accept can be followed up.
 */
export function isWatchProposalSettled(
  recentDecisions: ProposalMemoryDecision[],
  domain: string,
  type: string,
  aggregates: ProposalEvidenceSnapshot,
): boolean {
  const last = latestAthleteDecision(recentDecisions, domain, type);
  if (!last) return false;
  if (last.source !== "prometheus_watch") return false;
  if (last.decision !== "accepted" && last.decision !== "modified") return false;
  return !decisionEvidenceChanged(last.data_used, aggregates, last.domain, last.type);
}

/** Vision 8.5: a context correction must not re-open the same interpretation until evidence moves. */
export function isContextCorrectionHeld(
  recentDecisions: ProposalMemoryDecision[],
  domain: string,
  type: string,
  aggregates: ProposalEvidenceSnapshot,
): boolean {
  const last = latestAthleteDecision(recentDecisions, domain, type);
  if (!last || last.decision !== "corrected") return false;
  return !decisionEvidenceChanged(last.data_used, aggregates, last.domain, last.type);
}

export function snapshotReviewAggregates(agg: ProposalEvidenceSnapshot): Record<string, unknown> {
  return compactEvidence({
    avg_calories: agg.avgCalories,
    calorie_target: agg.calorieTarget,
    workout_count: agg.workoutCount,
    logged_nutrition_days: agg.loggedNutritionDays,
    weight_delta_kg: agg.weightDeltaKg,
    expected_workouts: agg.expectedWorkouts,
    weigh_ins: agg.weighIns,
    avg_fatigue: agg.avgFatigue,
    avg_energy: agg.avgEnergy,
    window_start: agg.windowStart,
    window_end: agg.windowEnd,
    goal: agg.goal,
    protein_target: agg.proteinTarget,
    carbs_target: agg.carbsTarget,
    fat_target: agg.fatTarget,
    weight_kg: agg.weightKg,
    weight_start_kg: agg.weightStartKg,
    guarded: agg.guarded,
  });
}

export function weeklyReviewAggregatesFromCounts(input: {
  avgCalories: number;
  calorieTarget: number;
  workoutCount: number;
  loggedNutritionDays: number;
  weightDeltaKg: number | null;
  expectedWorkouts?: number;
  weighIns?: number;
  avgFatigue?: number | null;
  avgEnergy?: number | null;
  windowStart?: string;
  windowEnd?: string;
  goal?: string;
  proteinTarget?: number;
  carbsTarget?: number;
  fatTarget?: number;
  weightKg?: number;
  weightStartKg?: number | null;
  guarded?: boolean;
}): ProposalEvidenceSnapshot {
  return {
    avgCalories: input.avgCalories,
    calorieTarget: input.calorieTarget,
    workoutCount: input.workoutCount,
    loggedNutritionDays: input.loggedNutritionDays,
    weightDeltaKg: input.weightDeltaKg,
    expectedWorkouts: input.expectedWorkouts,
    weighIns: input.weighIns,
    avgFatigue: input.avgFatigue ?? null,
    avgEnergy: input.avgEnergy ?? null,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    goal: input.goal,
    proteinTarget: input.proteinTarget,
    carbsTarget: input.carbsTarget,
    fatTarget: input.fatTarget,
    weightKg: input.weightKg,
    weightStartKg: input.weightStartKg ?? null,
    guarded: input.guarded,
  };
}

const MATERIAL_KEYS = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "daily_calorie_target",
  "target_avg_kcal",
  "draft",
  "program_id",
  "days",
  "title",
  "rationale",
  "kind",
  "action",
  "reason",
  "flag",
  "patch",
  "program",
  "note",
  "message",
  "tracking",
  "assign_program_id",
] as const;

function canonicalActionField(key: string, value: unknown): unknown {
  if (value == null) return null;
  if (key === "calories") {
    if (typeof value === "number" && Number.isFinite(value)) return { calories: value };
    if (typeof value === "object" && !Array.isArray(value)) {
      const row = value as Record<string, unknown>;
      const macros: Record<string, unknown> = {};
      for (const macro of ["calories", "protein", "carbs", "fat"] as const) {
        if (row[macro] != null) macros[macro] = row[macro];
      }
      return macros;
    }
  }
  return stripRouting(value);
}

function submittedCoveredBy(
  original: unknown,
  submitted: unknown,
  canonicalize = true,
): boolean {
  if (submitted == null) return true;
  if (typeof submitted === "object" && submitted !== null && !Array.isArray(submitted)) {
    const origRow = original && typeof original === "object" && !Array.isArray(original)
      ? original as Record<string, unknown>
      : {};
    const subRow = submitted as Record<string, unknown>;
    for (const [key, value] of Object.entries(subRow)) {
      if (ROUTING_KEYS.has(key)) continue;
      const origVal = canonicalize
        ? canonicalActionField(key, origRow[key])
        : origRow[key];
      const subVal = canonicalize
        ? canonicalActionField(key, value)
        : value;
      if (!submittedCoveredBy(origVal, subVal, false)) return false;
    }
    return true;
  }
  return JSON.stringify(stripRouting(original ?? null)) === JSON.stringify(stripRouting(submitted));
}

function pickMaterialAction(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of MATERIAL_KEYS) {
    if (key in row) out[key] = canonicalActionField(key, row[key]);
  }
  if (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) {
    out.payload = stripRouting(row.payload);
  }
  return out;
}

export function proposalMateriallyEdited(
  original: Record<string, unknown> | null | undefined,
  submitted: Record<string, unknown> | null | undefined,
): boolean {
  if (submitted == null) return false;
  if (original == null) return false;
  const submittedPick = pickMaterialAction(submitted);
  if (Object.keys(submittedPick).length === 0) return false;
  return !submittedCoveredBy(pickMaterialAction(original), submittedPick);
}
