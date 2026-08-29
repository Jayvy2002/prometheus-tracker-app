/**
 * Read-only leftover: returns a pending onboarding_plan draft if Second already wrote one.
 * Coach UI must not treat this as AI. New requests go through ask-second.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
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
    if (!authHeader) return json({ available: false, error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ available: false, error: "unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const clientId = typeof payload.client_id === "string" ? payload.client_id : "";
    if (!clientId) return json({ available: false, error: "client_id is required" }, 400);

    const { data: stored } = await userClient
      .from("coach_interventions")
      .select("payload")
      .eq("coach_id", user.id)
      .eq("client_id", clientId)
      .eq("kind", "onboarding_plan")
      .eq("status", "pending")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stored?.payload) {
      return json({ available: true, draft: stored.payload });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch {
    return json({ available: false, error: "ai_unavailable" });
  }
});
