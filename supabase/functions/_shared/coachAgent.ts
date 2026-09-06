import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { asObject, openaiJson } from "./openaiJson.ts";

export const AGENT_SOURCE = "agent";
export const AGENT_KINDS = new Set([
  "onboarding_plan",
  "ask_prometheus",
  "program_nl_edit",
  "calorie_adjustment",
]);
export const LESSONS_LIMIT = 8;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Key, X-Sender-Key",
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export interface CoachLesson {
  kind: string;
  proposed: unknown;
  accepted: unknown;
  note: string | null;
}

export interface CoachAgentInput {
  kind: string;
  coachId: string;
  clientId: string | null;
  programId: string | null;
  prompt: string;
  screen: string;
  context: Record<string, unknown>;
  /** Language of everything the coach / client will read. Follows the caller's UI language. */
  locale: AgentLocale;
}

export type AgentLocale = "fr" | "en";

export function parseLocale(raw: unknown): AgentLocale {
  return asString(raw).toLowerCase().startsWith("en") ? "en" : "fr";
}

const OUTPUT_LANGUAGE: Record<AgentLocale, string> = {
  fr: "Langue de sortie : FRANÇAIS, tutoiement. Tu tutoyes le client dans les messages.",
  en: "OUTPUT LANGUAGE: ENGLISH for everything the coach or the client will read (title, notes, cause, observation, body, program / day names, descriptions). Informal, direct tone with the client.",
};

const L = {
  fr: {
    titleOnboarding: "Programme IA — brouillon",
    titleNl: "Édition programme — brouillon",
    titleKcal: "Ajustement calories — brouillon",
    titleAsk: "Ask Prometheus — brouillon",
    fallbackNotes: "Brouillon déterministe (filet de sécurité). Tu édites, puis tu envoies. Pas de calories.",
    programDescription: "Brouillon déterministe 3–5 jours / 4–6 exercices. Tu édites, puis tu envoies. Pas de calories.",
    noviceBase: (who: string) => `Base novice — ${who}`,
    programDays: (n: number, who: string) => `Programme ${n}j — ${who}`,
    nlLastSession: "Ajustement léger proposé d’après la dernière séance.",
    nlRecovery: "Ajustement léger proposé d’après la récupération loggée.",
    nlExercise: "Ajustement léger proposé d’après la série.",
    nlDefault: "Ajustement de programme — brouillon à éditer, rien ne s’applique tout seul.",
    askIncomplete: "L'agent n'a pas pu rédiger un texte complet. Tu édites, puis tu envoies. Rien ne s'applique tout seul.",
  },
  en: {
    titleOnboarding: "AI program — draft",
    titleNl: "Program edit — draft",
    titleKcal: "Calorie adjustment — draft",
    titleAsk: "Ask Prometheus — draft",
    fallbackNotes: "Deterministic draft (safety net). You edit, then you send. No calories.",
    programDescription: "Deterministic draft, 3–5 days / 4–6 exercises. You edit, then you send. No calories.",
    noviceBase: (who: string) => `Novice base — ${who}`,
    programDays: (n: number, who: string) => `${n}-day program — ${who}`,
    nlLastSession: "Light adjustment proposed from the last session.",
    nlRecovery: "Light adjustment proposed from the logged recovery.",
    nlExercise: "Light adjustment proposed from the set.",
    nlDefault: "Program adjustment — draft to edit, nothing applies on its own.",
    askIncomplete: "The agent could not write a complete text. You edit, then you send. Nothing applies on its own.",
  },
} as const;

const LESSON_RULE =
  "Les leçons ci-dessous sont des corrections de CE coach. Extraire des patterns stables (ton, tutoiement, Relancer vs changement de cibles, split macros, densité du programme). Ne copie pas une erreur ponctuelle ni un one-off.";

const LANGUAGE_LINE = "__OUTPUT_LANGUAGE__";

