/**
 * Quarantined 2026-08-31. Do not mutate user_roles from Stripe.
 * Coaching product is free. Do not build Premium.
 */
Deno.serve(() =>
  new Response(JSON.stringify({ error: "gone", reason: "billing_quarantined" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
