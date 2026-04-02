import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { request_id }: AnalyzeRequest = await req.json();
    if (!request_id) {
      return new Response(
        JSON.stringify({ error: "request_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: prodReq, error: fetchErr } = await adminClient
      .from("product_requests")
      .select("*")
      .eq("id", request_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !prodReq) {
      return new Response(
        JSON.stringify({ error: "Product request not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await adminClient
      .from("product_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", request_id);

    const imageUrls: { type: string; url: string }[] = [];

    for (const [field, label] of [
      ["image_front", "front of product"],
      ["image_back", "back of product"],
      ["image_nutrition", "nutrition facts label"],
    ] as const) {
      const path = prodReq[field];
      if (path) {
        const { data: signedData } = await adminClient.storage
          .from("product-images")
          .createSignedUrl(path, 600);
        if (signedData?.signedUrl) {
          imageUrls.push({ type: label, url: signedData.signedUrl });
        }
      }
    }

    if (imageUrls.length === 0 && !prodReq.notes && !prodReq.barcode) {
      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: "No images, notes, or barcode provided",
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ error: "No data to analyze" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const messages: Array<Record<string, unknown>> = [];

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
  "serving_unit": "g or ml"
}

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

    messages.push({ role: "system", content: systemPrompt });

    const userContent: Array<Record<string, unknown>> = [];

    let textPart = "";
    if (prodReq.barcode) {
      textPart += `Barcode: ${prodReq.barcode}\n`;
    }
    if (prodReq.notes) {
      textPart += `User notes: ${prodReq.notes}\n`;
    }
    if (imageUrls.length > 0) {
      textPart += `I'm providing ${imageUrls.length} image(s) of this product: ${imageUrls.map((i) => i.type).join(", ")}.\n`;
    }
    textPart +=
      "\nExtract the nutritional information and return the JSON object.";

    userContent.push({ type: "text", text: textPart });

    for (const img of imageUrls) {
      userContent.push({
        type: "image_url",
        image_url: { url: img.url, detail: "high" },
      });
    }

    messages.push({ role: "user", content: userContent });

    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          max_tokens: 500,
          temperature: 0.1,
        }),
      }
    );

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

      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: errBody }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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

      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- Deduplication: search by name (+ brand if available) before inserting ---
    const nameToMatch = (productData.name || "").trim();
    const brandToMatch = (productData.brand || "").trim();

    // Also check barcode first if provided (fastest path)
    let dedupeProduct = null;
    if (prodReq.barcode) {
      const { data: byBarcode } = await adminClient
        .from("food_products")
        .select("*")
        .eq("barcode", prodReq.barcode)
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
      await adminClient
        .from("product_requests")
        .update({
          status: "completed",
          result_product_id: dedupeProduct.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return new Response(JSON.stringify({ product: dedupeProduct }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // --- End deduplication ---

    const { data: newProduct, error: insertErr } = await adminClient
      .from("food_products")
      .insert({
        barcode: prodReq.barcode || null,
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
      if (prodReq.barcode) {
        const { data } = await adminClient
          .from("food_products")
          .select("*")
          .eq("barcode", prodReq.barcode)
          .maybeSingle();
        dupProduct = data;
      }

      if (dupProduct) {
        await adminClient
          .from("product_requests")
          .update({
            status: "completed",
            result_product_id: dupProduct.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request_id);

        return new Response(JSON.stringify({ product: dupProduct }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient
        .from("product_requests")
        .update({
          status: "failed",
          error_message: `DB insert failed: ${insertErr?.message ?? "unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ error: "Failed to save product" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await adminClient
      .from("product_requests")
      .update({
        status: "completed",
        result_product_id: newProduct.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request_id);

    return new Response(JSON.stringify({ product: newProduct }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: err instanceof Error ? err.message : "unknown",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
