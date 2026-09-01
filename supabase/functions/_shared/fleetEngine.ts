/**
 * Moteur de tournée coach — logique PURE, partagée.
 *
 * Ce fichier n'importe RIEN de Deno, aucune URL distante, aucun accès réseau
 * ou base. `coach-fleet-round/index.ts` l'importe par chemin relatif pour le
 * HTTP / l'auth / les appels Supabase, et les tests Node l'importent tel quel :
 * les tests valident donc le code qui tourne réellement en production.
 */
export const FLEET_SOURCE = "fleet";
export const FLEET_WINDOW_DAYS = 14;
export const GHOST_IDLE_DAYS = 10;
export const NEW_CLIENT_DAYS = 7;
export const OVEREAT_RATIO = 1.15;
export const UNDER_EAT_RATIO = 0.85;
export const MIN_NUTRITION_LOG_DAYS = 4;
export const CUT_STALL_MIN_DELTA_KG = -0.2;
export const CUT_TOO_FAST_PCT_PER_WEEK = 1.5;
export const BULK_TOO_FAST_PCT_PER_WEEK = 0.7;
export const KEEP_IN_TOUCH_DAYS = 7;
export const FLEET_HANDLE_COOLDOWN_DAYS = 7;
export const MACRO_KCAL_TOLERANCE = 0.15;
export const LLM_TIMEOUT_MS = 20_000;
export const MAX_LLM_PER_RUN = 20;
export const WEEKLY_SMALL_KCAL = 100;
export const WEEKLY_LARGE_KCAL = 200;
export const WEEKLY_CARB_SHIFT_G = 35;
export const FATIGUE_TRAINING_MAX = 2.5;
export const CUT_GAIN_MIN_DELTA_KG = 0.3;

export type FleetFlag =
  | "on_track"
  | "onboarding"
  | "ghost"
  | "adherence_nutrition"
  | "adherence_training"
  | "too_fast"
  | "stall_adherent"
  | "keep_in_touch";

export interface Dossier {
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
  last_message_at: string | null;
  last_coach_message_at: string | null;
  last_keep_in_touch_at: string | null;
  pending_fleet: boolean;
  fleet_handled: FleetHandled[];
}

export interface FleetEvidence {
  avg_calories: number;
  logged_nutrition_days: number;
  workout_count: number;
  checkin_count: number;
  weight_delta_kg: number | null;
  last_nutrition_at: string | null;
  last_workout_at: string | null;
  last_checkin_at: string | null;
}

export interface FleetHandled {
  kind: string;
  flag: string;
  status: string;
  handled_at: string;
  evidence: FleetEvidence | null;
}

export interface CalorieDraft {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FleetCard {
  flag: FleetFlag;
  kind: string;
  title: string;
  observation: string;
  cause: string;
  rationale: string;
  payload: Record<string, unknown>;
}
export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "toi";
  if (trimmed.includes("@")) return trimmed.split("@")[0] ?? trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function normalizeGoal(goal: string | null | undefined): "cut" | "bulk" | "maintain" | "" {
  const g = (goal || "").trim().toLowerCase();
  if (g === "cut" || g === "lose" || g === "fat_loss" || g === "weight_loss") return "cut";
  if (g === "bulk" || g === "gain" || g === "muscle") return "bulk";
  if (g === "maintain" || g === "recomp") return "maintain";
  return "";
}

export function adherenceOnFive(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 5) return Math.round(raw * 10) / 10;
  return Math.round((raw / 20) * 10) / 10;
}

export function overeatRatio(avg: number, target: number): number {
  if (target <= 0 || avg <= 0) return 0;
  return avg / target;
}

export function weeklyWeightPct(deltaKg: number | null, startKg: number | null, windowDays = FLEET_WINDOW_DAYS): number | null {
  if (deltaKg == null || startKg == null || startKg <= 0 || windowDays <= 0) return null;
  return (deltaKg / startKg) * 100 / (windowDays / 7);
}

export function isCompleteCalorieDraft(draft: CalorieDraft | null | undefined): boolean {
  if (!draft) return false;
  if (draft.calories < 800 || draft.calories > 8000) return false;
  if (draft.protein <= 0 || draft.carbs <= 0 || draft.fat <= 0) return false;
  const fromMacros = draft.protein * 4 + draft.carbs * 4 + draft.fat * 9;
  return Math.abs(fromMacros - draft.calories) <= draft.calories * MACRO_KCAL_TOLERANCE;
}

