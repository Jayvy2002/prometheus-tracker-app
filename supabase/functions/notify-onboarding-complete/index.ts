import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Key, X-Sender-Key",
};

type OnboardingPayload = {
  user_id?: unknown;
  [key: string]: unknown;
};

function empty(status: number) {
  return new Response(null, { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return empty(204);
  }

  let payload: OnboardingPayload = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as OnboardingPayload;
    }
  } catch {
    payload = {};
  }

  // Secrets live in the dashboard, never in git.
  const webhookUrl = Deno.env.get("GROK_BOT_WEBHOOK_URL") ?? "";
  if (!webhookUrl) {
    return empty(204);
  }

  const secret = Deno.env.get("GROK_BOT_WEBHOOK_SECRET") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers["X-Webhook-Key"] = secret;
    headers["X-Sender-Key"] = secret;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Swallow network errors so pg_net / the onboarding trigger stay quiet.
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
