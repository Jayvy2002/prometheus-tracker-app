import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { FLEET_COPY, fleetLocale, type FleetCopy, type FleetGoalKey, type FleetLocale } from "../_shared/fleetCopy.ts";
import { todayInTimeZone } from "../_shared/clock.ts";
import {
  isProposalSuppressed,
  mapInterventionKind,
  weeklyReviewAggregatesFromCounts,
  type ProposalMemoryDecision,
} from "../_shared/proposalMemory.ts";
import {
  runAthleteWeeklyReview,
  weeklyReviewInputFromFleet,
  weeklyReviewSaveArgs,
  type EngineSignal,
} from "../_shared/weeklyReviewEngine.ts";

/**
 * Architecture lock 2026-08-29 (Jayvy): DO NOT create Grok Bots.
 * Second was too slow. One bot per coach or per client will not scale.
 *
 * Weekly review IN THE APP:
 *   1. Cheap SQL (`triage_coach_fleet`) of EVERY active linked client.
 *   2. Data-driven Relancer / kcal+P/C/F (ISSN is the starting formula only).
 *   3. 100 % deterministic — no LLM call. Program drafts go through `coach-agent`, on demand.
 *   4. Writes coach_interventions drafts only. Never auto-applies. Never pings Second.
 *
 * Language: every draft is written in the coach's language (`user_profiles.language`,
 * FR by default) via the shared `fleetCopy` dictionary — same source as the app-side mirror.
 *
 * Auth:
 *   JWT (logged-in coach) → that coach's roster, on-demand from Aujourd'hui
 *   FLEET_CRON_SECRET (pg_cron nightly) → all coaches
 *
 * Never authenticates with GROK_BOT_WEBHOOK_SECRET. Never POSTs GROK_BOT_WEBHOOK_URL.
 * Never creates per-client/per-coach Grok Bots. Second is out of the product loop.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Key, X-Sender-Key",
};

const FLEET_SOURCE = "fleet";
const FLEET_WINDOW_DAYS = 14;
const GHOST_IDLE_DAYS = 10;
const NEW_CLIENT_DAYS = 7;
const OVEREAT_RATIO = 1.15;
const UNDER_EAT_RATIO = 0.85;
const MIN_NUTRITION_LOG_DAYS = 4;
const CUT_STALL_MIN_DELTA_KG = -0.2;
const CUT_TOO_FAST_PCT_PER_WEEK = 1.5;
const BULK_TOO_FAST_PCT_PER_WEEK = 0.7;
const KEEP_IN_TOUCH_DAYS = 7;
const FLEET_HANDLE_COOLDOWN_DAYS = 7;
const MACRO_KCAL_TOLERANCE = 0.15;
const MODEL_USED = "deterministic";
const WEEKLY_SMALL_KCAL = 100;
const WEEKLY_LARGE_KCAL = 200;
const WEEKLY_CARB_SHIFT_G = 35;
/** I04 : seuils sur signaux DÉCLARÉS 0–10 (jamais sur l'adhérence). */
const FATIGUE_DECLARED_MIN = 7;
const ENERGY_DECLARED_MAX = 3;
const FATIGUE_TRAINING_MAX = 2.5;
const CUT_GAIN_MIN_DELTA_KG = 0.3;

type FleetFlag =
  | "on_track"
  | "onboarding"
  | "ghost"
  | "adherence_nutrition"
  | "adherence_training"
  | "too_fast"
  | "stall_adherent"
  | "keep_in_touch";

interface Dossier {
  coach_id: string;
  client_id: string;
  full_name: string;
  goal: string;
  onboarding_completed: boolean;
  has_program: boolean;
  setup_completed: boolean;
  linked_days: number;
  training_frequency: number;
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  weight_kg: number;
  logged_nutrition_days: number;
  avg_calories: number;
  last_nutrition_at: string | null;
  workout_count: number;
  last_workout_at: string | null;
  checkin_count: number;
  last_checkin_at: string | null;
  avg_adherence_nutrition: number | null;
  avg_adherence_training: number | null;
  weight_start_kg: number | null;
  weight_end_kg: number | null;
  weight_delta_kg: number | null;
  weight_start_at?: string | null;
  weight_end_at?: string | null;
  weight_span_days?: number | null;
  avg_effective_target?: number;
  avg_fatigue?: number | null;
  avg_sleep_quality?: number | null;
  avg_soreness?: number | null;
  avg_energy?: number | null;
  tracking?: {
    nutrition: boolean;
    workouts: boolean;
    weight: boolean;
    checkins: boolean;
  };
  is_minor?: boolean;
  has_medical_flags?: boolean;
  last_message_at: string | null;
  last_coach_message_at: string | null;
  last_keep_in_touch_at: string | null;
  avg_hunger: number | null;
  avg_mood: number | null;
  avg_stress: number | null;
  available_weekdays: number[] | null;
  pending_fleet: boolean;
  fleet_handled: FleetHandled[];
}

interface FleetEvidence {
  avg_calories: number;
  logged_nutrition_days: number;
  workout_count: number;
  checkin_count: number;
  weight_delta_kg: number | null;
  last_nutrition_at: string | null;
  last_workout_at: string | null;
  last_checkin_at: string | null;
  target_avg_kcal?: number;
  weight_span_days?: number | null;
  window_days?: number;
}

interface FleetHandled {
  kind: string;
  flag: string;
  status: string;
  handled_at: string;
  evidence: FleetEvidence | null;
}

