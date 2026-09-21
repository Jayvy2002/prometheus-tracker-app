import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  StorageCleanupError,
  deleteAuthUserAfterStorageCleanup,
} from "./storageCleanup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * C03 — account deletion is a business workflow, not a raw Auth delete:
 * 1. close_coach_account (service_role): for every active client, copy each
 *    assignment through the P3 snapshot engine (exact source revision +
 *    workout-referenced revisions, same revision_no) onto a client-owned
 *    program, retarget workouts.program_id, pause with frozen_revision_no,
 *    then run the solo transition.
 *    Single transaction — all or nothing, safe to retry.
 * 2. Complete Storage API cleanup of the user's own prefixes (fail-closed).
 *    list / remove / truncation failure aborts; the Auth user is kept so
 *    close_coach_account + cleanup can be retried. A missing
 *    qualification-proofs bucket (pre-P4) is treated as empty.
 * 3. Auth user deletion (cascades to remaining coach-owned rows).
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Coach transition first — aborts everything on failure (nothing deleted).
    const { data: closed, error: closeError } = await adminClient.rpc(
      "close_coach_account",
      { p_coach_id: user.id },
    );
    if (closeError) {
      return new Response(
        JSON.stringify({ error: `close_coach_account: ${closeError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const transition = (closed ?? {}) as { ok?: boolean; transitioned?: number; forked?: number };
    if (transition.ok === false) {
      return new Response(
        JSON.stringify({ error: "Coach transition refused, account kept." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Fail-closed Storage cleanup — never delete Auth if personal objects remain.
    try {
      await deleteAuthUserAfterStorageCleanup(
        adminClient,
        user.id,
        (id) => adminClient.auth.admin.deleteUser(id),
      );
    } catch (cleanupErr) {
      if (cleanupErr instanceof StorageCleanupError) {
        return new Response(
          JSON.stringify({
            error: "storage_cleanup_failed",
            reason: cleanupErr.reason,
            detail: cleanupErr.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw cleanupErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        transitioned: transition.transitioned ?? 0,
        forked: transition.forked ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