export function completeMacrosFor(calories: number, goal: string, weightKg: number): CalorieDraft {
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

export function clampCalories(n: number): number {
  return Math.min(8000, Math.max(800, Math.round(n)));
}

export function nutritionFollowingPlan(d: Dossier): boolean {
  if (d.calorie_target <= 0 || d.logged_nutrition_days < MIN_NUTRITION_LOG_DAYS) return false;
  const ratio = overeatRatio(d.avg_calories, d.calorie_target);
  if (ratio >= OVEREAT_RATIO || ratio <= UNDER_EAT_RATIO) return false;
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  if (adh != null && adh <= 2) return false;
  return true;
}

export function currentOrIssnDraft(d: Dossier): CalorieDraft {
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

export function signsOfFatigue(d: Dossier): boolean {
  const training = adherenceOnFive(d.avg_adherence_training);
  return training != null && training <= FATIGUE_TRAINING_MAX;
}

export function shiftCarbsKeepCalories(draft: CalorieDraft, extraCarbs = WEEKLY_CARB_SHIFT_G): CalorieDraft {
  const protein = Math.max(1, draft.protein);
  const carbs = Math.max(1, draft.carbs + extraCarbs);
  const remaining = draft.calories - protein * 4 - carbs * 4;
  const fat = Math.max(1, Math.round(remaining / 9));
  return { calories: Math.round(draft.calories), protein, carbs, fat };
}

export type WeeklyNutritionReason =
  | "keep"
  | "not_following"
  | "cut_stall"
  | "cut_gain"
  | "too_fast_cut"
  | "bulk_stall"
  | "bulk_too_fast"
  | "carb_support";

export interface WeeklyNutritionProposal {
  action: "keep" | "relance" | "calorie_adjustment";
  reason: WeeklyNutritionReason;
  draft: CalorieDraft | null;
}

export function proposeWeeklyNutrition(d: Dossier): WeeklyNutritionProposal {
  if (!nutritionFollowingPlan(d)) {
    return { action: "relance", reason: "not_following", draft: null };
  }
  const weight = d.weight_end_kg || d.weight_kg;
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  const goal = normalizeGoal(d.goal);
  const current = currentOrIssnDraft(d);
  if (signsOfFatigue(d)) {
    return { action: "calorie_adjustment", reason: "carb_support", draft: shiftCarbsKeepCalories(current) };
  }
  const delta = d.weight_delta_kg;
  const pct = weeklyWeightPct(delta, d.weight_start_kg ?? d.weight_kg);
  if (goal === "cut") {
    if (pct != null && pct <= -CUT_TOO_FAST_PCT_PER_WEEK) {
      return { action: "calorie_adjustment", reason: "too_fast_cut", draft: completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight) };
    }
    if (delta != null && delta >= CUT_GAIN_MIN_DELTA_KG) {
      return { action: "calorie_adjustment", reason: "cut_gain", draft: completeMacrosFor(clampCalories(base - WEEKLY_LARGE_KCAL), d.goal, weight) };
    }
    if (delta != null && delta >= CUT_STALL_MIN_DELTA_KG) {
      return { action: "calorie_adjustment", reason: "cut_stall", draft: completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight) };
    }
    return { action: "keep", reason: "keep", draft: null };
  }
  if (goal === "bulk") {
    if (pct != null && pct >= BULK_TOO_FAST_PCT_PER_WEEK) {
      return { action: "calorie_adjustment", reason: "bulk_too_fast", draft: completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight) };
    }
    if (delta != null && delta <= 0.1) {
      return { action: "calorie_adjustment", reason: "bulk_stall", draft: completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight) };
    }
    return { action: "keep", reason: "keep", draft: null };
  }
  if (delta != null && Math.abs(delta) >= 1.5) {
    const dir = delta > 0 ? -WEEKLY_SMALL_KCAL : WEEKLY_SMALL_KCAL;
    return {
      action: "calorie_adjustment",
      reason: delta > 0 ? "cut_gain" : "bulk_stall",
      draft: completeMacrosFor(clampCalories(base + dir), d.goal, weight),
    };
  }
  return { action: "keep", reason: "keep", draft: null };
}

