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

function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function incomingSecret(req: Request): string {
  const header = req.headers.get("X-Webhook-Key") || req.headers.get("X-Sender-Key") || "";
  if (header) return header;
  const auth = req.headers.get("Authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return empty(204);
  }

  // Secrets live in the dashboard, never in git.
  const expected = (Deno.env.get("NOTIFY_SECRET") ?? Deno.env.get("GROK_BOT_WEBHOOK_SECRET") ?? "").trim();
  if (!expected) {
    return empty(204);
  }
  if (!secretsEqual(incomingSecret(req), expected)) {
    return empty(401);
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

  const webhookUrl = Deno.env.get("GROK_BOT_WEBHOOK_URL") ?? "";
  if (!webhookUrl) {
    return empty(204);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${expected}`,
    "X-Webhook-Key": expected,
    "X-Sender-Key": expected,
  };

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