interface CalorieDraft {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface FleetCard {
  flag: FleetFlag;
  kind: string;
  title: string;
  observation: string;
  cause: string;
  rationale: string;
  payload: Record<string, unknown>;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function firstName(full: string, copy: FleetCopy): string {
  const trimmed = full.trim();
  if (!trimmed) return copy.you;
  if (trimmed.includes("@")) return trimmed.split("@")[0] ?? trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function normalizeGoal(goal: string | null | undefined): "cut" | "bulk" | "maintain" | "" {
  const g = (goal || "").trim().toLowerCase();
  if (g === "cut" || g === "lose" || g === "fat_loss" || g === "weight_loss") return "cut";
  if (g === "bulk" || g === "gain" || g === "muscle") return "bulk";
  if (g === "maintain" || g === "recomp") return "maintain";
  return "";
}

function adherenceOnFive(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 5) return Math.round(raw * 10) / 10;
  return Math.round((raw / 20) * 10) / 10;
}

function overeatRatio(avg: number, target: number): number {
  if (target <= 0 || avg <= 0) return 0;
  return avg / target;
}

function weeklyWeightPct(deltaKg: number | null, startKg: number | null, spanDays: number | null | undefined = FLEET_WINDOW_DAYS): number | null {
  if (deltaKg == null || startKg == null || startKg <= 0) return null;
  const span = spanDays ?? FLEET_WINDOW_DAYS;
  if (!Number.isFinite(span) || span < 1) return null;
  return (deltaKg / startKg) * 100 / (span / 7);
}

/** I04 : un module absent du dossier = suivi (vieux dossiers). */
function trackingOn(d: Dossier, key: "nutrition" | "workouts" | "weight" | "checkins"): boolean {
  const t = d.tracking;
  if (!t) return true;
  return t[key] !== false;
}

/** I03 : la cible jugée est la moyenne des cibles effectives datées. */
function effectiveCalorieTarget(d: Dossier): number {
  const eff = d.avg_effective_target ?? 0;
  if (eff > 0) return Math.round(eff);
  return Math.round(d.calorie_target);
}

/** I04 : pas d'objectif automatique de restriction/transformation pour ces profils. */
function isGuardedProfile(d: Dossier): boolean {
  return d.is_minor === true || d.has_medical_flags === true;
}

function isCompleteCalorieDraft(draft: CalorieDraft | null | undefined): boolean {
  if (!draft) return false;
  if (draft.calories < 800 || draft.calories > 8000) return false;
  if (draft.protein <= 0 || draft.carbs <= 0 || draft.fat <= 0) return false;
  const fromMacros = draft.protein * 4 + draft.carbs * 4 + draft.fat * 9;
  return Math.abs(fromMacros - draft.calories) <= draft.calories * MACRO_KCAL_TOLERANCE;
}

function completeMacrosFor(calories: number, goal: string, weightKg: number): CalorieDraft {
  const g = normalizeGoal(goal) || "maintain";
  const proteinPerKg = g === "cut" ? 2.2 : g === "bulk" ? 1.8 : 1.6;
  const cal = Math.round(calories);
  let proteinG = weightKg > 0 ? Math.round(weightKg * proteinPerKg) : Math.round((cal * 0.3) / 4);
  if (proteinG * 4 > cal * 0.4) proteinG = Math.round((cal * 0.4) / 4);
  const remaining = Math.max(0, cal - proteinG * 4);
  const fatShare = g === "cut" ? 0.4 : g === "bulk" ? 0.3 : 0.35;
  const fatG = Math.max(1, Math.round((remaining * fatShare) / 9));
  const carbsG = Math.max(1, Math.round((remaining * (1 - fatShare)) / 4));
  return { calories: cal, protein: Math.max(1, proteinG), carbs: carbsG, fat: fatG };
}

function clampCalories(n: number): number {
  return Math.min(8000, Math.max(800, Math.round(n)));
}

function nutritionFollowingPlan(d: Dossier): boolean {
  const target = effectiveCalorieTarget(d);
  if (target <= 0 || d.logged_nutrition_days < MIN_NUTRITION_LOG_DAYS) return false;
  const ratio = overeatRatio(d.avg_calories, target);
  if (ratio >= OVEREAT_RATIO || ratio <= UNDER_EAT_RATIO) return false;
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  if (adh != null && adh <= 2) return false;
  return true;
}

function currentOrIssnDraft(d: Dossier): CalorieDraft {
  const current: CalorieDraft = {
    calories: Math.round(d.calorie_target),
    protein: Math.round(d.protein_target),
    carbs: Math.round(d.carbs_target),
    fat: Math.round(d.fat_target),
  };
  if (isCompleteCalorieDraft(current)) return current;
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  return completeMacrosFor(base, d.goal, d.weight_end_kg || d.weight_kg);
}

function signsOfFatigue(d: Dossier): boolean {
  const fatigue = d.avg_fatigue;
  const energy = d.avg_energy;
  if (fatigue != null && Number.isFinite(fatigue) && fatigue >= FATIGUE_DECLARED_MIN) return true;
  if (energy != null && Number.isFinite(energy) && energy <= ENERGY_DECLARED_MAX) return true;
  return false;
}

function shiftCarbsKeepCalories(draft: CalorieDraft, extraCarbs = WEEKLY_CARB_SHIFT_G): CalorieDraft {
  const protein = Math.max(1, draft.protein);
  const carbs = Math.max(1, draft.carbs + extraCarbs);
  const remaining = draft.calories - protein * 4 - carbs * 4;
  const fat = Math.max(1, Math.round(remaining / 9));
  return { calories: Math.round(draft.calories), protein, carbs, fat };
}

type WeeklyNutritionReason =
  | "keep"
  | "not_following"
  | "cut_stall"
  | "cut_gain"
  | "too_fast_cut"
  | "bulk_stall"
  | "bulk_too_fast"
  | "carb_support";

interface WeeklyNutritionProposal {
  action: "keep" | "relance" | "calorie_adjustment";
  reason: WeeklyNutritionReason;
  draft: CalorieDraft | null;
  guarded?: boolean;
}

function proposeWeeklyNutrition(d: Dossier): WeeklyNutritionProposal {
  if (!trackingOn(d, "nutrition")) {
    return { action: "keep", reason: "keep", draft: null };
  }
  if (!nutritionFollowingPlan(d)) {
    return { action: "relance", reason: "not_following", draft: null };
  }
  const weight = d.weight_end_kg || d.weight_kg;
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  const goal = normalizeGoal(d.goal);
  const current = currentOrIssnDraft(d);
  const span = d.weight_span_days ?? FLEET_WINDOW_DAYS;
  const guarded = isGuardedProfile(d);
  const adjust = (reason: WeeklyNutritionReason, draft: CalorieDraft): WeeklyNutritionProposal =>
    guarded
      ? { action: "keep", reason: "keep", draft: null, guarded: true }
      : { action: "calorie_adjustment", reason, draft };
  if (signsOfFatigue(d)) {
    return adjust("carb_support", shiftCarbsKeepCalories(current));
  }
  const delta = d.weight_delta_kg;
  const pct = weeklyWeightPct(delta, d.weight_start_kg ?? d.weight_kg, span);
  if (goal === "cut") {
    if (pct != null && pct <= -CUT_TOO_FAST_PCT_PER_WEEK) {
      return adjust("too_fast_cut", completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    if (delta != null && delta >= CUT_GAIN_MIN_DELTA_KG) {
      return adjust("cut_gain", completeMacrosFor(clampCalories(base - WEEKLY_LARGE_KCAL), d.goal, weight));
    }
    if (delta != null && delta >= CUT_STALL_MIN_DELTA_KG) {
      return adjust("cut_stall", completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    return guarded && delta != null
      ? { action: "keep", reason: "keep", draft: null, guarded: true }
      : { action: "keep", reason: "keep", draft: null };
  }
  if (goal === "bulk") {
    if (pct != null && pct >= BULK_TOO_FAST_PCT_PER_WEEK) {
      return adjust("bulk_too_fast", completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    if (delta != null && delta <= 0.1) {
      return adjust("bulk_stall", completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight));
    }
    return guarded && delta != null
      ? { action: "keep", reason: "keep", draft: null, guarded: true }
      : { action: "keep", reason: "keep", draft: null };
  }
  if (delta != null && Math.abs(delta) >= 1.5) {
    const dir = delta > 0 ? -WEEKLY_SMALL_KCAL : WEEKLY_SMALL_KCAL;
    return adjust(
      delta > 0 ? "cut_gain" : "bulk_stall",
      completeMacrosFor(clampCalories(base + dir), d.goal, weight),
    );
  }
  return { action: "keep", reason: "keep", draft: null };
}

function mapDossier(raw: Record<string, unknown>): Dossier | null {
  const dossierRaw = raw.dossier && typeof raw.dossier === "object" && !Array.isArray(raw.dossier)
    ? raw.dossier as Record<string, unknown>
    : raw;
  const clientId = String(raw.client_id ?? dossierRaw.client_id ?? "");
  const coachId = String(raw.coach_id ?? dossierRaw.coach_id ?? "");
  if (!clientId || !coachId) return null;
  return {
    coach_id: coachId,
    client_id: clientId,
    full_name: typeof dossierRaw.full_name === "string" ? dossierRaw.full_name : "",
    goal: typeof dossierRaw.goal === "string" ? dossierRaw.goal : "",
    onboarding_completed: dossierRaw.onboarding_completed === true,
    has_program: dossierRaw.has_program === true,
    setup_completed: dossierRaw.setup_completed === true,
    linked_days: num(dossierRaw.linked_days),
    training_frequency: num(dossierRaw.training_frequency),
    calorie_target: num(dossierRaw.calorie_target),
    protein_target: num(dossierRaw.protein_target),
    carbs_target: num(dossierRaw.carbs_target),
    fat_target: num(dossierRaw.fat_target),
    weight_kg: num(dossierRaw.weight_kg),
    logged_nutrition_days: num(dossierRaw.logged_nutrition_days),
    avg_calories: num(dossierRaw.avg_calories),
    last_nutrition_at: str(dossierRaw.last_nutrition_at),
    workout_count: num(dossierRaw.workout_count),
    last_workout_at: str(dossierRaw.last_workout_at),
    checkin_count: num(dossierRaw.checkin_count),
    last_checkin_at: str(dossierRaw.last_checkin_at),
    avg_adherence_nutrition: dossierRaw.avg_adherence_nutrition == null ? null : num(dossierRaw.avg_adherence_nutrition),
    avg_adherence_training: dossierRaw.avg_adherence_training == null ? null : num(dossierRaw.avg_adherence_training),
    weight_start_kg: dossierRaw.weight_start_kg == null ? null : num(dossierRaw.weight_start_kg),
    weight_end_kg: dossierRaw.weight_end_kg == null ? null : num(dossierRaw.weight_end_kg),
    weight_delta_kg: dossierRaw.weight_delta_kg == null ? null : num(dossierRaw.weight_delta_kg),
    weight_start_at: str(dossierRaw.weight_start_at),
    weight_end_at: str(dossierRaw.weight_end_at),
    weight_span_days: dossierRaw.weight_span_days == null ? null : num(dossierRaw.weight_span_days),
    avg_effective_target: num(dossierRaw.avg_effective_target),
    avg_fatigue: dossierRaw.avg_fatigue == null ? null : num(dossierRaw.avg_fatigue),
    avg_sleep_quality: dossierRaw.avg_sleep_quality == null ? null : num(dossierRaw.avg_sleep_quality),
    avg_soreness: dossierRaw.avg_soreness == null ? null : num(dossierRaw.avg_soreness),
    avg_energy: dossierRaw.avg_energy == null ? null : num(dossierRaw.avg_energy),
    tracking: dossierRaw.tracking && typeof dossierRaw.tracking === "object" && !Array.isArray(dossierRaw.tracking)
      ? {
        nutrition: (dossierRaw.tracking as Record<string, unknown>).nutrition !== false,
        workouts: (dossierRaw.tracking as Record<string, unknown>).workouts !== false,
        weight: (dossierRaw.tracking as Record<string, unknown>).weight !== false,
        checkins: (dossierRaw.tracking as Record<string, unknown>).checkins !== false,
      }
      : undefined,
    is_minor: dossierRaw.is_minor === true,
    has_medical_flags: dossierRaw.has_medical_flags === true,
    last_message_at: str(dossierRaw.last_message_at),
    last_coach_message_at: str(dossierRaw.last_coach_message_at),
    last_keep_in_touch_at: str(dossierRaw.last_keep_in_touch_at),
    avg_hunger: dossierRaw.avg_hunger == null ? null : num(dossierRaw.avg_hunger),
    avg_mood: dossierRaw.avg_mood == null ? null : num(dossierRaw.avg_mood),
    avg_stress: dossierRaw.avg_stress == null ? null : num(dossierRaw.avg_stress),
    available_weekdays: Array.isArray(dossierRaw.available_weekdays)
      ? dossierRaw.available_weekdays
        .map((d) => num(d))
        .filter((d) => d >= 0 && d <= 6)
      : null,
    pending_fleet: dossierRaw.pending_fleet === true,
    fleet_handled: parseHandled(dossierRaw.fleet_handled),
  };
}

function parseHandled(raw: unknown): FleetHandled[] {
  if (!Array.isArray(raw)) return [];
  const rows: FleetHandled[] = [];
  for (const item of raw) {
    const row = asObject(item);
    const kind = typeof row.kind === "string" ? row.kind : "";
    const flag = typeof row.flag === "string" ? row.flag : kind;
    const handledAt = typeof row.handled_at === "string" ? row.handled_at : "";
    if (!kind || !handledAt) continue;
    const ev = asObject(row.evidence);
    const hasEv = row.evidence && typeof row.evidence === "object";
    rows.push({
      kind,
      flag,
      status: typeof row.status === "string" ? row.status : "",
      handled_at: handledAt,
      evidence: hasEv ? {
        avg_calories: num(ev.avg_calories),
        logged_nutrition_days: num(ev.logged_nutrition_days),
        workout_count: num(ev.workout_count),
        checkin_count: num(ev.checkin_count),
        weight_delta_kg: ev.weight_delta_kg == null ? null : num(ev.weight_delta_kg),
        last_nutrition_at: str(ev.last_nutrition_at),
        last_workout_at: str(ev.last_workout_at),
        last_checkin_at: str(ev.last_checkin_at),
        target_avg_kcal: ev.target_avg_kcal == null ? undefined : num(ev.target_avg_kcal),
        weight_span_days: ev.weight_span_days == null ? null : num(ev.weight_span_days),
        window_days: ev.window_days == null ? undefined : num(ev.window_days),
      } : null,
    });
  }
  return rows;
}

function offGoal(d: Dossier): boolean {
  if (!trackingOn(d, "weight")) return false;
  const goal = normalizeGoal(d.goal);
  const delta = d.weight_delta_kg;
  if (delta == null) return false;
  if (goal === "cut") return delta >= CUT_STALL_MIN_DELTA_KG;
  if (goal === "bulk") return delta <= 0.1;
  if (goal === "maintain") return Math.abs(delta) >= 1.5;
  return false;
}

function tooFast(d: Dossier): boolean {
  if (!trackingOn(d, "weight")) return false;
  const goal = normalizeGoal(d.goal);
  const pct = weeklyWeightPct(d.weight_delta_kg, d.weight_start_kg ?? d.weight_kg, d.weight_span_days ?? FLEET_WINDOW_DAYS);
  if (pct == null) return false;
  if (goal === "cut") return pct <= -CUT_TOO_FAST_PCT_PER_WEEK;
  if (goal === "bulk") return pct >= BULK_TOO_FAST_PCT_PER_WEEK;
  return false;
}

function expectedWorkouts(d: Dossier): number {
  const freq = d.training_frequency > 0 ? d.training_frequency : 3;
  return Math.round(freq * (FLEET_WINDOW_DAYS / 7));
}

function isGhostAt(d: Dossier, today: string): boolean {
  if (d.linked_days < 7) return false;
  const tracked: Array<string | null> = [];
  if (trackingOn(d, "workouts")) tracked.push(d.last_workout_at);
  if (trackingOn(d, "nutrition")) tracked.push(d.last_nutrition_at);
  if (trackingOn(d, "checkins")) tracked.push(d.last_checkin_at);
  if (tracked.length === 0) return false;
  const stale = (iso: string | null) => {
    if (!iso) return true;
    const day = iso.slice(0, 10);
    const a = Date.parse(`${day}T00:00:00Z`);
    const b = Date.parse(`${today}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    return Math.round((b - a) / 86_400_000) > GHOST_IDLE_DAYS;
  };
  return tracked.every(stale);
}

function missedTraining(d: Dossier): boolean {
  if (!trackingOn(d, "workouts")) return false;
  const expected = expectedWorkouts(d);
  if (expected <= 0) return false;
  return d.workout_count <= Math.max(0, Math.floor(expected * 0.4));
}

function idleDays(iso: string | null, today: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const day = iso.slice(0, 10);
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

function shouldOfferKeepInTouch(d: Dossier, today: string): boolean {
  if (idleDays(d.last_coach_message_at, today) < KEEP_IN_TOUCH_DAYS) return false;
  if (d.pending_fleet) return true;
  if (idleDays(d.last_keep_in_touch_at, today) < KEEP_IN_TOUCH_DAYS) return false;
  return true;
}

function fleetSignalKey(kind: string, flag: string): string {
  return `${kind}:${flag || kind}`;
}

function evidenceFromDossier(d: Dossier): FleetEvidence {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  return {
    avg_calories: Math.round(d.avg_calories),
    logged_nutrition_days: d.logged_nutrition_days,
    workout_count: d.workout_count,
    checkin_count: d.checkin_count,
    weight_delta_kg: d.weight_delta_kg,
    last_nutrition_at: day(d.last_nutrition_at),
    last_workout_at: day(d.last_workout_at),
    last_checkin_at: day(d.last_checkin_at),
    target_avg_kcal: effectiveCalorieTarget(d),
    weight_span_days: d.weight_span_days ?? null,
    window_days: FLEET_WINDOW_DAYS,
  };
}

function withEvidence(d: Dossier, card: FleetCard): FleetCard {
  const evidence = evidenceFromDossier(d);
  return {
    ...card,
    payload: {
      ...card.payload,
      evidence,
      avg_calories: evidence.avg_calories,
      logged_nutrition_days: evidence.logged_nutrition_days,
      workout_count: evidence.workout_count,
    },
  };
}

function newerDay(next: string | null, prev: string | null): boolean {
  if (!next || !prev) return false;
  return next.slice(0, 10) > prev.slice(0, 10);
}

function evidenceChanged(prev: FleetEvidence | null | undefined, next: FleetEvidence, flag: string): boolean {
  if (flag === "keep_in_touch") return false;
  if (!prev) return false;
  if (Math.abs((next.avg_calories || 0) - (prev.avg_calories || 0)) >= 150) return true;
  if (
    next.target_avg_kcal != null && prev.target_avg_kcal != null
    && Math.abs(next.target_avg_kcal - prev.target_avg_kcal) >= 150
  ) return true;
  if ((next.logged_nutrition_days || 0) - (prev.logged_nutrition_days || 0) >= 3) return true;
  if (Math.abs((next.workout_count || 0) - (prev.workout_count || 0)) >= 2) return true;
  if (
    next.weight_delta_kg != null
    && prev.weight_delta_kg != null
    && Math.abs(next.weight_delta_kg - prev.weight_delta_kg) >= 0.4
  ) return true;
  if (newerDay(next.last_nutrition_at, prev.last_nutrition_at)) return true;
  if (newerDay(next.last_workout_at, prev.last_workout_at)) return true;
  if (newerDay(next.last_checkin_at, prev.last_checkin_at)) return true;
  return false;
}

interface DecisionLogRow extends ProposalMemoryDecision {
  athlete_id: string;
}

function asEngineSignal(raw: Record<string, unknown>): EngineSignal | null {
  const id = str(raw.id);
  const domain = str(raw.domain);
  const type = str(raw.type);
  const hypothesis = str(raw.hypothesis);
  const confidence = str(raw.confidence);
  const status = str(raw.status);
  if (!id || !domain || !type || !hypothesis || !confidence || !status) return null;
  return {
    id,
    athlete_id: str(raw.athlete_id) ?? undefined,
    domain: domain as EngineSignal["domain"],
    type,
    hypothesis,
    evidence_for: Array.isArray(raw.evidence_for) ? raw.evidence_for as EngineSignal["evidence_for"] : [],
    evidence_against: Array.isArray(raw.evidence_against) ? raw.evidence_against as EngineSignal["evidence_against"] : [],
    confidence: confidence as EngineSignal["confidence"],
    status: status as EngineSignal["status"],
  };
}

async function loadDecisionLogs(
  admin: SupabaseClient,
  athleteIds: string[],
): Promise<Map<string, DecisionLogRow[]>> {
  const byAthlete = new Map<string, DecisionLogRow[]>();
  if (athleteIds.length === 0) return byAthlete;
  const latest = await admin.rpc("list_latest_athlete_decisions_for_athletes", {
    p_athlete_ids: athleteIds,
  });
  const rows = !latest.error && Array.isArray(latest.data)
    ? latest.data
    : [];
  if (latest.error) {
    const fallback = await admin
      .from("athlete_decision_log")
      .select("athlete_id, domain, type, decision, data_used, created_at")
      .in("athlete_id", athleteIds)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!fallback.error && Array.isArray(fallback.data)) {
      for (const raw of fallback.data) ingestDecisionRow(byAthlete, asObject(raw));
    }
    return byAthlete;
  }
  for (const raw of rows) ingestDecisionRow(byAthlete, asObject(raw));
  return byAthlete;
}

function ingestDecisionRow(byAthlete: Map<string, DecisionLogRow[]>, row: Record<string, unknown>) {
  const athleteId = str(row.athlete_id);
  if (!athleteId) return;
  const list = byAthlete.get(athleteId) ?? [];
  const dataUsed = row.data_used && typeof row.data_used === "object" && !Array.isArray(row.data_used)
    ? row.data_used as Record<string, unknown>
    : {};
  list.push({
    athlete_id: athleteId,
    domain: str(row.domain) ?? "",
    type: str(row.type) ?? "",
    decision: str(row.decision) ?? "",
    data_used: dataUsed,
    created_at: str(row.created_at) ?? "",
  });
  byAthlete.set(athleteId, list);
}

async function loadOpenSignals(
  admin: SupabaseClient,
  athleteIds: string[],
): Promise<Map<string, EngineSignal[]>> {
  const byAthlete = new Map<string, EngineSignal[]>();
  if (athleteIds.length === 0) return byAthlete;
  const { data, error } = await admin
    .from("athlete_signals")
    .select("id, athlete_id, domain, type, hypothesis, evidence_for, evidence_against, confidence, status")
    .in("athlete_id", athleteIds)
    .in("status", ["open", "waiting"]);
  if (error || !Array.isArray(data)) return byAthlete;
  for (const raw of data) {
    const row = asEngineSignal(asObject(raw));
    if (!row?.athlete_id) continue;
    const list = byAthlete.get(row.athlete_id) ?? [];
    list.push(row);
    byAthlete.set(row.athlete_id, list);
  }
  return byAthlete;
}

async function persistWeeklyReview(
  admin: SupabaseClient,
  d: Dossier,
  today: string,
  existingSignals: EngineSignal[],
  recentDecisions: DecisionLogRow[],
) {
  const input = weeklyReviewInputFromFleet(d, today, existingSignals, recentDecisions);
  const review = runAthleteWeeklyReview(input);
  await admin.rpc("save_athlete_weekly_review", weeklyReviewSaveArgs(d.client_id, review));
}

function planWrite(
  d: Dossier,
  today: string,
  locale: FleetLocale,
  recentDecisions: DecisionLogRow[] = [],
): { action: "skip" | "upsert" | "insert"; card: FleetCard | null } {
  const raw = buildCard(d, today, locale);
  if (!raw) return { action: "skip", card: null };
  const card = withEvidence(d, raw);
  if (d.pending_fleet) return { action: "upsert", card };
  const key = fleetSignalKey(card.kind, card.flag);
  const prev = d.fleet_handled.find((row) => fleetSignalKey(row.kind, row.flag) === key) ?? null;
  if (prev && idleDays(prev.handled_at, today) < FLEET_HANDLE_COOLDOWN_DAYS) {
    if (!evidenceChanged(prev.evidence, evidenceFromDossier(d), card.flag)) {
      return { action: "skip", card: null };
    }
  }
  const target = mapInterventionKind(card.kind, card.flag);
  if (isProposalSuppressed(recentDecisions, target.domain, target.type, weeklyReviewAggregatesFromCounts({
    avgCalories: Math.round(d.avg_calories),
    calorieTarget: effectiveCalorieTarget(d),
    workoutCount: d.workout_count,
    loggedNutritionDays: d.logged_nutrition_days,
    weightDeltaKg: d.weight_delta_kg,
  }))) {
    return { action: "skip", card: null };
  }
  return { action: "insert", card };
}

function classify(d: Dossier, today: string): FleetFlag {
  if (!d.onboarding_completed || (!d.has_program && !d.setup_completed)) return "onboarding";
  if (d.linked_days < NEW_CLIENT_DAYS && d.workout_count === 0) return "onboarding";
  if (isGhostAt(d, today)) return "ghost";
  const following = nutritionFollowingPlan(d);
  const off = offGoal(d);
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  const trackNutrition = trackingOn(d, "nutrition");
  const target = effectiveCalorieTarget(d);
  if (trackNutrition && !following && d.logged_nutrition_days >= MIN_NUTRITION_LOG_DAYS && (off || (adh != null && adh <= 2))) {
    return "adherence_nutrition";
  }
  if (trackNutrition && !following && target > 0 && d.logged_nutrition_days >= MIN_NUTRITION_LOG_DAYS
    && overeatRatio(d.avg_calories, target) >= OVEREAT_RATIO) {
    return "adherence_nutrition";
  }
  if (missedTraining(d) && d.workout_count + d.checkin_count + d.logged_nutrition_days > 0) {
    return "adherence_training";
  }
  if (tooFast(d)) return isGuardedProfile(d) ? "keep_in_touch" : "too_fast";
  if (following && off) return isGuardedProfile(d) ? "keep_in_touch" : "stall_adherent";
  return "on_track";
}

function goalKey(goal: string): FleetGoalKey {
  const g = normalizeGoal(goal);
  return g === "cut" || g === "bulk" ? g : "other";
}

function relanceMessage(flag: FleetFlag, d: Dossier, copy: FleetCopy): { body: string; templateKey: string } {
  const name = firstName(d.full_name, copy);
  const target = effectiveCalorieTarget(d);
  if (flag === "adherence_nutrition") {
    return {
      templateKey: "missed_checkins",
      body: target > 0 ? copy.relance.nutritionOverTarget(name, target) : copy.relance.nutritionOffPlan(name),
    };
  }
  if (flag === "ghost") {
    return { templateKey: "general_followup", body: copy.relance.ghost(name) };
  }
  if (flag === "too_fast") {
    return {
      templateKey: "general_followup",
      body: copy.relance.tooFast(name, copy.relance.tooFastTip[goalKey(d.goal)], FLEET_WINDOW_DAYS),
    };
  }
  return { templateKey: "missed_training", body: copy.relance.training(name) };
}

function calorieAdjustmentCard(
  d: Dossier,
  flag: FleetFlag,
  proposal: WeeklyNutritionProposal,
  observation: string,
  copy: FleetCopy,
): FleetCard | null {
  if (proposal.action !== "calorie_adjustment" || !proposal.draft || !isCompleteCalorieDraft(proposal.draft)) {
    return null;
  }
  const name = firstName(d.full_name, copy);
  const tweak = proposal.draft;
  const reason = proposal.reason;
  const cause = copy.kcal.cause[reason] || copy.kcal.defaultCause;
  const title = copy.kcal.title[reason]?.(name) ?? copy.kcal.defaultTitle(name);
  const ratio = overeatRatio(d.avg_calories, effectiveCalorieTarget(d));
  const pctWeek = weeklyWeightPct(d.weight_delta_kg, d.weight_start_kg ?? d.weight_kg, d.weight_span_days ?? FLEET_WINDOW_DAYS);
  return {
    flag,
    kind: "calorie_adjustment",
    title,
    observation,
    cause,
    rationale: `${cause} ${tweak.calories} / P${tweak.protein} C${tweak.carbs} F${tweak.fat}.`,
    payload: {
      source: FLEET_SOURCE,
      flag,
      observation,
      cause,
      reason,
      why: {
        from: Math.round(d.calorie_target),
        to: tweak.calories,
        delta: fmtDelta(d.weight_delta_kg),
        pct: ratio > 0 ? Math.round(ratio * 100) : 0,
        pctWeek: pctWeek == null ? "—" : Math.abs(Math.round(pctWeek * 10) / 10),
        avg: Math.round(d.avg_calories),
        loggedDays: d.logged_nutrition_days,
        window: FLEET_WINDOW_DAYS,
        carbs: tweak.carbs,
      },
      nutrition: tweak,
      calories: tweak.calories,
      protein: tweak.protein,
      carbs: tweak.carbs,
      fat: tweak.fat,
    },
  };
}

function fmtDelta(delta: number | null): string {
  if (delta == null) return "—";
  return delta > 0 ? `+${delta}` : String(delta);
}

function keepInTouchCard(d: Dossier, copy: FleetCopy, name: string, today: string, guarded: boolean): FleetCard {
  const silentDays = idleDays(d.last_coach_message_at, today);
  const observation = guarded
    ? copy.keepInTouch.guardedObservation
    : Number.isFinite(silentDays)
      ? copy.keepInTouch.observationSilent(silentDays)
      : copy.keepInTouch.observationNoMessage;
  const cause = guarded ? copy.keepInTouch.guardedCause : copy.keepInTouch.cause;
  const body = copy.keepInTouch.body(name);
  return {
    flag: "keep_in_touch",
    kind: "keep_in_touch",
    title: copy.keepInTouch.title(name),
    observation,
    cause,
    rationale: cause,
    payload: {
      source: FLEET_SOURCE,
      flag: "keep_in_touch",
      observation,
      cause,
      body,
      notes: body,
      template_key: "general_followup",
      ...(guarded ? { guarded: true } : {}),
    },
  };
}

function buildCard(d: Dossier, today: string, locale: FleetLocale): FleetCard | null {
  const copy = FLEET_COPY[locale] ?? FLEET_COPY.fr;
  const clinical = classify(d, today);
  const name = firstName(d.full_name, copy);
  const proposal = proposeWeeklyNutrition(d);
  const avg = Math.round(d.avg_calories);

  if (clinical === "keep_in_touch") {
    return keepInTouchCard(d, copy, name, today, isGuardedProfile(d));
  }

  if (clinical === "on_track") {
    if (proposal.action === "calorie_adjustment" && proposal.reason === "carb_support") {
      const observation = copy.kcal.carbSupportObservation(effectiveCalorieTarget(d), avg, fmtDelta(d.weight_delta_kg));
      return calorieAdjustmentCard(d, "on_track", proposal, observation, copy);
    }
    if (!shouldOfferKeepInTouch(d, today)) return null;
    return keepInTouchCard(d, copy, name, today, false);
  }

  const flag = clinical;
  const target = effectiveCalorieTarget(d);
  const ratio = overeatRatio(d.avg_calories, target);
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  const delta = fmtDelta(d.weight_delta_kg);

  if (flag === "onboarding") {
    const observation = !d.onboarding_completed
      ? copy.onboarding.observationIncomplete
      : !d.has_program
        ? copy.onboarding.observationNoProgram
        : copy.onboarding.observationNoSession(d.linked_days);
    const cause = d.has_program ? copy.onboarding.causeFirstWeek : copy.onboarding.causeNoPlan;
    const title = d.has_program ? copy.onboarding.titleFirstWeek(name) : copy.onboarding.titleSetup(name);
    return {
      flag,
      kind: "onboarding_plan",
      title,
      observation,
      cause,
      rationale: copy.onboarding.rationale,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        notes: copy.onboarding.notes(name),
      },
    };
  }

  if (flag === "adherence_nutrition") {
    const relance = relanceMessage(flag, d, copy);
    const observation = target > 0
      ? copy.nutrition.observationTarget(target, avg, d.logged_nutrition_days, adh, delta)
      : copy.nutrition.observationOffPlan(d.logged_nutrition_days, delta);
    const over = target > 0 && ratio >= OVEREAT_RATIO;
    const cause = over ? copy.nutrition.causeOverTarget(target) : copy.nutrition.causeOffPlan;
    const title = target > 0 ? copy.nutrition.titleOverTarget(target) : copy.nutrition.titleOffPlan;
    return {
      flag,
      kind: "adherence_nutrition",
      title,
      observation,
      cause,
      rationale: cause,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
        current_calories: d.calorie_target,
        avg_calories: avg,
      },
    };
  }

  if (flag === "ghost" || flag === "adherence_training") {
    const relance = relanceMessage(flag, d, copy);
    const observation = flag === "ghost"
      ? copy.training.observationGhost(GHOST_IDLE_DAYS)
      : copy.training.observationMissed(d.workout_count, expectedWorkouts(d), FLEET_WINDOW_DAYS);
    const cause = flag === "ghost" ? copy.training.causeGhost : copy.training.causeMissed;
    return {
      flag,
      kind: "adherence_training",
      title: flag === "ghost" ? copy.training.titleGhost(name) : copy.training.titleMissed(name),
      observation,
      cause,
      rationale: cause,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
      },
    };
  }

  if (flag === "too_fast") {
    const following = nutritionFollowingPlan(d);
    const goal = goalKey(d.goal);
    const observation = copy.tooFast.observation(delta, FLEET_WINDOW_DAYS, target, avg);
    const cause = copy.tooFast.cause[goal];
    const title = goal === "cut" ? copy.tooFast.titleCut(name) : copy.tooFast.titleBulk(name);
    if (following) {
      const card = calorieAdjustmentCard(d, flag, proposal, observation, copy);
      if (card) return card;
    }
    const relance = relanceMessage(flag, d, copy);
    const fullCause = `${cause} ${copy.tooFast.relanceSuffix}`;
    return {
      flag,
      kind: "adherence_nutrition",
      title,
      observation,
      cause: fullCause,
      rationale: `${cause} ${copy.tooFast.rationaleSuffix}`,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause: fullCause,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
      },
    };
  }

  // stall_adherent — following the plan, still off-goal. Complete macros only.
  const observation = copy.kcal.stallObservation(target, avg, d.logged_nutrition_days, delta);
  return calorieAdjustmentCard(d, flag, proposal, observation, copy);
}

function bearerToken(header: string | null): string {
  if (!header) return "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

interface CoachCtx {
  locale: FleetLocale;
  timezone: string;
}

const DEFAULT_FLEET_TIMEZONE = "America/Toronto";

/** Coach language + timezone. One query each for the whole round. */
async function fetchCoachContext(admin: SupabaseClient, coachIds: string[]): Promise<Map<string, CoachCtx>> {
  const out = new Map<string, CoachCtx>();
  const ids = [...new Set(coachIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const [{ data: profiles, error: pErr }, { data: settings, error: sErr }] = await Promise.all([
    admin.from("user_profiles").select("id, language").in("id", ids),
    admin.from("coach_settings").select("coach_id, timezone").in("coach_id", ids),
  ]);
  if (pErr) console.error("fetch coach locales", pErr.message);
  if (sErr) console.error("fetch coach timezones", sErr.message);
  const tzByCoach = new Map<string, string>();
  for (const row of settings ?? []) {
    const r = asObject(row);
    if (typeof r.coach_id === "string" && typeof r.timezone === "string" && r.timezone.trim()) {
      tzByCoach.set(r.coach_id, r.timezone.trim());
    }
  }
  for (const id of ids) {
    out.set(id, { locale: "fr", timezone: tzByCoach.get(id) ?? DEFAULT_FLEET_TIMEZONE });
  }
  for (const row of profiles ?? []) {
    const r = asObject(row);
    if (typeof r.id !== "string") continue;
    const prev = out.get(r.id) ?? { locale: "fr" as FleetLocale, timezone: DEFAULT_FLEET_TIMEZONE };
    out.set(r.id, { locale: fleetLocale(r.language), timezone: prev.timezone });
  }
  return out;
}

async function writeCard(
  admin: SupabaseClient,
  d: Dossier,
  card: FleetCard,
): Promise<string | null> {
  const { data, error } = await admin.rpc("upsert_coach_intervention", {
    p_coach_id: d.coach_id,
    p_client_id: d.client_id,
    p_kind: card.kind,
    p_rationale: card.rationale,
    p_payload: card.payload,
    p_title: card.title,
    p_source: FLEET_SOURCE,
  });
  if (error) {
    console.error("upsert fleet card", error.message);
    return null;
  }
  return data ? String(data) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const token = bearerToken(authHeader);
    const webhookKey = (req.headers.get("X-Webhook-Key") ?? req.headers.get("X-Sender-Key") ?? "").trim();
    const cronSecret = (Deno.env.get("FLEET_CRON_SECRET") ?? "").trim();
    const isService = (token.length > 0 && token === serviceKey)
      || (cronSecret.length > 0 && (token === cronSecret || webhookKey === cronSecret));

    let coachId: string | null = null;
    if (!isService) {
      if (!authHeader) return json(401, { error: "unauthorized" });
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json(401, { error: "unauthorized" });
      const { data: account, error: accountError } = await userClient.rpc("get_my_account_context");
      if (accountError || account?.user_id !== user.id || account?.coach_capability !== true) {
        return json(403, { error: "not_coach" });
      }
      coachId = user.id;
    }

    const body = asObject(await req.json().catch(() => ({})));
    const trigger = isService && (body.trigger === "cron" || str(body.trigger) === "cron")
      ? "cron"
      : "on_demand";
    if (isService && typeof body.coach_id === "string" && body.coach_id) {
      coachId = body.coach_id;
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roundRow, error: roundErr } = await admin
      .from("coach_ai_rounds")
      .insert({
        coach_id: coachId,
        trigger,
        model_used: null,
      })
      .select("id")
      .maybeSingle();
    if (roundErr) {
      return json(500, { error: roundErr.message });
    }
    const roundId = roundRow?.id as string | undefined;

    const { data: triage, error: triageErr } = await admin.rpc("triage_coach_fleet", {
      p_coach_id: coachId,
    });
    if (triageErr) {
      if (roundId) {
        await admin.from("coach_ai_rounds").update({
          finished_at: new Date().toISOString(),
          error: triageErr.message,
        }).eq("id", roundId);
      }
      return json(500, { error: triageErr.message });
    }

    const rows = Array.isArray(triage) ? triage : [];
    const dossiers = rows
      .map((row) => mapDossier(asObject(row)))
      .filter((d): d is Dossier => !!d);

    const now = new Date();
    const ctxByCoach = await fetchCoachContext(admin, dossiers.map((d) => d.coach_id));
    const decisionLogs = await loadDecisionLogs(admin, dossiers.map((d) => d.client_id));
    const openSignals = await loadOpenSignals(admin, dossiers.map((d) => d.client_id));

    let flagged = 0;
    let skipped = 0;
    const written: Array<{ client_id: string; flag: string; kind: string; title: string; action: string }> = [];

    for (const d of dossiers) {
      const ctx = ctxByCoach.get(d.coach_id);
      const today = todayInTimeZone(now, ctx?.timezone ?? DEFAULT_FLEET_TIMEZONE);
      await persistWeeklyReview(
        admin,
        d,
        today,
        openSignals.get(d.client_id) ?? [],
        decisionLogs.get(d.client_id) ?? [],
      );
      const plan = planWrite(d, today, ctx?.locale ?? "fr", decisionLogs.get(d.client_id) ?? []);
      if (plan.action === "skip" || !plan.card) {
        skipped += 1;
        continue;
      }
      flagged += 1;
      const id = await writeCard(admin, d, plan.card);
      if (id) {
        written.push({
          client_id: d.client_id,
          flag: plan.card.flag,
          kind: plan.card.kind,
          title: plan.card.title,
          action: plan.action,
        });
      }
    }

    if (roundId) {
      await admin.from("coach_ai_rounds").update({
        finished_at: new Date().toISOString(),
        clients_seen: dossiers.length,
        clients_flagged: flagged,
        clients_skipped: skipped,
        model_used: MODEL_USED,
        payload: { cards: written },
      }).eq("id", roundId);
    }

    if (coachId) {
      await admin.from("ai_usage_logs").insert({
        user_id: coachId,
        function_name: "coach-fleet-round",
      });
    }

    return json(200, {
      status: "ok",
      trigger,
      model_used: MODEL_USED,
      clients_seen: dossiers.length,
      clients_flagged: flagged,
      clients_skipped: skipped,
      cards: written,
      round_id: roundId ?? null,
    });
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
