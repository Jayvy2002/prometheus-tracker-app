import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { chatCompletionsBody, resolveOpenAiModel } from "../_shared/openaiJson.ts";

/**
 * Exercise check: catalog first. A miss may ask OpenAI for a non-binding
 * suggestion stored on the pending request. This function never inserts an
 * exercise and never marks a proposal approved.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerifyRequest {
  request_id: string;
}

interface ExerciseData {
  name: string;
  name_fr: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  category: string;
  equipment: string;
  instructions: string;
  tips: string;
  difficulty: string;
  is_real_exercise: boolean;
  rejection_reason: string;
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

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return json(401, { error: "Unauthorized" });
    }

    const { request_id }: VerifyRequest = await req.json().catch(() => ({ request_id: "" }));
    if (!request_id || typeof request_id !== "string") {
      return json(400, { error: "request_id is required" });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: exReq, error: fetchErr } = await adminClient
      .from("exercise_requests")
      .select("*")
      .eq("id", request_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !exReq) {
      return json(404, { error: "Exercise request not found" });
    }

    const normalizedName = String(exReq.name ?? "").trim();
    const { data: resolvedId } = await adminClient.rpc("resolve_exercise_catalog", {
      p_name: normalizedName,
    });
    let existing: Record<string, unknown> | null = null;
    if (typeof resolvedId === "string" && resolvedId) {
      const { data } = await adminClient.from("exercises").select("*").eq("id", resolvedId).maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await adminClient
        .from("exercises")
        .select("*")
        .ilike("name", normalizedName)
        .is("merged_into_id", null)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      await adminClient
        .from("exercise_requests")
        .update({
          status: "matched",
          result_exercise_id: existing.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(200, { exercise: existing, status: "matched", applied: false });
    }

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usageCount } = await adminClient
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("function_name", "verify-exercise")
      .gte("called_at", dayStart.toISOString());

    if ((usageCount ?? 0) >= 20) {
      return json(429, {
        error: "DAILY_LIMIT_REACHED",
        limit: 20,
      });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return json(200, { status: "pending", applied: false });
    }

    await adminClient
      .from("exercise_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", request_id);

    const systemPrompt = `You are a fitness exercise description assistant. Respond with ONLY a JSON object. Do not decide whether the exercise is added to the catalog.
{
  "name": "standardized English exercise name",
  "name_fr": "French exercise name",
  "primary_muscles": ["muscle1"],
  "secondary_muscles": ["muscle1"],
  "category": "compound|isolation|cardio|stretch|plyometric",
  "equipment": "barbell|dumbbell|machine|cable|bodyweight|kettlebell|band|other",
  "instructions": "Step-by-step instructions in French (3-4 sentences)",
  "tips": "Form tips in French (2-3 sentences)",
  "difficulty": "beginner|intermediate|advanced",
  "is_real_exercise": true,
  "rejection_reason": ""
}`;

    const descriptionInfo = exReq.description ? `\nUser description: "${exReq.description}"` : "";
    const userMessage = `Exercise name: "${exReq.name}"
User-provided muscle info: "${exReq.muscles || "not specified"}"${descriptionInfo}

Describe this exercise. The catalog decision is human.`;

    let openaiRes: Response;
    try {
      openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chatCompletionsBody({
          model: resolveOpenAiModel(),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          maxTokens: 800,
          temperature: 0.1,
        })),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      await adminClient
        .from("exercise_requests")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", request_id);
      return json(200, { status: "pending", applied: false });
    }

    await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "verify-exercise",
    });

    if (!openaiRes.ok) {
      await adminClient
        .from("exercise_requests")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", request_id);
      return json(200, { status: "pending", applied: false });
    }

    const aiResult = await openaiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content ?? "";
    let exerciseData: ExerciseData | null = null;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      exerciseData = JSON.parse(cleaned);
    } catch {
      exerciseData = null;
    }

    await adminClient
      .from("exercise_requests")
      .update({
        status: "pending",
        ai_suggestion: exerciseData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    return json(200, { status: "pending", applied: false, suggestion: exerciseData });
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