/** FR by default; `systemPrompt(locale)` swaps the language line. */
export const SYSTEM_PROMPT = `Tu es l'agent coach in-app de Prometheus. Tu prépares UN brouillon. Rien ne s'applique tout seul. Le coach accepte ou édite, puis envoie.
${LANGUAGE_LINE}
Si "intake" est présent (questionnaire d'accueil rempli par le client), c'est TA source principale pour le programme : respecte lieu, equipement, extras.available_weekdays (0=dimanche … 6=samedi), seancesRealistes, dureeIdeale, niveauActuel, typesExercices, exercicesDetestes, mouvementAEviter, descriptionBlessures. Ne prescris jamais un exercice qui exige un équipement absent de la liste ni un mouvement à éviter.
intake.medical_flags non vide (condition cardiaque / HTA / douleurs thoraciques, étourdissements, restriction médicale) → programme conservateur, intensité modérée, et une note explicite au coach dans "notes" pour qu'il vérifie avant d'envoyer.
ISSN reste la formule de l'app — tu n'écrases pas les calories d'onboarding. « Revenir à l'ISSN » = cette formule, pas un seed.
Levier : adhérence / Relancer d'abord si le client n'applique PAS le plan (logs >> cible, adhérence basse, ghost, séances manquées). JAMAIS une coupe calorie ni un nouveau programme dans ces cas. JAMAIS des macros 0. On ne change PAS les cibles s'il ne suit pas.
Changement kcal/macros SEULEMENT s'il APPLIQUE le plan. Trajectoire réelle, pas un offset générique ±150 :
CUT : perte normale → keep ; stall plat → petite baisse (~100) ; reprise de poids → baisse plus franche (~200) ; fatigue/perf → plus de glucides, pas une coupe.
BULK : prise normale → keep ; pas de prise → petite hausse (~100) ; trop vite → réduire un peu le surplus (~100) ; fatigue → plus de glucides.
Macros COMPLÈTES : protein, carbs, fat tous > 0 et kcal ≈ P*4+C*4+F*9.
Nouveau client : onboarding_plan / première semaine, pas un stall.
Pas de CRM. Pas d'auto-apply.
${LESSON_RULE}
Réponds JSON uniquement, sans markdown.`;

export function systemPrompt(locale: AgentLocale): string {
  return SYSTEM_PROMPT.replace(LANGUAGE_LINE, OUTPUT_LANGUAGE[locale]);
}

function kindSchema(kind: string): string {
  if (kind === "onboarding_plan") {
    return `Schéma onboarding_plan :
{
  "title": string,
  "notes": string,
  "program": {
    "name": string,
    "description": string,
    "duration_weeks": number,
    "days": [{ "weekday": 0-6, "name": string, "exercises": [{ "name": string, "default_sets": number, "default_reps": number, "default_reps_min": number|null, "default_rir": number|null, "default_rest_seconds": number }] }]
  },
  "tracking": { "track_weight": boolean, "track_checkins": boolean, "track_nutrition": boolean, "track_workouts": boolean, "workout_focus": string }
}
PAS de calories, macros, ni recettes. 3 à 5 jours, 4 à 6 exercices par jour, adaptés au profil.
Si intake est présent : nombre de jours = intake.seancesRealistes (borné 2–6) ; weekday de chaque jour pris dans intake.extras.available_weekdays quand la liste existe.`;
  }
  if (kind === "program_nl_edit") {
    return `Schéma program_nl_edit :
{
  "title": string,
  "cause": string,
  "notes": string,
  "patch": { "exercise": string, "weekday": number|null, "default_sets": number, "default_reps": number, "default_reps_min": number|null, "default_rir": number|null, "replace_with": string } | null,
  "program": { "name": string, "description": string, "duration_weeks": number, "days": [...] } | null
}
cause = UNE phrase courte pour le coach (dans la langue de sortie), jamais du JSON, des logs, ni le prompt brut.
Si l'édition vise UN exercice, remplis patch. Si elle reconstruit le programme, remplis program.`;
  }
  if (kind === "calorie_adjustment") {
    return `Schéma calorie_adjustment (seulement si adhérence OK et hors objectif) :
{
  "title": string,
  "observation": string,
  "cause": string,
  "notes": string,
  "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number }
}
Si le client n'applique pas le plan : kind implicite adherence — mets "body" Relancer et nutrition null.`;
  }
  return `Schéma ask_prometheus :
{
  "title": string,
  "answer": string,
  "notes": string,
  "body": string,
  "patch": object | null,
  "program": object | null,
  "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number } | null
}
answer/notes/body = le brouillon éditable. Nutrition seulement si adhérence + hors objectif, macros complètes.`;
}

export function formatLessonsForPrompt(lessons: CoachLesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map((row, i) => {
    const note = row.note?.trim() ? ` note=${row.note.trim()}` : "";
    return `${i + 1}. kind=${row.kind}${note}\n   proposé: ${JSON.stringify(row.proposed)}\n   envoyé: ${JSON.stringify(row.accepted)}`;
  });
  return ["Corrections récentes de CE coach :", ...lines].join("\n");
}

export async function fetchCoachLessons(
  admin: SupabaseClient,
  coachId: string,
  kind?: string,
): Promise<CoachLesson[]> {
  const { data } = await admin
    .from("coach_agent_lessons")
    .select("kind, proposed, accepted, note, created_at")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(LESSONS_LIMIT);
  const rows = Array.isArray(data) ? data : [];
  const mapped: CoachLesson[] = rows.map((row) => {
    const r = asObject(row);
    return {
      kind: asString(r.kind) || "other",
      proposed: r.proposed ?? {},
      accepted: r.accepted ?? {},
      note: asString(r.note) || null,
    };
  });
  if (!kind) return mapped;
  const same = mapped.filter((l) => l.kind === kind);
  const other = mapped.filter((l) => l.kind !== kind);
  return [...same, ...other].slice(0, LESSONS_LIMIT);
}