export function mapDossier(raw: Record<string, unknown>): Dossier | null {
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
    last_message_at: str(dossierRaw.last_message_at),
    last_coach_message_at: str(dossierRaw.last_coach_message_at),
    last_keep_in_touch_at: str(dossierRaw.last_keep_in_touch_at),
    pending_fleet: dossierRaw.pending_fleet === true,
    fleet_handled: parseHandled(dossierRaw.fleet_handled),
  };
}

export function parseHandled(raw: unknown): FleetHandled[] {
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
      } : null,
    });
  }
  return rows;
}

export function offGoal(d: Dossier): boolean {
  const goal = normalizeGoal(d.goal);
  const delta = d.weight_delta_kg;
  if (delta == null) return false;
  if (goal === "cut") return delta >= CUT_STALL_MIN_DELTA_KG;
  if (goal === "bulk") return delta <= 0.1;
  if (goal === "maintain") return Math.abs(delta) >= 1.5;
  return false;
}

export function tooFast(d: Dossier): boolean {
  const goal = normalizeGoal(d.goal);
  const pct = weeklyWeightPct(d.weight_delta_kg, d.weight_start_kg ?? d.weight_kg);
  if (pct == null) return false;
  if (goal === "cut") return pct <= -CUT_TOO_FAST_PCT_PER_WEEK;
  if (goal === "bulk") return pct >= BULK_TOO_FAST_PCT_PER_WEEK;
  return false;
}

export function expectedWorkouts(d: Dossier): number {
  const freq = d.training_frequency > 0 ? d.training_frequency : 3;
  return Math.round(freq * (FLEET_WINDOW_DAYS / 7));
}

