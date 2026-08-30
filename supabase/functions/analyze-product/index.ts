import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * Synchronous food identification: food_products → Open Food Facts → OpenAI vision.
 * Writes food_products + completes product_requests in this same request.
 * Does NOT ping Second. Coach drafts stay on coach-agent.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IMAGE_SLOTS = [
  ["image_front", "front of product"],
  ["image_back", "back of product"],
  ["image_nutrition", "nutrition facts label"],
] as const;

interface AnalyzeRequest {
  request_id: string;
}

interface ProductData {
  name: string;
  brand: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  serving_size: number;
  serving_unit: string;
  confidence: number;
}

type AdminClient = ReturnType<typeof createClient>;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function completeWithProduct(
  adminClient: AdminClient,
  requestId: string,
  product: Record<string, unknown>,
  confidence: number,
) {
  await adminClient
    .from("product_requests")
    .update({
      status: "completed",
      result_product_id: product.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  return json(200, { product, confidence, status: "completed" });
}

async function lookupOpenFoodFacts(barcode: string): Promise<ProductData & { barcode: string } | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}` +
        `?fields=product_name,product_name_fr,product_name_en,brands,nutriments,serving_quantity,serving_size`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      status?: number;
      product?: {
        product_name?: string;
        product_name_fr?: string;
        product_name_en?: string;
        brands?: string;
        nutriments?: Record<string, number>;
        serving_quantity?: number | string;
        serving_size?: string;
      };
    };
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const n = p.nutriments ?? {};
    const name = p.product_name || p.product_name_fr || p.product_name_en;
    if (!name) return null;
    return {
      barcode,
      name,
      brand: p.brands || "",
      calories_per_100g: n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0,
      protein_per_100g: n.proteins_100g ?? n.proteins ?? 0,
      carbs_per_100g: n.carbohydrates_100g ?? n.carbohydrates ?? 0,
      fat_per_100g: n.fat_100g ?? n.fat ?? 0,
      serving_size: +(p.serving_quantity || 100) || 100,
      serving_unit: (p.serving_size ?? "").includes("ml") ? "ml" : "g",
      confidence: 90,
    };
  } catch {
    return null;
  }
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

    const { data: prodReq, error: fetchErr } = await adminClient
      .from("product_requests")
      .select("*")
      .eq("id", request_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !prodReq) {
      return json(404, { error: "Product request not found" });
    }

    const barcode = typeof prodReq.barcode === "string" ? prodReq.barcode.trim() : "";
    const notes = typeof prodReq.notes === "string" ? prodReq.notes.trim() : "";
    const hasImagePath = IMAGE_SLOTS.some(([field]) => {
      const path = prodReq[field];
      return typeof path === "string" && path.length > 0;
    });

    if (!hasImagePath && !notes && !barcode) {
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

    // 1. food_products by barcode — skip API
    if (barcode) {
      const { data: byBarcode } = await adminClient
        .from("food_products")
        .select("*")
        .eq("barcode", barcode)
        .maybeSingle();
      if (byBarcode) {
        return await completeWithProduct(adminClient, request_id, byBarcode as Record<string, unknown>, 100);
      }
    }

    // 2. Open Food Facts — skip API when barcode-only (client already tried OFF before photos)
    if (barcode && !hasImagePath && !notes) {
      const off = await lookupOpenFoodFacts(barcode);
      if (off) {
        const { data: saved, error: offInsertErr } = await adminClient
          .from("food_products")
          .insert({
            barcode,
            name: off.name,
            brand: off.brand || null,
            calories_per_100g: off.calories_per_100g,
            protein_per_100g: off.protein_per_100g,
            carbs_per_100g: off.carbs_per_100g,
            fat_per_100g: off.fat_per_100g,
            serving_size: off.serving_size,
            serving_unit: off.serving_unit,
            created_by: user.id,
            data_source: "openfoodfacts",
          })
          .select()
          .maybeSingle();

        if (saved) {
          return await completeWithProduct(adminClient, request_id, saved as Record<string, unknown>, off.confidence);
        }

        if (offInsertErr) {
          const { data: dup } = await adminClient
            .from("food_products")
            .select("*")
            .eq("barcode", barcode)
            .maybeSingle();
          if (dup) {
            return await completeWithProduct(adminClient, request_id, dup as Record<string, unknown>, off.confidence);
          }
        }
      }
    }

    // 3. Synchronous OpenAI vision/nutrition — complete the request in this response
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

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: "OPENAI_API_KEY not configured",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(500, { error: "OPENAI_API_KEY not configured" });
    }

    await adminClient
      .from("product_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", request_id);

    const imageUrls: { type: string; url: string }[] = [];
    for (const [field, label] of IMAGE_SLOTS) {
      const path = prodReq[field];
      if (typeof path === "string" && path) {
        const { data: signedData } = await adminClient.storage
          .from("product-images")
          .createSignedUrl(path, 600);
        if (signedData?.signedUrl) {
          imageUrls.push({ type: label, url: signedData.signedUrl });
        }
      }
    }

    const systemPrompt = `You are a nutrition data extraction assistant. Your job is to analyze food product images, notes, barcodes, and any available information to extract accurate nutritional data.

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text) with these exact fields:
{
  "name": "product name",
  "brand": "brand name or empty string",
  "calories_per_100g": number,
  "protein_per_100g": number,
  "carbs_per_100g": number,
  "fat_per_100g": number,
  "serving_size": number,
  "serving_unit": "g or ml",
  "confidence": number
}