function lessonSnapshot(kind: string, payload: Record<string, unknown>): Record<string, unknown> {
  const snap: Record<string, unknown> = { kind };
  for (const key of [
    "title", "answer", "notes", "body", "suggestion", "observation", "cause",
    "program", "tracking", "patch", "nutrition", "calories", "protein", "carbs", "fat",
  ]) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      snap[key] = payload[key];
    }
  }
  return snap;
}

function sanitizeExercises(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((item) => {
    const ex = asObject(item);
    const name = asString(ex.name);
    return {
      name,
      default_sets: Math.max(1, Math.round(num(ex.default_sets, 3))),
      default_reps: Math.max(1, Math.round(num(ex.default_reps, 10))),
      default_reps_min: ex.default_reps_min == null || ex.default_reps_min === ""
        ? null
        : Math.max(1, Math.round(num(ex.default_reps_min, 0))) || null,
      default_rir: ex.default_rir == null || ex.default_rir === "" ? null : num(ex.default_rir, 0),
      default_rest_seconds: Math.max(0, Math.round(num(ex.default_rest_seconds, 90))),
    };
  }).filter((ex) => asString(ex.name).length > 0);
}

function sanitizeDays(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 7).map((item, index) => {
    const day = asObject(item);
    return {
      weekday: Math.min(6, Math.max(0, Math.round(num(day.weekday, index % 7)))),
      name: asString(day.name) || `Jour ${index + 1}`,
      exercises: sanitizeExercises(day.exercises),
    };
  }).filter((day) => (day.exercises as unknown[]).length > 0);
}

function sanitizeProgram(raw: unknown): Record<string, unknown> | null {
  const src = asObject(raw);
  const days = sanitizeDays(src.days);
  const name = asString(src.name);
  if (!name && days.length === 0) return null;
  return {
    name: name || "Programme",
    description: asString(src.description),
    duration_weeks: Math.min(52, Math.max(1, Math.round(num(src.duration_weeks, 8)))),
    days,
  };
}

function sanitizePatch(raw: unknown): Record<string, unknown> | null {
  const src = asObject(raw);
  const exercise = asString(src.exercise || src.name);
  if (!exercise) return null;
  const patch: Record<string, unknown> = { exercise };
  if (src.weekday != null && src.weekday !== "") {
    patch.weekday = Math.min(6, Math.max(0, Math.round(num(src.weekday, 0))));
  }
  if (src.default_sets != null) patch.default_sets = Math.max(1, Math.round(num(src.default_sets, 3)));
  if (src.default_reps != null) patch.default_reps = Math.max(1, Math.round(num(src.default_reps, 10)));
  if (src.default_reps_min != null) {
    patch.default_reps_min = Math.max(1, Math.round(num(src.default_reps_min, 0))) || null;
  }
  if (src.default_rir != null && src.default_rir !== "") patch.default_rir = num(src.default_rir, 0);
  if (src.replace_with) patch.replace_with = asString(src.replace_with);
  return patch;
}

function sanitizeTracking(raw: unknown): Record<string, unknown> {
  const src = asObject(raw);
  return {
    track_weight: bool(src.track_weight, true),
    track_checkins: bool(src.track_checkins, true),
    track_nutrition: bool(src.track_nutrition, true),
    track_workouts: bool(src.track_workouts, true),
    workout_focus: asString(src.workout_focus),
  };
}

function isCompleteNutrition(n: { calories: number; protein: number; carbs: number; fat: number }): boolean {
  if (n.calories < 800 || n.calories > 8000) return false;
  if (n.protein <= 0 || n.carbs <= 0 || n.fat <= 0) return false;
  const fromMacros = n.protein * 4 + n.carbs * 4 + n.fat * 9;
  return Math.abs(fromMacros - n.calories) <= n.calories * 0.15;
}

function sanitizeNutrition(raw: unknown, fallback?: unknown): Record<string, number> | null {
  const src = asObject(raw);
  const nested = asObject(src.nutrition);
  const pick = nested.calories != null ? nested : src;
  const n = {
    calories: Math.round(num(pick.calories, 0)),
    protein: Math.round(num(pick.protein, 0)),
    carbs: Math.round(num(pick.carbs, 0)),
    fat: Math.round(num(pick.fat, 0)),
  };
  if (isCompleteNutrition(n)) return n;
  if (fallback) return sanitizeNutrition(fallback);
  return null;
}

