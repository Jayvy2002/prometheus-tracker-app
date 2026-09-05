/**
 * Quarantined 2026-08-31. Do not call.
 * Prometheus is free while the product is being built. Billing is "not now",
 * not "never" — see docs/VISION.md before reviving this.
 */
function corsHeaders(req: Request) {
  const siteUrl = Deno.env.get("SITE_URL");
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = siteUrl ? (origin === siteUrl ? siteUrl : "") : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve((req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  return new Response(JSON.stringify({ error: "gone", reason: "billing_quarantined" }), {
    status: 410,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
