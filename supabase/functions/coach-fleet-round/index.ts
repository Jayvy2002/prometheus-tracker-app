import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { openaiJson } from "../_shared/openaiJson.ts";
import { fetchCoachLessons, formatLessonsForPrompt } from "../_shared/coachAgent.ts";
import {
  asObject,
  fleetCardNeedsLlm,
  FLEET_SOURCE,
  LLM_TIMEOUT_MS,
  MAX_LLM_PER_RUN,
  mapDossier,
  mergeLlm,
  planWrite,
  str,
  SYSTEM_PROMPT,
  withEvidence,
  type Dossier,
  type FleetCard,
  type FleetFlag,
} from "../_shared/fleetEngine.ts";

/**
 * Architecture lock 2026-08-29 (Jayvy): DO NOT create Grok Bots.
 * Second was too slow. One bot per coach or per client will not scale.
 *
 * Weekly review IN THE APP:
 *   1. Cheap SQL (`triage_coach_fleet`) of EVERY active linked client.
 *   2. Data-driven Relancer / kcal+P/C/F (ISSN is the starting formula only).
 *   3. LLM only when there is a plan/program proposal the formulas do not write.
 *   4. Writes coach_interventions drafts only. Never auto-applies. Never pings Second.
 *
 * Auth:
 *   JWT (logged-in coach) → that coach's roster, on-demand from Aujourd'hui
 *   FLEET_CRON_SECRET (pg_cron nightly) → all coaches
 *
 * Never authenticates with GROK_BOT_WEBHOOK_SECRET. Never POSTs GROK_BOT_WEBHOOK_URL.
 * Never creates per-client/per-coach Grok Bots. Second is out of the product loop.

 * Model:
 *   OPENAI_API_KEY → optional, and only if fleetCardNeedsLlm (program_adjustment)
 *   missing key / Relancer / kcal → deterministic templates + complete macros
 *
 * Never POSTs GROK_BOT_WEBHOOK_URL. Never creates per-client/per-coach Grok Bots.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Key, X-Sender-Key",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callFleetAgent(
  apiKey: string,
  d: Dossier,
  flag: FleetFlag,
  lessons: Awaited<ReturnType<typeof fetchCoachLessons>>,
): Promise<Record<string, unknown> | null> {
  const compact = {
    flag,
    name: d.full_name,
    goal: d.goal,
    calorie_target: d.calorie_target,
    avg_calories: d.avg_calories,
    logged_nutrition_days: d.logged_nutrition_days,
    adherence_nutrition: d.avg_adherence_nutrition,
    adherence_training: d.avg_adherence_training,
    workouts: d.workout_count,
    expected_workouts: expectedWorkouts(d),
    weight_delta_kg: d.weight_delta_kg,
    last_workout_at: d.last_workout_at,
    last_checkin_at: d.last_checkin_at,
    last_nutrition_at: d.last_nutrition_at,
    last_coach_message_at: d.last_coach_message_at,
    onboarding_completed: d.onboarding_completed,
    has_program: d.has_program,
  };
  return await openaiJson(
    apiKey,
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${formatLessonsForPrompt(lessons)}\n\n${JSON.stringify(compact)}`,
      },
    ],
    { maxTokens: 700, timeoutMs: LLM_TIMEOUT_MS },
  );
}

function bearerToken(header: string | null): string {
  if (!header) return "";
  return header.replace(/^Bearer\s+/i, "").trim();
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
      const { data: roleRow } = await userClient
        .from("user_roles")
        .select("coaching_role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleRow?.coaching_role !== "coach") return json(403, { error: "not_coach" });
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

    const today = new Date().toISOString().slice(0, 10);
    const apiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
    const modelUsed: "openai" | "off" = apiKey ? "openai" : "off";
    const lessonsByCoach = new Map<string, Awaited<ReturnType<typeof fetchCoachLessons>>>();

    let flagged = 0;
    let skipped = 0;
    let llmCalls = 0;
    let llmSkippedDeterministic = 0;
    const written: Array<{ client_id: string; flag: string; kind: string; title: string; action: string }> = [];

    for (const d of dossiers) {
      const plan = planWrite(d, today, modelUsed);
      if (plan.action === "skip" || !plan.card) {
        skipped += 1;
        continue;
      }
      flagged += 1;
      let card = plan.card;
      if (fleetCardNeedsLlm(card.kind) && apiKey && llmCalls < MAX_LLM_PER_RUN) {
        llmCalls += 1;
        let lessons = lessonsByCoach.get(d.coach_id);
        if (!lessons) {
          lessons = await fetchCoachLessons(admin, d.coach_id);
          lessonsByCoach.set(d.coach_id, lessons);
        }
        const llm = await callFleetAgent(apiKey, d, card.flag, lessons);
        if (llm) card = withEvidence(d, mergeLlm(llm, card, d));
      } else if (!fleetCardNeedsLlm(card.kind)) {
        llmSkippedDeterministic += 1;
      }
      const id = await writeCard(admin, d, card);
      if (id) {
        written.push({
          client_id: d.client_id,
          flag: card.flag,
          kind: card.kind,
          title: card.title,
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
        model_used: modelUsed,
        payload: {
          cards: written,
          llm_calls: llmCalls,
          llm_skipped_deterministic: llmSkippedDeterministic,
          ia_off: modelUsed === "off",
        },
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
      model_used: modelUsed,
      clients_seen: dossiers.length,
      clients_flagged: flagged,
      clients_skipped: skipped,
      llm_calls: llmCalls,
      llm_skipped_deterministic: llmSkippedDeterministic,
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