async function fetchSelfDossier(
  admin: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 13);
  const fromDay = from.toISOString().slice(0, 10);
  const [checkins, workouts, nutrition] = await Promise.all([
    admin.from("daily_checkins").select("checked_at, hunger, mood, stress, notes").eq("user_id", userId).gte("checked_at", fromDay),
    admin.from("workouts").select("date, completed").eq("user_id", userId).gte("date", fromDay),
    admin.from("nutrition_logs").select("logged_at, calories").eq("user_id", userId).gte("logged_at", fromDay),
  ]);
  const checkinRows = Array.isArray(checkins.data) ? checkins.data : [];
  const workoutRows = Array.isArray(workouts.data) ? workouts.data : [];
  const nutritionRows = Array.isArray(nutrition.data) ? nutrition.data : [];
  return {
    client_id: userId,
    coach_id: userId,
    self_coach: true,
    checkin_count: checkinRows.length,
    last_checkin_at: checkinRows[0] ? asString((checkinRows[0] as Record<string, unknown>).checked_at) || null : null,
    workout_count: workoutRows.filter((w) => bool((w as Record<string, unknown>).completed, true)).length,
    logged_nutrition_days: new Set(nutritionRows.map((r) => asString((r as Record<string, unknown>).logged_at).slice(0, 10)).filter(Boolean)).size,
  };
}

async function fetchDossier(
  admin: SupabaseClient,
  coachId: string,
  clientId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!clientId) return null;
  if (coachId === clientId) {
    return fetchSelfDossier(admin, clientId);
  }
  const { data } = await admin.rpc("triage_coach_fleet", {
    p_coach_id: coachId,
    p_client_id: clientId,
  });
  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    const r = asObject(row);
    const id = String(r.client_id ?? "");
    if (id !== clientId) continue;
    return asObject(r.dossier).client_id ? asObject(r.dossier) : r;
  }
  return null;
}

async function fetchProfile(
  admin: SupabaseClient,
  clientId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!clientId) return null;
  const { data } = await admin
    .from("user_profiles")
    .select(
      "id, full_name, goal, training_frequency, training_focus, training_experience, injuries_limitations, diet_type, food_allergies, weight_kg, target_weight_kg, sleep_hours_average, onboarding_completed, daily_calorie_target, protein_target, carbs_target, fat_target, kinesiology_intake",
    )
    .eq("id", clientId)
    .maybeSingle();
  return data ? asObject(data) : null;
}

const INTAKE_TEXT_MAX = 400;
/** Same order as src/lib/kinesiologyIntake.ts WEEKDAYS; JS weekday ints (0 = dimanche). */
const INTAKE_WEEKDAY_INDEX: Record<string, number> = {
  dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6,
};
/** PAR-Q-style questions — mirror of MEDICAL_FLAG_IDS in src/lib/kinesiologyIntake.ts. */
const INTAKE_MEDICAL_FLAG_IDS = [
  "cardiaqueHtaPoitrine",
  "etourdissementsEquilibre",
  "medecinLimiteExercices",
];

function compactIntakeValue(value: unknown): unknown {
  if (typeof value === "string") {
    const s = value.trim();
    return s ? s.slice(0, INTAKE_TEXT_MAX) : undefined;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => asString(v)).filter(Boolean);
    return items.length ? items : undefined;
  }
  return undefined;
}

/**
 * The client's intake (questionnaire d'accueil) as the LLM should see it: no empty answers,
 * long texts trimmed, available days as weekday ints, medical flags listed explicitly.
 * Returns null when the client never answered.
 */
export function compactIntake(raw: unknown): Record<string, unknown> | null {
  const src = asObject(raw);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === "version" || key === "extras") continue;
    const compact = compactIntakeValue(value);
    if (compact !== undefined) out[key] = compact;
  }
  const extrasSrc = asObject(src.extras);
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extrasSrc)) {
    if (key === "joursDispo") continue;
    const compact = compactIntakeValue(value);
    if (compact !== undefined) extras[key] = compact;
  }
  if (Array.isArray(extrasSrc.joursDispo)) {
    const days = extrasSrc.joursDispo
      .map((d) => INTAKE_WEEKDAY_INDEX[asString(d).toLowerCase()])
      .filter((d): d is number => typeof d === "number");
    if (days.length) extras.available_weekdays = [...new Set(days)].sort((a, b) => a - b);
  }
  if (Object.keys(extras).length) out.extras = extras;
  const medicalFlags = INTAKE_MEDICAL_FLAG_IDS.filter((id) => asString(src[id]) === "Oui");
  if (Object.keys(out).length === 0) return null;
  out.medical_flags = medicalFlags;
  return out;
}

function intakeSessionCount(intake: Record<string, unknown> | null): number | null {
  const n = Math.round(num(intake?.seancesRealistes, 0));
  return n >= 1 ? Math.min(6, Math.max(2, n)) : null;
}

function intakeWeekdays(intake: Record<string, unknown> | null): number[] | null {
  const days = asObject(intake?.extras).available_weekdays;
  if (!Array.isArray(days) || days.length === 0) return null;
  return days.map((d) => num(d, -1)).filter((d) => d >= 0 && d <= 6);
}

