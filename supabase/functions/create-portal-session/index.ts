/**
 * Quarantined 2026-08-31. Do not call.
 * Prometheus is free while the product is being built. Billing is "not now",
 * not "never" — see docs/VISION.md before reviving this.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(JSON.stringify({ error: "gone", reason: "billing_quarantined" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
