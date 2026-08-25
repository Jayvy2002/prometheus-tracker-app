import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

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

    const { data: link } = await userClient
      .from("coach_client_links")
      .select("id")
      .eq("coach_id", user.id)
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();

    if (!link) return json({ available: false, error: "not_coach" }, 403);

    if (!openaiKey) {
      return json({ available: false, error: "ai_unavailable" });
    }

    const { data: profile } = await userClient
      .from("user_profiles")
      .select(
        "full_name, gender, date_of_birth, height_cm, weight_kg, target_weight_kg, activity_level, goal, diet_type, food_allergies, meals_per_day, cooking_level, training_experience, training_frequency, training_focus, injuries_limitations, stress_level, hydration_habit, supplement_use, motivation, sleep_hours_average, daily_steps_average, daily_calorie_target, protein_target, carbs_target, fat_target, onboarding_completed",
      )
      .eq("id", clientId)
      .maybeSingle();

    if (!profile) return json({ available: false, error: "client_not_found" }, 404);

    const adminClient = createClient(supabaseUrl, serviceKey);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usageCount } = await adminClient
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("function_name", "suggest-client-plan")
      .gte("called_at", dayStart.toISOString());

    if ((usageCount ?? 0) >= 20) {
      return json({ available: false, error: "daily_limit" }, 429);
    }

    await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "suggest-client-plan",
    });

    const systemPrompt = `You are a kinesiology coaching assistant. You draft a plan the COACH will review. Never address the client. Never claim the plan is applied.

Respond with ONLY valid JSON (no markdown) with this exact shape:
{
  "program": {
    "name": "short program name",
    "description": "1-2 sentences",
    "duration_weeks": 8,
    "days": [
      {
        "weekday": 1,
        "name": "session name",
        "exercises": [
          { "name": "exercise name", "default_sets": 3, "default_reps": 10 }
        ]
      }
    ]
  },
  "tracking": {
    "track_weight": true,
    "track_checkins": true,
    "track_nutrition": true,
    "track_workouts": true,
    "workout_focus": "optional note on which sessions to watch"
  },
  "nutrition": {
    "calories": 2200,
    "protein": 160,
    "carbs": 220,
    "fat": 70,
    "rationale": "one sentence using ISSN-style bodyweight protein and the client's goal"
  },
  "recipes": ["short meal idea 1", "short meal idea 2", "short meal idea 3"]
}

Rules:
- weekday is JS getDay(): 0=Sunday … 6=Saturday
- Include exactly training_frequency training days (1-6). Rest days omitted.
- Respect injuries_limitations: avoid contraindicated patterns
- Match training_focus and experience
- Protein ~1.6–2.2 g/kg depending on cut/bulk/maintain
- Calories from a plausible TDEE then goal (+300 bulk, -500 cut, 0 maintain)
- Recipes must respect diet_type and food_allergies
- 3–6 exercises per training day, common gym movements
- Language of name/description/rationale/recipes: match the client's likely language from their name but prefer French if unclear`;

    const userMessage = `Client onboarding answers:\n${JSON.stringify(profile, null, 2)}`;

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
        max_tokens: 1400,
        temperature: 0.4,
      }),
    });

    if (!openaiRes.ok) {
      return json({ available: false, error: "ai_unavailable" });
    }

    const aiResult = await openaiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content ?? "";
    const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(cleaned);
    } catch {
      return json({ available: false, error: "ai_unavailable" });
    }

    return json({ available: true, draft });
  } catch (err) {
    return json({
      available: false,
      error: "ai_unavailable",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
