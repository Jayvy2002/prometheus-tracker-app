/**
 * RETIRED (S01) — batch-verify-exercises est obsolète et restée déployée
 * avec verify_jwt=false + comparaison à SUPABASE_ANON_KEY.
 * Remplacée par `verify-exercise` (JWT utilisateur, 1 requête, rate-limit).
 * Cette version renvoie 410 pour fermer le traitement privilégié.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ error: "gone", use: "verify-exercise" }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
