import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json, runCoachAgent } from "../_shared/coachAgent.ts";

/**
 * Onboarding-complete ping from the DB trigger (HMAC).
 * Keeps HMAC auth. Work is in-process coach-agent (OpenAI), not Second.
 * Does NOT POST the Grok Bot webhook.
 */

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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return empty(204);
  }

  const expected = (Deno.env.get("NOTIFY_SECRET") ?? Deno.env.get("GROK_BOT_WEBHOOK_SECRET") ?? "").trim();
  if (!expected) {
    return empty(204);
  }
  if (!secretsEqual(incomingSecret(req), expected)) {
    return empty(401);
  }

  let payload: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = {};
  }

  const clientId = asString(payload.user_id) || asString(payload.client_id);
  const coachId = asString(payload.coach_id);
  if (!clientId || !coachId) {
    return json(200, { ok: true, skipped: "missing_ids" });
  }

  const openaiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  if (!openaiKey) {
    return json(200, { ok: true, skipped: "OPENAI_API_KEY" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  const name = asString(payload.full_name) || "ce client";
  const prompt =
    `Le client ${name} vient de terminer son questionnaire d'accueil. Rédige un programme et les variables de suivi ` +
    `à partir de "intake" (lieu, équipement, jours disponibles, séances réalistes, durée, niveau, préférences, douleurs, drapeaux médicaux). ` +
    `Pas de calories, macros ni recettes. ISSN reste la formule de l'app. Rien ne s'applique tout seul.`;

  const result = await runCoachAgent(admin, openaiKey, {
    kind: "onboarding_plan",
    coachId,
    clientId,
    programId: null,
    prompt,
    screen: "onboarding_complete",
    // The coach's UI language is not stored server-side yet → French default.
    locale: "fr",
    context: {
      goal: payload.goal ?? null,
      training_frequency: payload.training_frequency ?? null,
      training_focus: payload.training_focus ?? null,
      injuries_limitations: payload.injuries_limitations ?? null,
    },
  });

  if (!result.ok) {
    return json(200, { ok: true, skipped: result.error });
  }

  return json(200, {
    ok: true,
    intervention_id: result.interventionId,
    status: "ready",
  });
});
