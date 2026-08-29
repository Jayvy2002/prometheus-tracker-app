import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * Enqueues exercise verification via Second (Grok Bot).
 * Does not call OpenAI. Existing library matches still resolve locally (not AI).
 *
 * Same webhook env as notify-onboarding-complete / ask-second:
 *   GROK_BOT_WEBHOOK_URL + NOTIFY_SECRET (fallback GROK_BOT_WEBHOOK_SECRET)
 *
 * Second must (service role):
 *   1. INSERT exercises if approved, or skip if rejected
 *   2. UPDATE exercise_requests SET status='approved', result_exercise_id=<id>
 *      or status='rejected' + error_message
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Key, X-Sender-Key",
};

const WEBHOOK_TIMEOUT_MS = 5000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookUrl = (Deno.env.get("GROK_BOT_WEBHOOK_URL") ?? "").trim();
    const webhookSecret = (
      Deno.env.get("NOTIFY_SECRET") ?? Deno.env.get("GROK_BOT_WEBHOOK_SECRET") ?? ""
    ).trim();

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" });

    const { request_id } = await req.json().catch(() => ({ request_id: "" }));
    if (!request_id || typeof request_id !== "string") {
      return json(400, { error: "request_id is required" });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usageCount } = await adminClient
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("function_name", "verify-exercise")
      .gte("called_at", dayStart.toISOString());

    if ((usageCount ?? 0) >= 20) {
      return json(429, { error: "DAILY_LIMIT_REACHED", limit: 20 });
    }

    const { data: exReq, error: fetchErr } = await adminClient
      .from("exercise_requests")
      .select("*")
      .eq("id", request_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !exReq) return json(404, { error: "Exercise request not found" });

    const { data: existing } = await adminClient
      .from("exercises")
      .select("*")
      .ilike("name", String(exReq.name ?? "").trim())
      .maybeSingle();

    if (existing) {
      await adminClient
        .from("exercise_requests")
        .update({
          status: "approved",
          result_exercise_id: existing.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(200, { exercise: existing, status: "approved" });
    }

    if (!webhookUrl || !webhookSecret) {
      await adminClient
        .from("exercise_requests")
        .update({
          status: "rejected",
          error_message: "WEBHOOK_NOT_CONFIGURED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(503, { error: "WEBHOOK_NOT_CONFIGURED" });
    }

    await adminClient
      .from("exercise_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", request_id);

    const payload = {
      kind: "verify_exercise",
      request_id,
      user_id: user.id,
      name: exReq.name,
      muscles: exReq.muscles ?? "",
      description: exReq.description ?? "",
    };

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
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (webhookRes.status >= 400) {
        await adminClient
          .from("exercise_requests")
          .update({
            status: "rejected",
            error_message: `WEBHOOK_FAILED:${webhookRes.status}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request_id);
        return json(502, { error: "WEBHOOK_FAILED" });
      }
    } catch (err) {
      const errName = err instanceof Error ? err.name : "";
      const aborted = errName === "TimeoutError" || errName === "AbortError";
      if (!aborted) {
        await adminClient
          .from("exercise_requests")
          .update({
            status: "rejected",
            error_message: "WEBHOOK_FAILED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", request_id);
        return json(502, { error: "WEBHOOK_FAILED" });
      }
    }

    await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "verify-exercise",
    });

    return json(202, { status: "processing", request_id });
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