export function isGhostAt(d: Dossier, today: string): boolean {
  if (d.linked_days < 7) return false;
  const stale = (iso: string | null) => {
    if (!iso) return true;
    const day = iso.slice(0, 10);
    const a = Date.parse(`${day}T00:00:00Z`);
    const b = Date.parse(`${today}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    return Math.round((b - a) / 86_400_000) > GHOST_IDLE_DAYS;
  };
  return stale(d.last_workout_at) && stale(d.last_nutrition_at) && stale(d.last_checkin_at);
}

export function missedTraining(d: Dossier): boolean {
  const expected = expectedWorkouts(d);
  if (expected <= 0) return false;
  return d.workout_count <= Math.max(0, Math.floor(expected * 0.4));
}

export function idleDays(iso: string | null, today: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const day = iso.slice(0, 10);
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

export function shouldOfferKeepInTouch(d: Dossier, today: string): boolean {
  if (idleDays(d.last_coach_message_at, today) < KEEP_IN_TOUCH_DAYS) return false;
  if (d.pending_fleet) return true;
  if (idleDays(d.last_keep_in_touch_at, today) < KEEP_IN_TOUCH_DAYS) return false;
  return true;
}

export function keepInTouchLooksLikeLecture(body: string): boolean {
  return /\b(kcal|calories?|macros?|stagne|descends)\b/i.test(body);
}

export function fleetSignalKey(kind: string, flag: string): string {
  return `${kind}:${flag || kind}`;
}

export function evidenceFromDossier(d: Dossier): FleetEvidence {
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
  };
}

export function withEvidence(d: Dossier, card: FleetCard): FleetCard {
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

export function newerDay(next: string | null, prev: string | null): boolean {
  if (!next || !prev) return false;
  return next.slice(0, 10) > prev.slice(0, 10);
}

export function evidenceChanged(prev: FleetEvidence | null | undefined, next: FleetEvidence, flag: string): boolean {
  if (flag === "keep_in_touch") return false;
  if (!prev) return false;
  if (Math.abs((next.avg_calories || 0) - (prev.avg_calories || 0)) >= 150) return true;
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

export function planWrite(
  d: Dossier,
  today: string,
  modelUsed: "openai" | "off",
): { action: "skip" | "upsert" | "insert"; card: FleetCard | null } {
  const raw = buildCard(d, today, modelUsed);
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
  return { action: "insert", card };
}

export function classify(d: Dossier, today: string): FleetFlag {
  if (!d.onboarding_completed || (!d.has_program && !d.setup_completed)) return "onboarding";
  if (d.linked_days < NEW_CLIENT_DAYS && d.workout_count === 0) return "onboarding";
  if (isGhostAt(d, today)) return "ghost";
  const following = nutritionFollowingPlan(d);
  const off = offGoal(d);
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  if (!following && d.logged_nutrition_days >= MIN_NUTRITION_LOG_DAYS && (off || (adh != null && adh <= 2))) {
    return "adherence_nutrition";
  }
  if (!following && d.calorie_target > 0 && d.logged_nutrition_days >= MIN_NUTRITION_LOG_DAYS
    && overeatRatio(d.avg_calories, d.calorie_target) >= OVEREAT_RATIO) {
    return "adherence_nutrition";
  }
  if (missedTraining(d) && d.workout_count + d.checkin_count + d.logged_nutrition_days > 0) {
    return "adherence_training";
  }
  if (tooFast(d)) return "too_fast";
  if (following && off) return "stall_adherent";
  return "on_track";
}

export function relanceMessage(flag: FleetFlag, d: Dossier): { body: string; templateKey: string } {
  const name = firstName(d.full_name);
  const target = d.calorie_target;
  if (flag === "adherence_nutrition") {
    return {
      templateKey: "missed_checkins",
      body: target > 0
        ? `Salut ${name}, tes logs sont clairement au-dessus des ${target} kcal qu’on a posés. On ne touche pas encore à la cible : d’abord on l’applique. Tu me dis ce qui bloque (faim, resto, week-end) et on ajuste le plan autour, pas les chiffres.`
        : `Salut ${name}, tes logs nutrition ne suivent pas le plan. On n’invente pas une nouvelle cible — dis-moi ce qui bloque et on recale la semaine.`,
    };
  }
  if (flag === "ghost") {
    return {
      templateKey: "general_followup",
      body: `Salut ${name}, je ne te vois plus sur l’app depuis un moment (séances, check-ins, nutrition). Tout va bien ? Réponds-moi quand tu peux — on reprend sans te charger.`,
    };
  }
  if (flag === "too_fast") {
    const goal = normalizeGoal(d.goal);
    const tip = goal === "cut" ? "tu perds un peu vite" : goal === "bulk" ? "tu prends un peu vite" : "le rythme sort de la trajectoire";
    return {
      templateKey: "general_followup",
      body: `Salut ${name}, ${tip} sur les ${FLEET_WINDOW_DAYS} derniers jours. On en parle avant de toucher aux cibles — comment tu te sens (faim, énergie, séances) ?`,
    };
  }
  return {
    templateKey: "missed_training",
    body: `Salut ${name}, je n’ai pas vu tes séances récemment. Tout va bien de ton côté ? Dis-moi si on ajuste le programme ou le timing.`,
  };
}

export function calorieAdjustmentCard(
  d: Dossier,
  flag: FleetFlag,
  proposal: WeeklyNutritionProposal,
  observation: string,
  aiOff: boolean,
): FleetCard | null {
  if (proposal.action !== "calorie_adjustment" || !proposal.draft || !isCompleteCalorieDraft(proposal.draft)) {
    return null;
  }
  const name = firstName(d.full_name);
  const tweak = proposal.draft;
  const reason = proposal.reason;
  const titles: Record<string, string> = {
    cut_stall: `${name} stagne malgré l’adhérence`,
    cut_gain: `${name} reprend du poids sur le cut`,
    too_fast_cut: `${name} perd trop vite`,
    bulk_stall: `${name} ne progresse pas malgré l’adhérence`,
    bulk_too_fast: `${name} prend trop vite`,
    carb_support: `${name} — plus de glucides (fatigue / perf)`,
  };
  const causes: Record<string, string> = {
    cut_stall: "Cut plat et plan suivi — petite baisse, macros complètes. Rien ne s’applique tout seul.",
    cut_gain: "Prise de poids sur un cut alors que le plan est suivi — baisse plus franche, macros complètes.",
    too_fast_cut: "Cut trop rapide et plan suivi — on réduit un peu le déficit, macros complètes.",
    bulk_stall: "Pas de prise alors que le plan est suivi — petite hausse, macros complètes.",
    bulk_too_fast: "Bulk trop rapide et plan suivi — on réduit un peu le surplus, macros complètes.",
    carb_support: "Signes de fatigue / perf en baisse — plus de glucides, pas une nouvelle coupe calorie.",
  };
  const cause = causes[reason] || "Proposition data-driven, macros complètes. Le coach confirme.";
  return {
    flag,
    kind: "calorie_adjustment",
    title: titles[reason] || `${name} — ajustement nutrition`,
    observation,
    cause,
    rationale: `${cause} ${tweak.calories} / P${tweak.protein} C${tweak.carbs} F${tweak.fat}.`,
    payload: {
      source: FLEET_SOURCE,
      flag,
      observation,
      cause,
      reason,
      ai_off: aiOff,
      nutrition: tweak,
      calories: tweak.calories,
      protein: tweak.protein,
      carbs: tweak.carbs,
      fat: tweak.fat,
    },
  };
}

export function fmtDelta(delta: number | null): string {
  if (delta == null) return "—";
  return delta > 0 ? `+${delta}` : String(delta);
}

export function buildCard(d: Dossier, today: string, modelUsed: "openai" | "off"): FleetCard | null {
  const clinical = classify(d, today);
  const name = firstName(d.full_name);
  const aiOff = modelUsed === "off";
  const proposal = proposeWeeklyNutrition(d);

  if (clinical === "on_track") {
    if (proposal.action === "calorie_adjustment" && proposal.reason === "carb_support") {
      const observation = `Cible ${d.calorie_target} kcal, logs ~${Math.round(d.avg_calories)}, poids ${fmtDelta(d.weight_delta_kg)} kg. Fatigue / perf.`;
      return calorieAdjustmentCard(d, "on_track", proposal, observation, aiOff);
    }
    if (!shouldOfferKeepInTouch(d, today)) return null;
    const silentDays = idleDays(d.last_coach_message_at, today);
    const observation = Number.isFinite(silentDays)
      ? `Ça va côté logs. Pas de contact coach depuis ${silentDays} jours.`
      : "Ça va côté logs. Pas de message coach dans le fil.";
    const cause = "Garder le lien — pas un stall, pas une lecture calories.";
    const body = `Salut ${name}, petit check de la semaine — comment tu vas ? L’entraînement passe bien, et tu as besoin de quelque chose ?`;
    return {
      flag: "keep_in_touch",
      kind: "keep_in_touch",
      title: `Prendre des nouvelles de ${name}`,
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
        ai_off: aiOff,
      },
    };
  }

  const flag = clinical;
  const ratio = overeatRatio(d.avg_calories, d.calorie_target);
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  const delta = fmtDelta(d.weight_delta_kg);

  if (flag === "onboarding") {
    const observation = !d.onboarding_completed
      ? "Nouveau client, onboarding incomplet."
      : !d.has_program
        ? "Onboarding fait, pas encore de programme assigné."
        : `Nouveau client (J+${d.linked_days}), aucune séance encore.`;
    const cause = d.has_program
      ? "Première semaine — setup, pas un stall."
      : "Pas un stall : il n’a pas encore de plan à suivre.";
    const title = d.has_program
      ? `${name} — première semaine`
      : `${name} — configurer le plan`;
    return {
      flag,
      kind: "onboarding_plan",
      title,
      observation,
      cause,
      rationale: "Nouveau client — setup, pas une relance de stall.",
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        ai_off: aiOff,
        notes: `Configure le suivi et le programme de ${name}. Les calories ISSN du profil restent en place tant que tu ne les écris pas.`,
      },
    };
  }

  if (flag === "adherence_nutrition") {
    const relance = relanceMessage(flag, d);
    const observation = d.calorie_target > 0
      ? `Cible ${d.calorie_target} kcal, logs ~${Math.round(d.avg_calories)} (${d.logged_nutrition_days} j)${adh != null ? `, adhérence ${adh}/5` : ""}, poids ${delta} kg.`
      : `Logs nutrition hors plan (${d.logged_nutrition_days} j), poids ${delta} kg.`;
    const cause = d.calorie_target > 0 && ratio >= OVEREAT_RATIO
      ? `Il n’applique pas les ${d.calorie_target} — on ne coupe pas les calories tant que le plan n’est pas suivi.`
      : "Le plan nutrition n’est pas suivi. Relancer, pas une nouvelle cible.";
    const title = d.calorie_target > 0
      ? `Il n’applique pas les ${d.calorie_target}`
      : "Il n’applique pas le plan nutrition";
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
        ai_off: aiOff,
        current_calories: d.calorie_target,
        avg_calories: Math.round(d.avg_calories),
      },
    };
  }

  if (flag === "ghost" || flag === "adherence_training") {
    const relance = relanceMessage(flag, d);
    const observation = flag === "ghost"
      ? `Pas de séance, check-in ni nutrition depuis plus de ${GHOST_IDLE_DAYS} jours.`
      : `Séances ${d.workout_count}/${expectedWorkouts(d)} sur ${FLEET_WINDOW_DAYS} jours.`;
    const cause = flag === "ghost"
      ? "Client ghost — Relancer, pas de nutrition inventée, pas de chiffres de récup."
      : "Séances manquées — Relancer, pas un nouveau programme.";
    return {
      flag,
      kind: "adherence_training",
      title: flag === "ghost" ? `${name} a disparu` : `${name} ne suit pas les séances`,
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
        ai_off: aiOff,
      },
    };
  }

  if (flag === "too_fast") {
    const following = nutritionFollowingPlan(d);
    const goal = normalizeGoal(d.goal);
    const observation = `Poids ${delta} kg sur ${FLEET_WINDOW_DAYS} j${d.calorie_target ? `, logs ~${Math.round(d.avg_calories)} vs ${d.calorie_target}` : ""}.`;
    const cause = goal === "cut" ? "Cut trop rapide." : goal === "bulk" ? "Bulk trop rapide." : "Rythme hors trajectoire.";
    const title = goal === "cut" ? `${name} perd trop vite` : `${name} prend trop vite`;
    if (following) {
      const card = calorieAdjustmentCard(d, flag, proposal, observation, aiOff);
      if (card) return card;
    }
    const relance = relanceMessage(flag, d);
    return {
      flag,
      kind: "adherence_nutrition",
      title,
      observation,
      cause: `${cause} Relancer avant de toucher aux cibles.`,
      rationale: `${cause} Relancer.`,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause: `${cause} Relancer avant de toucher aux cibles.`,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
        ai_off: aiOff,
      },
    };
  }

  const observation = `Cible ${d.calorie_target} kcal, logs ~${Math.round(d.avg_calories)} (${d.logged_nutrition_days} j), poids ${delta} kg. Plan suivi.`;
  const card = calorieAdjustmentCard(d, flag, proposal, observation, aiOff);
  if (card) return card;
  return null;
}

export function fleetCardNeedsLlm(kind: string): boolean {
  // Relancer templates + data-driven kcal are already the proposal.
  return kind === "program_adjustment";
}

export const SYSTEM_PROMPT = `Tu es l'IA de tournée coach de Prometheus. Tu n'es appelé QUE pour un ajustement de programme (program_adjustment). Relancer et kcal+macros sont déjà posés en déterministe. Rien ne s'applique tout seul.
Règles (français, tutoiement, tu tutoyes le client dans le message) :
- Si le client n'applique PAS la nutrition (logs >> cible, adhérence basse) : kind adherence_nutrition. Message Relancer. JAMAIS calorie_adjustment. JAMAIS « descends à 2000 » ni macros 0. On ne change PAS les cibles.
- Séances manquées / ghost : adherence_training, Relancer. Pas de nouveau programme. Pas de chiffres de récup inventés. Ghost n'est PAS keep_in_touch (Relancer fort).
- Changement calories/macros SEULEMENT s'il APPLIQUE le plan. Trajectoire réelle, pas un offset générique ±150 :
  CUT : perte normale → keep ; stall plat → petite baisse (~100) ; reprise de poids → baisse plus franche (~200) ; fatigue/perf → plus de glucides, pas une coupe.
  BULK : prise normale → keep ; pas de prise → petite hausse (~100) ; trop vite → réduire un peu le surplus (~100) ; fatigue → plus de glucides.
  Macros COMPLÈTES : protein, carbs, fat tous > 0 et kcal ≈ P*4+C*4+F*9. ISSN = formule app (Revenir à l'ISSN), pas le tweak hebdo.
- Nouveau client : onboarding_plan, pas un stall.
- On-track + le coach n'a pas écrit depuis ~7 jours : kind keep_in_touch. Message léger (comment tu vas, entraînement, besoin de quelque chose). PAS un stall, PAS une lecture calories, PAS de fausse urgence. JAMAIS adherence_nutrition ni ghost.
- On-track + le coach a déjà écrit cette semaine : tu ne dois pas être appelé.
Réponds JSON uniquement : { "kind", "title", "observation", "cause", "body", "nutrition": { "calories", "protein", "carbs", "fat" } | null }.
ISSN reste la formule app. Tu n'écrases pas l'onboarding.
Les leçons du coach (si présentes) sont des patterns stables : ton, Relancer vs cibles, split macros. Ne copie pas une erreur ponctuelle.`;

export function mergeLlm(raw: Record<string, unknown>, fallback: FleetCard, d: Dossier): FleetCard {
  const flag = fallback.flag;
  let kind = typeof raw.kind === "string" ? raw.kind : fallback.kind;
  if (flag === "adherence_nutrition" && kind === "calorie_adjustment") kind = "adherence_nutrition";
  if (flag === "ghost" && kind !== "adherence_training") kind = "adherence_training";
  if (flag === "keep_in_touch") kind = "keep_in_touch";
  if (flag === "onboarding") kind = "onboarding_plan";
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : fallback.title;
  const observation = typeof raw.observation === "string" && raw.observation.trim()
    ? raw.observation.trim()
    : fallback.observation;
  const cause = typeof raw.cause === "string" && raw.cause.trim() ? raw.cause.trim() : fallback.cause;
  let body = typeof raw.body === "string" && raw.body.trim()
    ? raw.body.trim()
    : typeof fallback.payload.body === "string" ? fallback.payload.body : "";
  if (flag === "keep_in_touch" && keepInTouchLooksLikeLecture(body)) {
    body = typeof fallback.payload.body === "string" ? fallback.payload.body : body;
  }

  if (kind === "calorie_adjustment" && (flag === "stall_adherent" || flag === "too_fast" || flag === "on_track")) {
    const nested = asObject(raw.nutrition);
    const draft: CalorieDraft = {
      calories: Math.round(num(nested.calories ?? raw.calories, 0)),
      protein: Math.round(num(nested.protein ?? raw.protein, 0)),
      carbs: Math.round(num(nested.carbs ?? raw.carbs, 0)),
      fat: Math.round(num(nested.fat ?? raw.fat, 0)),
    };
    const proposal = proposeWeeklyNutrition(d);
    const safe = isCompleteCalorieDraft(draft)
      ? draft
      : (proposal.draft && isCompleteCalorieDraft(proposal.draft) ? proposal.draft : completeMacrosFor(d.calorie_target || 2000, d.goal, d.weight_kg));
    return {
      flag,
      kind: "calorie_adjustment",
      title,
      observation,
      cause,
      rationale: cause,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        reason: proposal.reason,
        ai_off: false,
        nutrition: safe,
        calories: safe.calories,
        protein: safe.protein,
        carbs: safe.carbs,
        fat: safe.fat,
      },
    };
  }

  return {
    ...fallback,
    title,
    observation,
    cause,
    rationale: cause,
    payload: {
      ...fallback.payload,
      observation,
      cause,
      body,
      notes: body || fallback.payload.notes,
      ai_off: false,
    },
  };
}

/** Alias de lecture : une carte complète, preuves incluses (ce qu'écrit la tournée). */
export function buildFleetCard(
  d: Dossier,
  today: string,
  modelUsed: "openai" | "off" = "off",
): FleetCard | null {
  const card = buildCard(d, today, modelUsed);
  return card ? withEvidence(d, card) : null;
}

export const classifyFleetDossier = classify;
export const planFleetRoundCard = planWrite;
export const fleetEvidenceFromDossier = evidenceFromDossier;
export const fleetEvidenceChanged = evidenceChanged;

/** Applique la sortie LLM à la carte déterministe correspondante. */
export function sanitizeLlmCard(
  raw: Record<string, unknown>,
  d: Dossier,
  today: string,
): FleetCard | null {
  const fallback = buildFleetCard(d, today, "openai");
  if (!fallback) return null;
  return withEvidence(d, mergeLlm(raw, fallback, d));
}
