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
}

const LESSON_RULE =
  "Les leçons ci-dessous sont des corrections de CE coach. Extraire des patterns stables (ton, tutoiement, Relancer vs changement de cibles, split macros, densité du programme). Ne copie pas une erreur ponctuelle ni un one-off.";

export const SYSTEM_PROMPT = `Tu es l'agent coach in-app de Prometheus. Tu prépares UN brouillon. Rien ne s'applique tout seul. Le coach accepte ou édite, puis envoie.
Français, tutoiement. Tu tutoyes le client dans les messages.
ISSN reste la formule de l'app — tu n'écrases pas les calories d'onboarding.
Levier : adhérence / Relancer d'abord si le client n'applique PAS le plan (logs >> cible, adhérence basse, ghost, séances manquées). JAMAIS une coupe calorie ni un nouveau programme dans ces cas. JAMAIS des macros 0.
Changement kcal/macros SEULEMENT s'il APPLIQUE le plan et reste hors objectif (ou trop vite). Macros COMPLÈTES : protein, carbs, fat tous > 0 et kcal ≈ P*4+C*4+F*9.
Nouveau client : onboarding_plan / première semaine, pas un stall.
Pas de CRM. Pas d'auto-apply.
${LESSON_RULE}
Réponds JSON uniquement, sans markdown.`;

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
PAS de calories, macros, ni recettes. 3 à 5 jours, 4 à 6 exercices par jour, adaptés au profil.`;
  }
  if (kind === "program_nl_edit") {
    return `Schéma program_nl_edit :
{
  "title": string,
  "notes": string,
  "patch": { "exercise": string, "weekday": number|null, "default_sets": number, "default_reps": number, "default_reps_min": number|null, "default_rir": number|null, "replace_with": string } | null,
  "program": { "name": string, "description": string, "duration_weeks": number, "days": [...] } | null
}
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

async function fetchDossier(
  admin: SupabaseClient,
  coachId: string,
  clientId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!clientId) return null;
  const { data } = await admin.rpc("triage_coach_fleet", { p_coach_id: coachId });
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
      "id, full_name, goal, training_frequency, training_focus, training_experience, injuries_limitations, diet_type, food_allergies, weight_kg, target_weight_kg, sleep_hours_average, onboarding_completed, daily_calorie_target, protein_target, carbs_target, fat_target",
    )
    .eq("id", clientId)
    .maybeSingle();
  return data ? asObject(data) : null;
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

function titleFor(kind: string, llmTitle: string): string {
  if (llmTitle) return llmTitle;
  if (kind === "onboarding_plan") return "Programme IA — brouillon";
  if (kind === "program_nl_edit") return "Édition programme — brouillon";
  if (kind === "calorie_adjustment") return "Ajustement calories — brouillon";
  return "Ask Prometheus — brouillon";
}

function buildPayload(
  kind: string,
  input: CoachAgentInput,
  llm: Record<string, unknown>,
): { title: string; rationale: string; payload: Record<string, unknown> } {
  const title = titleFor(kind, asString(llm.title));
  const notes = asString(llm.notes) || asString(llm.answer) || asString(llm.body) || asString(llm.cause);
  const observation = asString(llm.observation);
  const cause = asString(llm.cause);
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
  return { title, rationale: input.prompt || notes || cause, payload };
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

export async function runCoachAgent(
  admin: SupabaseClient,
  openaiKey: string,
  input: CoachAgentInput,
): Promise<{ ok: true; interventionId: string; intervention: Record<string, unknown> } | { ok: false; error: string }> {
  const kind = input.kind;
  if (!AGENT_KINDS.has(kind)) return { ok: false, error: "invalid_kind" };
  if (!input.prompt) return { ok: false, error: "prompt_required" };
  if (kind === "onboarding_plan" && !input.clientId) return { ok: false, error: "client_id_required" };

  const [dossier, profile, lessons, program] = await Promise.all([
    fetchDossier(admin, input.coachId, input.clientId),
    fetchProfile(admin, input.clientId),
    fetchCoachLessons(admin, input.coachId, kind),
    fetchCompactProgram(admin, input.programId, input.clientId, input.context),
  ]);

  const userPayload = {
    kind,
    prompt: input.prompt,
    screen: input.screen,
    client: profile,
    dossier_14d: dossier,
    current_program: program,
    context: input.context,
    lessons,
  };

  const llm = await openaiJson(
    openaiKey,
    [
      { role: "system", content: `${SYSTEM_PROMPT}\n${kindSchema(kind)}` },
      { role: "user", content: `${formatLessonsForPrompt(lessons)}\n\nDossier + demande:\n${JSON.stringify(userPayload)}` },
    ],
    { maxTokens: kind === "onboarding_plan" ? 2200 : 1400 },
  );

  if (!llm) return { ok: false, error: "AI_FAILED" };

  const built = buildPayload(kind, input, llm);
  if (!payloadIsReady(kind, built.payload)) {
    return { ok: false, error: "AI_EMPTY_DRAFT" };
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
    if (roleRow?.coaching_role !== "coach") {
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
    if (kind === "onboarding_plan" && !clientId) {
      return json(400, { error: "client_id_required" });
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

    if (!openaiKey) {
      return json(500, { error: "OPENAI_API_KEY not configured" });
    }

    const result = await runCoachAgent(admin, openaiKey, {
      kind,
      coachId: user.id,
      clientId,
      programId,
      prompt,
      screen,
      context,
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