async function fetchCompactProgram(
  admin: SupabaseClient,
  programId: string | null,
  clientId: string | null,
  context: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (Array.isArray(context.days) && context.days.length > 0) {
    return {
      name: asString(context.name) || asString(context.program_name),
      description: asString(context.description),
      duration_weeks: num(context.duration_weeks, 8),
      days: context.days,
    };
  }
  let pid = programId;
  if (!pid && clientId) {
    const { data: asg } = await admin
      .from("program_assignments")
      .select("program_id")
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();
    pid = asString(asObject(asg).program_id) || null;
  }
  if (!pid) return null;
  const { data: program } = await admin
    .from("programs")
    .select("id, name, description, duration_weeks")
    .eq("id", pid)
    .maybeSingle();
  if (!program) return null;
  const { data: days } = await admin
    .from("program_days")
    .select("id, weekday, name, order_index")
    .eq("program_id", pid)
    .order("order_index");
  const dayRows = Array.isArray(days) ? days : [];
  const compactDays: Array<Record<string, unknown>> = [];
  for (const day of dayRows.slice(0, 7)) {
    const d = asObject(day);
    const { data: lifts } = await admin
      .from("program_day_exercises")
      .select("name, default_sets, default_reps, default_reps_min, default_rir, default_rest_seconds, order_index")
      .eq("program_day_id", d.id)
      .order("order_index");
    compactDays.push({
      weekday: num(d.weekday, 0),
      name: asString(d.name),
      exercises: (Array.isArray(lifts) ? lifts : []).slice(0, 8).map((ex) => {
        const e = asObject(ex);
        return {
          name: asString(e.name),
          default_sets: num(e.default_sets, 3),
          default_reps: num(e.default_reps, 10),
          default_reps_min: e.default_reps_min == null ? null : num(e.default_reps_min, 0),
          default_rir: e.default_rir == null ? null : num(e.default_rir, 0),
          default_rest_seconds: num(e.default_rest_seconds, 90),
        };
      }),
    });
  }
  const p = asObject(program);
  return {
    id: pid,
    name: asString(p.name),
    description: asString(p.description),
    duration_weeks: num(p.duration_weeks, 8),
    days: compactDays,
  };
}

function titleFor(kind: string, llmTitle: string, locale: AgentLocale): string {
  if (llmTitle) return llmTitle;
  const l = L[locale];
  if (kind === "onboarding_plan") return l.titleOnboarding;
  if (kind === "program_nl_edit") return l.titleNl;
  if (kind === "calorie_adjustment") return l.titleKcal;
  return l.titleAsk;
}

