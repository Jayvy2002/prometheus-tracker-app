import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * Synchronous exercise verification: library first, then OpenAI.
 * Completes exercise_requests (and INSERT exercises if approved) in this same request.
 * Does NOT ping Second. Coach drafts stay on ask-second.
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
      await adminClient
        .from("exercise_requests")
        .update({
          status: "rejected",
          error_message: "OPENAI_API_KEY not configured",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(500, { error: "OPENAI_API_KEY not configured" });
    }

    await adminClient
      .from("exercise_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", request_id);

    const systemPrompt = `You are a fitness exercise verification assistant. Your role is to verify whether a proposed exercise is a real, legitimate exercise and provide accurate details about it.

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text) with these exact fields:
{
  "name": "standardized English exercise name",
  "name_fr": "French exercise name",
  "primary_muscles": ["muscle1", "muscle2"],
  "secondary_muscles": ["muscle1"],
  "category": "compound|isolation|cardio|stretch|plyometric",
  "equipment": "barbell|dumbbell|machine|cable|bodyweight|kettlebell|band|other",
  "instructions": "Step-by-step instructions in French (3-4 sentences)",
  "tips": "Form tips and common mistakes in French (2-3 sentences)",
  "difficulty": "beginner|intermediate|advanced",
  "is_real_exercise": true/false,
  "rejection_reason": "reason in French if not a real exercise, empty string otherwise"
}

Muscle names must use these exact values: chest, upper_chest, lower_chest, front_delts, side_delts, rear_delts, traps, lats, rhomboids, lower_back, core, quadriceps, hamstrings, glutes, calves, biceps, triceps, forearms, rotator_cuff, hip_flexors, adductors, abductors, shoulders, obliques

Rules:
- VERIFY the exercise is a real, recognized fitness exercise practiced in gyms or sports
- If the user provides a name that is close to a known exercise but misspelled, correct the name
- If the exercise name is gibberish, offensive, or not a real exercise, set is_real_exercise to false
- If it's a variation of a known exercise (e.g. "close grip bench press"), treat it as valid
- Provide accurate muscle activation data based on exercise science
- Instructions and tips must be in French
- Be strict: only approve exercises that are genuinely practiced in fitness/sports`;

    const descriptionInfo = exReq.description ? `\nUser description: "${exReq.description}"` : "";
    const userMessage = `Exercise name: "${exReq.name}"
User-provided muscle info: "${exReq.muscles || "not specified"}"${descriptionInfo}

Verify this exercise and provide complete details.`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 800,
        temperature: 0.1,
      }),
    });

    await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "verify-exercise",
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      await adminClient
        .from("exercise_requests")
        .update({
          status: "rejected",
          error_message: `AI verification failed: ${openaiRes.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(502, { error: "AI verification failed", details: errBody });
    }

    const aiResult = await openaiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content ?? "";

    let exerciseData: ExerciseData;
    try {
      const cleaned = rawContent
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      exerciseData = JSON.parse(cleaned);
    } catch {
      await adminClient
        .from("exercise_requests")
        .update({
          status: "rejected",
          error_message: "Erreur d'analyse de la reponse IA",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(500, { error: "Failed to parse AI response" });
    }

    if (!exerciseData.is_real_exercise) {
      await adminClient
        .from("exercise_requests")
        .update({
          status: "rejected",
          error_message:
            exerciseData.rejection_reason ||
            "Cet exercice n'a pas ete reconnu comme un exercice de fitness valide.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(200, {
        rejected: true,
        reason: exerciseData.rejection_reason,
        status: "rejected",
      });
    }

    const { data: newExercise, error: insertErr } = await adminClient
      .from("exercises")
      .insert({
        name: exerciseData.name,
        name_fr: exerciseData.name_fr || "",
        primary_muscles: exerciseData.primary_muscles || [],
        secondary_muscles: exerciseData.secondary_muscles || [],
        category: exerciseData.category || "compound",
        equipment: exerciseData.equipment || "other",
        instructions: exerciseData.instructions || "",
        tips: exerciseData.tips || "",
        difficulty: exerciseData.difficulty || "intermediate",
        verified: true,
        created_by: user.id,
      })
      .select()
      .maybeSingle();

    if (insertErr || !newExercise) {
      const { data: dupExercise } = await adminClient
        .from("exercises")
        .select("*")
        .ilike("name", exerciseData.name)
        .maybeSingle();

      if (dupExercise) {
        await adminClient
          .from("exercise_requests")
          .update({
            status: "approved",
            result_exercise_id: dupExercise.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request_id);
        return json(200, { exercise: dupExercise, status: "approved" });
      }

      await adminClient
        .from("exercise_requests")
        .update({
          status: "rejected",
          error_message: `Erreur lors de l'enregistrement: ${insertErr?.message ?? "unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(500, { error: "Failed to save exercise" });
    }

    await adminClient
      .from("exercise_requests")
      .update({
        status: "approved",
        result_exercise_id: newExercise.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    return json(200, { exercise: newExercise, status: "approved" });
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
