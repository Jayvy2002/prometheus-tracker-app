/**
 * Quarantined 2026-08-31. Do not mutate user_roles from Stripe.
 * Prometheus is free while the product is being built. Billing is "not now",
 * not "never" — see docs/VISION.md before reviving this.
 */
Deno.serve(() =>
  new Response(JSON.stringify({ error: "gone", reason: "billing_quarantined" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
