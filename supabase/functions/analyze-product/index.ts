import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * Enqueues food-product vision/nutrition extraction via Second (Grok Bot).
 * Does not call OpenAI and does not insert into food_products.
 *
 * Same webhook env as notify-onboarding-complete:
 *   GROK_BOT_WEBHOOK_URL + NOTIFY_SECRET (fallback GROK_BOT_WEBHOOK_SECRET)
 *
 * Second must (service role — RLS will not let another user update the request):
 *   1. INSERT food_products (data_source may be "user" or "second"; no DB check)
 *   2. UPDATE product_requests SET status='completed', result_product_id=<id>
 *      or status='failed' + error_message on failure
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Key, X-Sender-Key",
};

const SIGNED_URL_TTL_SECONDS = 3600;
const WEBHOOK_TIMEOUT_MS = 5000;
const IMAGE_SLOTS = [
  ["image_front", "front"],
  ["image_back", "back"],
  ["image_nutrition", "nutrition"],
] as const;

interface AnalyzeRequest {
  request_id: string;
}

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
    if (!authHeader) {
      return json(401, { error: "Missing authorization" });
    }

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
    if (!user) {
      return json(401, { error: "Unauthorized" });
    }

    const { request_id }: AnalyzeRequest = await req.json();
    if (!request_id) {
      return json(400, { error: "request_id is required" });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usageCount } = await adminClient
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("function_name", "analyze-product")
      .gte("called_at", dayStart.toISOString());

    if ((usageCount ?? 0) >= 10) {
      return json(429, { error: "DAILY_LIMIT_REACHED", limit: 10 });
    }

    const { data: prodReq, error: fetchErr } = await adminClient
      .from("product_requests")
      .select("*")
      .eq("id", request_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !prodReq) {
      return json(404, { error: "Product request not found" });
    }

    const hasNotes = typeof prodReq.notes === "string" && prodReq.notes.trim().length > 0;
    const hasBarcode = typeof prodReq.barcode === "string" && prodReq.barcode.trim().length > 0;
    const hasImagePath = IMAGE_SLOTS.some(([field]) => {
      const path = prodReq[field];
      return typeof path === "string" && path.length > 0;
    });

    if (!hasImagePath && !hasNotes && !hasBarcode) {
      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: "No images, notes, or barcode provided",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(400, { error: "No data to analyze" });
    }

    if (!webhookUrl || !webhookSecret) {
      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: "WEBHOOK_NOT_CONFIGURED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(503, { error: "WEBHOOK_NOT_CONFIGURED" });
    }

    const images: { type: "front" | "back" | "nutrition"; url: string }[] = [];
    for (const [field, type] of IMAGE_SLOTS) {
      const path = prodReq[field];
      if (typeof path !== "string" || !path) continue;
      const { data: signedData } = await adminClient.storage
        .from("product-images")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (signedData?.signedUrl) {
        images.push({ type, url: signedData.signedUrl });
      }
    }

    await adminClient
      .from("product_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", request_id);

    const payload = {
      kind: "analyze_product",
      request_id,
      user_id: user.id,
      barcode: hasBarcode ? prodReq.barcode : "",
      notes: hasNotes ? prodReq.notes : "",
      images,
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
          .from("product_requests")
          .update({
            status: "failed",
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
          .from("product_requests")
          .update({
            status: "failed",
            error_message: "WEBHOOK_FAILED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", request_id);
        return json(502, { error: "WEBHOOK_FAILED" });
      }
      // Timeout: the POST was likely delivered; Second continues while the app polls.
    }

    await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "analyze-product",
    });

    return json(202, { status: "processing", request_id });
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