The "confidence" field must be an integer from 0 to 100 representing how certain you are about the nutritional values:
- 95-100: Values read directly and clearly from a nutrition facts label in the image
- 75-94: Values from a partially visible label, or from a well-known branded product you can identify with high certainty
- 50-74: Values estimated from product name/notes using your knowledge (no label visible), or from a fresh/unpackaged food
- 0-49: Values are a rough guess — image unclear, product unidentifiable, or conflicting information
IMPORTANT: If images contain conflicting values between front-of-pack and the nutrition facts label, always prioritize the nutrition facts label.

Rules:
- All nutritional values MUST be per 100g (or 100ml for liquids)
- If the label shows values per serving, convert them to per 100g using the serving size
- serving_size should be the typical serving size in grams (default 100)
- serving_unit should be "g" for solids, "ml" for liquids
- Be precise with the numbers from the nutrition label if visible

IMPORTANT - Handling fresh foods, fruits, vegetables, meat, and unpackaged items:
- If the image shows a whole food (apple, banana, chicken breast, rice, egg, etc.) with NO nutrition label, you MUST use your extensive knowledge of food nutrition to provide accurate standard values per 100g
- For example: an apple is ~52 kcal, 0.3g protein, 14g carbs, 0.2g fat per 100g. A banana is ~89 kcal, 1.1g protein, 23g carbs, 0.3g fat per 100g
- For fresh produce, set brand to "" and serving_size to the typical weight of one unit (e.g. 182g for a medium apple, 118g for a medium banana, 150g for a chicken breast)
- You have deep knowledge of USDA food composition data - use it confidently
- If the user provides notes mentioning a food name, use that to identify the product even if images are unclear

IMPORTANT - Barcode lookup:
- If a barcode is provided, use your knowledge to identify common products associated with that barcode
- Combine barcode info with any images or notes to determine the most accurate nutritional values

IMPORTANT - Internet knowledge:
- Use your full training knowledge which includes extensive food databases (USDA, nutritiondata.self.com, etc.) to provide accurate values
- For branded products you recognize from images or notes, use known nutritional values for that product
- NEVER return all zeros - if you can identify the food at all, provide your best estimate based on your knowledge`;

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
    ];

    const userContent: Array<Record<string, unknown>> = [];
    let textPart = "";
    if (barcode) textPart += `Barcode: ${barcode}\n`;
    if (notes) textPart += `User notes: ${notes}\n`;
    if (imageUrls.length > 0) {
      textPart += `I'm providing ${imageUrls.length} image(s) of this product: ${imageUrls.map((i) => i.type).join(", ")}.\n`;
    }
    textPart += "\nExtract the nutritional information and return the JSON object.";
    userContent.push({ type: "text", text: textPart });
    for (const img of imageUrls) {
      userContent.push({
        type: "image_url",
        image_url: { url: img.url, detail: "high" },
      });
    }
    messages.push({ role: "user", content: userContent });

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 600,
        temperature: 0.1,
      }),
    });

    await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      function_name: "analyze-product",
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: `OpenAI API error: ${openaiRes.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(502, { error: "AI analysis failed", details: errBody });
    }

    const aiResult = await openaiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content ?? "";

    let productData: ProductData;
    try {
      const cleaned = rawContent
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      productData = JSON.parse(cleaned);
    } catch {
      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: `Failed to parse AI response: ${rawContent.substring(0, 200)}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(500, { error: "Failed to parse AI response" });
    }

    const nameToMatch = (productData.name || "").trim();
    const brandToMatch = (productData.brand || "").trim();

    let dedupeProduct = null;
    if (barcode) {
      const { data: byBarcode } = await adminClient
        .from("food_products")
        .select("*")
        .eq("barcode", barcode)
        .limit(1);
      dedupeProduct = byBarcode?.[0] ?? null;
    }

    if (!dedupeProduct && nameToMatch) {
      let nameQuery = adminClient
        .from("food_products")
        .select("*")
        .ilike("name", nameToMatch);
      if (brandToMatch) {
        nameQuery = nameQuery.ilike("brand", brandToMatch);
      }
      const { data: byName } = await nameQuery.limit(1);
      dedupeProduct = byName?.[0] ?? null;
    }

    if (dedupeProduct) {
      return await completeWithProduct(
        adminClient,
        request_id,
        dedupeProduct as Record<string, unknown>,
        productData.confidence ?? 100,
      );
    }

    const { data: newProduct, error: insertErr } = await adminClient
      .from("food_products")
      .insert({
        barcode: barcode || null,
        name: productData.name || "Unknown Product",
        brand: productData.brand || null,
        calories_per_100g: productData.calories_per_100g || 0,
        protein_per_100g: productData.protein_per_100g || 0,
        carbs_per_100g: productData.carbs_per_100g || 0,
        fat_per_100g: productData.fat_per_100g || 0,
        serving_size: productData.serving_size || 100,
        serving_unit: productData.serving_unit || "g",
        created_by: user.id,
        data_source: "user",
      })
      .select()
      .maybeSingle();

    if (insertErr || !newProduct) {
      let dupProduct = null;
      if (barcode) {
        const { data } = await adminClient
          .from("food_products")
          .select("*")
          .eq("barcode", barcode)
          .maybeSingle();
        dupProduct = data;
      }
      if (dupProduct) {
        return await completeWithProduct(
          adminClient,
          request_id,
          dupProduct as Record<string, unknown>,
          productData.confidence ?? 100,
        );
      }
      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: `DB insert failed: ${insertErr?.message ?? "unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);
      return json(500, { error: "Failed to save product" });
    }

    return await completeWithProduct(
      adminClient,
      request_id,
      newProduct as Record<string, unknown>,
      productData.confidence ?? 100,
    );
  } catch (err) {
    return json(500, {
      error: "Internal server error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
});