const CREATE_PROGRAM_RE =
  /(cr[eé]er?|create|g[eé]n[eè]re|draft|fais|fait[es]?|make|build|propose|r[eé]dige).{0,48}(programme|program)|(programme|program).{0,20}(ia|ai)|un programme (pour|d['’e]|ia|ai)|un program (for|ia|ai)/i;

export function looksLikeCreateProgram(raw: string): boolean {
  return CREATE_PROGRAM_RE.test(raw.trim());
}

function lift(
  name: string,
  sets = 3,
  reps = 10,
  rir: number | null = 2,
  rest = 90,
): Record<string, unknown> {
  return {
    name,
    default_sets: sets,
    default_reps: reps,
    default_reps_min: null,
    default_rir: rir,
    default_rest_seconds: rest,
  };
}

function weekdaySpread(dayCount: number): number[] {
  if (dayCount <= 3) return [1, 3, 5];
  if (dayCount === 4) return [1, 2, 4, 5];
  return [1, 2, 3, 4, 5].slice(0, dayCount);
}

/** Deterministic 3–5 day / 4–6 lift outline. Never includes calories/macros. Honours intake days when present. */
export function fallbackProgramFromProfile(
  profile: Record<string, unknown> | null,
  prompt: string,
  intake: Record<string, unknown> | null = null,
  locale: AgentLocale = "fr",
): Record<string, unknown> {
  const intakeSessions = intakeSessionCount(intake);
  const freq = intakeSessions ?? Math.round(num(profile?.training_frequency, 3));
  const experience = asString(profile?.training_experience).toLowerCase();
  const focus = asString(profile?.training_focus).toLowerCase();
  const novice = experience.includes("beginner") || experience.includes("novice")
    || asString(intake?.niveauActuel).toLowerCase().startsWith("débutant")
    || /novice|débutant|debutant|étudiant|etudiant/i.test(prompt);
  const dayCount = novice ? Math.min(4, Math.max(3, freq || 3)) : Math.min(5, Math.max(3, freq || 4));
  const strength = focus.includes("strength") || focus.includes("force");
  const reps = strength ? 6 : 10;
  const rest = strength ? 150 : 90;

  const fullBody = [
    { name: "Full body A", exercises: [lift("Squat goblet", 3, reps, 2, rest), lift("Développé haltères", 3, reps, 2, rest), lift("Row barre", 3, reps, 2, rest), lift("RDL haltères", 3, reps, 2, rest), lift("Planche", 3, 30, null, 60)] },
    { name: "Full body B", exercises: [lift("Fentes marchées", 3, reps, 2, rest), lift("Développé incliné", 3, reps, 2, rest), lift("Tirage vertical", 3, reps, 2, rest), lift("Hip thrust", 3, reps, 2, rest), lift("Face pulls", 3, 12, 2, 75)] },
    { name: "Full body C", exercises: [lift("Presse à cuisses", 3, reps, 2, rest), lift("Développé militaire", 3, reps, 2, rest), lift("Row unilatéral", 3, reps, 2, rest), lift("Soulevé de terre roumain", 3, reps, 2, rest), lift("Gainage latéral", 3, 20, null, 60)] },
    { name: "Full body D", exercises: [lift("Goblet squat tempo", 3, reps, 2, rest), lift("Pompes ou développé", 3, reps, 2, rest), lift("Row assis", 3, reps, 2, rest), lift("Fentes arrière", 3, reps, 2, rest), lift("Curl + extension", 3, 12, 2, 75)] },
  ];
  const upperLower = [
    { name: "Upper A", exercises: [lift("Développé couché", 4, reps, 2, rest), lift("Row barre", 4, reps, 2, rest), lift("Développé militaire", 3, reps, 2, rest), lift("Tirage vertical", 3, reps, 2, rest), lift("Face pulls", 3, 12, 2, 75)] },
    { name: "Lower A", exercises: [lift("Squat", 4, reps, 2, rest), lift("RDL", 3, reps, 2, rest), lift("Fentes", 3, reps, 2, rest), lift("Hip thrust", 3, reps, 2, rest), lift("Mollets", 3, 12, 2, 60)] },
    { name: "Upper B", exercises: [lift("Développé incliné", 4, reps, 2, rest), lift("Row unilatéral", 3, reps, 2, rest), lift("Écarté haltères", 3, 12, 2, 75), lift("Curl barre", 3, 10, 2, 75), lift("Extension triceps", 3, 10, 2, 75)] },
    { name: "Lower B", exercises: [lift("Presse à cuisses", 4, reps, 2, rest), lift("Soulevé de terre roumain", 3, reps, 2, rest), lift("Fentes marchées", 3, reps, 2, rest), lift("Leg curl", 3, 10, 2, 75), lift("Gainage", 3, 30, null, 60)] },
    { name: "Full accessory", exercises: [lift("Tractions assistées", 3, 8, 2, rest), lift("Développé haltères", 3, reps, 2, rest), lift("Fentes bulgares", 3, reps, 2, rest), lift("Face pulls", 3, 12, 2, 75), lift("Planche", 3, 30, null, 60)] },
  ];
  const templates = dayCount <= 3 || novice ? fullBody : upperLower;
  const preferred = intakeWeekdays(intake);
  const weekdays = preferred && preferred.length >= dayCount
    ? preferred.slice(0, dayCount)
    : weekdaySpread(dayCount);
  const days = templates.slice(0, dayCount).map((day, i) => ({
    weekday: weekdays[i] ?? ((i + 1) % 7),
    name: day.name,
    exercises: day.exercises,
  }));
  const who = asString(profile?.full_name) || "client";
  const l = L[locale];
  return {
    name: novice ? l.noviceBase(who) : l.programDays(dayCount, who),
    description: l.programDescription,
    duration_weeks: 8,
    days,
  };
}

function isHumanCause(value: unknown): boolean {
  const s = asString(value);
  if (!s || s.length > 180) return false;
  if (s.split(/\n/).length > 2) return false;
  if (/[{[]/.test(s) && /[}\]]/.test(s)) return false;
  if (/\d{4}-\d{2}-\d{2}T\d{2}:/.test(s)) return false;
  if (/^\s*(error|traceback|console\.|at \w+)/i.test(s)) return false;
  if (/"kind"\s*:|"payload"\s*:|"drafting"\s*:/.test(s)) return false;
  return true;
}

function defaultNlCause(screen: string, locale: AgentLocale): string {
  const l = L[locale];
  if (screen === "last_session") return l.nlLastSession;
  if (screen === "recovery") return l.nlRecovery;
  if (screen === "exercise_workspace") return l.nlExercise;
  return l.nlDefault;
}

function buildPayload(
  kind: string,
  input: CoachAgentInput,
  llm: Record<string, unknown>,
): { title: string; rationale: string; payload: Record<string, unknown> } {
  const title = titleFor(kind, asString(llm.title), input.locale);
  const notes = asString(llm.notes) || asString(llm.answer) || asString(llm.body);
  const observation = asString(llm.observation);
  let cause = isHumanCause(llm.cause) ? asString(llm.cause) : "";
  if (!cause && kind === "program_nl_edit") cause = defaultNlCause(input.screen, input.locale);
  const body = asString(llm.body) || asString(llm.answer) || notes;
  const program = sanitizeProgram(
    llm.program ?? (Array.isArray(llm.days) ? llm : null),
  );
  const patch = sanitizePatch(llm.patch);
  const tracking = kind === "onboarding_plan" ? sanitizeTracking(llm.tracking) : null;
  const nutrition = kind === "onboarding_plan" ? null : sanitizeNutrition(llm);

  const payload: Record<string, unknown> = {
    drafting: false,
    prompt: input.prompt,
    screen: input.screen,
    program_id: input.programId,
    initiated_by: input.screen === "onboarding_complete" ? "onboarding" : "coach",
    context: input.context,
    source: AGENT_SOURCE,
  };
  if (notes) payload.notes = notes;
  if (body) payload.body = body;
  if (asString(llm.answer)) payload.answer = asString(llm.answer);
  if (observation) payload.observation = observation;
  if (cause) payload.cause = cause;
  if (program) {
    payload.program = program;
    payload.name = program.name;
    payload.description = program.description;
    payload.duration_weeks = program.duration_weeks;
    payload.days = program.days;
  }
  if (patch) payload.patch = patch;
  if (tracking) payload.tracking = tracking;
  if (nutrition) {
    payload.nutrition = nutrition;
    payload.calories = nutrition.calories;
    payload.protein = nutrition.protein;
    payload.carbs = nutrition.carbs;
    payload.fat = nutrition.fat;
  }
  payload.agent_proposed = lessonSnapshot(kind, payload);
  const rationale = cause || (kind === "program_nl_edit" ? defaultNlCause(input.screen, input.locale) : notes);
  return { title, rationale, payload };
}

function payloadIsReady(kind: string, payload: Record<string, unknown>): boolean {
  if (payload.drafting === true) return false;
  if (kind === "onboarding_plan") {
    const program = asObject(payload.program);
    const days = Array.isArray(program.days) ? program.days : Array.isArray(payload.days) ? payload.days : [];
    return days.length > 0;
  }
  if (kind === "program_nl_edit") {
    return !!payload.patch || (Array.isArray(asObject(payload.program).days) && (asObject(payload.program).days as unknown[]).length > 0);
  }
  const answer = payload.answer ?? payload.notes ?? payload.body ?? payload.proposal;
  if (typeof answer === "string" && answer.trim()) return true;
  if (payload.patch || payload.program || payload.nutrition) return true;
  return false;
}

function fallbackAsk(
  input: CoachAgentInput,
  profile: Record<string, unknown> | null,
): { title: string; rationale: string; payload: Record<string, unknown> } {
  const who = asString(profile?.full_name) || "ce client";
  const text =
    `Brouillon de secours pour ${who} (« ${input.prompt} »). `
    + L[input.locale].askIncomplete;
  return buildPayload("ask_prometheus", input, {
    title: `Ask — ${who}`,
    answer: text,
    notes: text,
    body: text,
  });
}

export async function runCoachAgent(
  admin: SupabaseClient,
  openaiKey: string,
  input: CoachAgentInput,
): Promise<{ ok: true; interventionId: string; intervention: Record<string, unknown> } | { ok: false; error: string }> {
  const kind = input.kind;
  if (!AGENT_KINDS.has(kind)) return { ok: false, error: "invalid_kind" };
  if (!input.prompt) return { ok: false, error: "prompt_required" };
  if (kind === "onboarding_plan" && !input.clientId) return { ok: false, error: "client_id_required" };

  const [dossier, rawProfile, lessons, program] = await Promise.all([
    fetchDossier(admin, input.coachId, input.clientId),
    fetchProfile(admin, input.clientId),
    fetchCoachLessons(admin, input.coachId, kind),
    fetchCompactProgram(admin, input.programId, input.clientId, input.context),
  ]);

  // The raw jsonb never goes to the LLM as-is: it is compacted into `intake` below.
  const { kinesiology_intake: rawIntake, ...profileFields } = rawProfile ?? {};
  const profile = rawProfile ? profileFields : null;
  const intake = compactIntake(rawIntake);

  const userPayload = {
    kind,
    prompt: input.prompt,
    screen: input.screen,
    client: profile,
    intake,
    dossier_14d: dossier,
    current_program: program,
    context: input.context,
    lessons,
  };

  const wantsProgram = kind === "onboarding_plan" || looksLikeCreateProgram(input.prompt);

  const llm = openaiKey
    ? await openaiJson(
      openaiKey,
      [
        { role: "system", content: `${systemPrompt(input.locale)}\n${kindSchema(kind)}` },
        { role: "user", content: `${formatLessonsForPrompt(lessons)}\n\nDossier + demande:\n${JSON.stringify(userPayload)}` },
      ],
      wantsProgram
        ? { maxTokens: 3500, timeoutMs: 45_000 }
        : { maxTokens: 1400 },
    )
    : null;

  let built = llm ? buildPayload(kind, input, llm) : null;
  if (!built || !payloadIsReady(kind, built.payload)) {
    if (wantsProgram) {
      const program = fallbackProgramFromProfile(profile, input.prompt, intake, input.locale);
      built = buildPayload(kind, input, {
        title: titleFor(kind, "", input.locale),
        notes: L[input.locale].fallbackNotes,
        program,
        tracking: {
          track_weight: true,
          track_checkins: true,
          track_nutrition: true,
          track_workouts: true,
          workout_focus: asString(profile?.training_focus),
        },
      });
    } else {
      built = fallbackAsk(input, profile);
    }
  }

  if (!payloadIsReady(kind, built.payload)) {
    if (kind === "onboarding_plan" || kind === "program_nl_edit") {
      const program = fallbackProgramFromProfile(profile, input.prompt, intake, input.locale);
      built = buildPayload(kind, input, {
        title: titleFor(kind, "", input.locale),
        notes: L[input.locale].fallbackNotes,
        program,
      });
    } else {
      built = fallbackAsk(input, profile);
    }
  }

  const { data: upsertId, error: upsertError } = await admin.rpc("upsert_coach_intervention", {
    p_coach_id: input.coachId,
    p_client_id: input.clientId,
    p_kind: kind,
    p_rationale: built.rationale,
    p_payload: built.payload,
    p_title: built.title,
    p_source: AGENT_SOURCE,
  });

  if (upsertError || !upsertId) {
    return { ok: false, error: upsertError?.message ?? "failed_to_create_draft" };
  }

  const interventionId = String(upsertId);
  const { data: row } = await admin
    .from("coach_interventions")
    .select("*")
    .eq("id", interventionId)
    .maybeSingle();

  return {
    ok: true,
    interventionId,
    intervention: row ? asObject(row) : { id: interventionId, payload: built.payload, kind, title: built.title },
  };
}

export async function handleCoachAgentHttp(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();

    const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "unauthorized" });

    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("coaching_role")
      .eq("user_id", user.id)
      .maybeSingle();
    const coachingRole = asString(roleRow?.coaching_role) || "none";
    // Coached athletes have no copilot (VISION 7). Solo (role none) may call the
    // same agent as their own coach — only on themselves, program kinds only.
    if (coachingRole === "client") {
      return json(403, { error: "not_coach" });
    }
    const selfCoach = coachingRole !== "coach";
    if (coachingRole !== "coach" && coachingRole !== "none") {
      return json(403, { error: "not_coach" });
    }

    const body = asObject(await req.json().catch(() => ({})));
    const kind = asString(body.kind);
    if (!AGENT_KINDS.has(kind)) return json(400, { error: "invalid_kind" });
    const prompt = asString(body.prompt);
    if (!prompt) return json(400, { error: "prompt_required" });
    const clientId = asString(body.client_id) || null;
    const programId = asString(body.program_id) || null;
    const screen = asString(body.screen) || "unknown";
    const context = asObject(body.context);
    const locale = parseLocale(body.locale);
    if (kind === "onboarding_plan" && !clientId) {
      return json(400, { error: "client_id_required" });
    }
    if (selfCoach) {
      if (clientId !== user.id) return json(403, { error: "not_your_client" });
      if (kind !== "onboarding_plan" && kind !== "program_nl_edit") {
        return json(403, { error: "not_coach" });
      }
    }

    if (clientId) {
      if (selfCoach) {
        if (clientId !== user.id) return json(403, { error: "not_your_client" });
      } else {
        const { data: linked } = await userClient.rpc("is_coach_of", { p_client_id: clientId });
        if (!linked) return json(403, { error: "not_your_client" });
      }
    }
    if (programId) {
      const { data: program } = await userClient.from("programs").select("id").eq("id", programId).maybeSingle();
      if (!program) return json(404, { error: "program_not_found" });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usageCount } = await admin
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("function_name", ["coach-agent", "ask-second"])
      .gte("called_at", dayStart.toISOString());
    if ((usageCount ?? 0) >= 40) {
      return json(429, { error: "DAILY_LIMIT_REACHED", limit: 40 });
    }

    const result = await runCoachAgent(admin, openaiKey, {
      kind,
      coachId: user.id,
      clientId,
      programId,
      prompt,
      screen,
      context,
      locale,
    });

    await admin.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "coach-agent",
    });

    if (!result.ok) {
      return json(result.error === "invalid_kind" || result.error === "prompt_required" || result.error === "client_id_required" ? 400 : 502, {
        error: result.error,
      });
    }

    return json(200, {
      status: "ready",
      intervention_id: result.interventionId,
      intervention: result.intervention,
    });
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}
