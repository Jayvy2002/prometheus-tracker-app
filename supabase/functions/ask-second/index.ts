import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * Coach → Second signed ping. JWT required (logged-in coach).
 * Inserts/updates a pending coach_interventions row (drafting payload),
 * then POSTs GROK_BOT_WEBHOOK_URL with the same secret headers as
 * notify-onboarding-complete. Never applies the draft.
 *
 * Env (dashboard, never git):
 *   GROK_BOT_WEBHOOK_URL + NOTIFY_SECRET (fallback GROK_BOT_WEBHOOK_SECRET)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Key, X-Sender-Key",
};

const WEBHOOK_TIMEOUT_MS = 5000;
const PING_KINDS = new Set(["onboarding_plan", "ask_prometheus", "program_nl_edit", "calorie_adjustment"]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookUrl = (Deno.env.get("GROK_BOT_WEBHOOK_URL") ?? "").trim();
    const webhookSecret = (
      Deno.env.get("NOTIFY_SECRET") ?? Deno.env.get("GROK_BOT_WEBHOOK_SECRET") ?? ""
    ).trim();

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
    if (!PING_KINDS.has(kind)) return json(400, { error: "invalid_kind" });

    const prompt = asString(body.prompt);
    if (!prompt) return json(400, { error: "prompt_required" });

    const clientId = asString(body.client_id) || null;
    const programId = asString(body.program_id) || null;
    const screen = asString(body.screen) || "unknown";
    const context = asObject(body.context);
    if (kind === "onboarding_plan" && !clientId) {
      return json(400, { error: "client_id_required" });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usageCount } = await adminClient
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("function_name", "ask-second")
      .gte("called_at", dayStart.toISOString());
    if ((usageCount ?? 0) >= 40) {
      return json(429, { error: "DAILY_LIMIT_REACHED", limit: 40 });
    }

    let clientProfile: Record<string, unknown> | null = null;
    if (clientId) {
      const { data: profile } = await userClient
        .from("user_profiles")
        .select(
          "id, full_name, goal, training_frequency, training_focus, training_experience, injuries_limitations, diet_type, food_allergies, weight_kg, target_weight_kg, sleep_hours_average, onboarding_completed",
        )
        .eq("id", clientId)
        .maybeSingle();
      clientProfile = profile as Record<string, unknown> | null;
    }

    const title =
      kind === "onboarding_plan"
        ? "Programme IA — brouillon Second"
        : kind === "program_nl_edit"
        ? "Édition programme — brouillon Second"
        : kind === "calorie_adjustment"
        ? "Calories trop élevées — stall cut"
        : "Ask Prometheus — brouillon Second";

    const payload = {
      drafting: true,
      prompt,
      screen,
      program_id: programId,
      initiated_by: "coach",
      context,
    };

    const { data: upsertId, error: upsertError } = await userClient.rpc(
      "upsert_coach_intervention",
      {
        p_coach_id: user.id,
        p_client_id: clientId,
        p_kind: kind,
        p_rationale: prompt,
        p_payload: payload,
        p_title: title,
      },
    );

    if (upsertError || !upsertId) {
      return json(400, { error: upsertError?.message ?? "failed_to_create_draft" });
    }

    const interventionId = String(upsertId);
    const { data: row } = await userClient
      .from("coach_interventions")
      .select("*")
      .eq("id", interventionId)
      .maybeSingle();

    const webhookBody = {
      kind,
      intervention_id: interventionId,
      coach_id: user.id,
      client_id: clientId,
      program_id: programId,
      prompt,
      screen,
      context,
      client: clientProfile,
      onboarding_completed: clientProfile?.onboarding_completed === true,
    };

    if (!webhookUrl || !webhookSecret) {
      await adminClient
        .from("coach_interventions")
        .update({
          payload: { ...payload, drafting: false, error: "WEBHOOK_NOT_CONFIGURED" },
          updated_at: new Date().toISOString(),
        })
        .eq("id", interventionId);
      return json(503, {
        error: "WEBHOOK_NOT_CONFIGURED",
        intervention_id: interventionId,
        intervention: row,
      });
    }

    const webhookHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${webhookSecret}`,
      "X-Webhook-Key": webhookSecret,
      "X-Sender-Key": webhookSecret,
    };

    try {
      const webhookRes = await fetch(webhookUrl, {
        method: "POST",
        headers: webhookHeaders,
        body: JSON.stringify(webhookBody),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (webhookRes.status >= 400) {
        await adminClient
          .from("coach_interventions")
          .update({
            payload: { ...payload, drafting: false, error: `WEBHOOK_FAILED:${webhookRes.status}` },
            updated_at: new Date().toISOString(),
          })
          .eq("id", interventionId);
        return json(502, {
          error: "WEBHOOK_FAILED",
          intervention_id: interventionId,
          intervention: row,
        });
      }
    } catch (err) {
      const errName = err instanceof Error ? err.name : "";
      const aborted = errName === "TimeoutError" || errName === "AbortError";
      if (!aborted) {
        await adminClient
          .from("coach_interventions")
          .update({
            payload: { ...payload, drafting: false, error: "WEBHOOK_FAILED" },
            updated_at: new Date().toISOString(),
          })
          .eq("id", interventionId);
        return json(502, {
          error: "WEBHOOK_FAILED",
          intervention_id: interventionId,
          intervention: row,
        });
      }
      // Timeout: POST likely delivered; Second continues while the coach UI waits on Realtime.
    }

    await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "ask-second",
    });

    return json(202, {
      status: "drafting",
      intervention_id: interventionId,
      intervention: row,
    });
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
