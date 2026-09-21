import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKETS = ["avatars", "product-images", "progress-photos", "qualification-proofs"];
const LIST_PAGE = 1000;
const REMOVE_BATCH = 100;

type StorageListEntry = { name?: string; id?: string | null };

async function listOwnedStoragePaths(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
  warnings: string[],
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  for (;;) {
    const { data: entries, error: listError } = await adminClient.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE, offset });
    if (listError) {
      warnings.push(`${bucket}:${prefix}: list failed (${listError.message})`);
      return files;
    }
    const page = (entries ?? []) as StorageListEntry[];
    for (const entry of page) {
      if (!entry.name) continue;
      const path = `${prefix}/${entry.name}`;
      if (!entry.id) {
        files.push(...await listOwnedStoragePaths(adminClient, bucket, path, warnings));
      } else {
        files.push(path);
      }
    }
    if (page.length < LIST_PAGE) break;
    offset += LIST_PAGE;
    if (offset > 50_000) {
      warnings.push(`${bucket}:${prefix}: truncated after 50000 listings`);
      break;
    }
  }
  return files;
}

/**
 * C03 — account deletion is a business workflow, not a raw Auth delete:
 * 1. close_coach_account (service_role): for every active client, copy each
 *    assignment through the P3 snapshot engine (exact source revision +
 *    workout-referenced revisions, same revision_no) onto a client-owned
 *    program, retarget workouts.program_id, pause with frozen_revision_no,
 *    then run the solo transition.
 *    Single transaction — all or nothing, safe to retry.
 * 2. Paginated storage cleanup of the user's own prefixes (best effort).
 * 3. Auth user deletion (cascades to coach-owned rows).
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

    // 2. Recursive Storage API cleanup (list() folder entries are not files).
    const warnings: string[] = [];
    for (const bucket of BUCKETS) {
      const paths = await listOwnedStoragePaths(adminClient, bucket, user.id, warnings);
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const batch = paths.slice(i, i + REMOVE_BATCH);
        const { error: removeError } = await adminClient.storage.from(bucket).remove(batch);
        if (removeError) warnings.push(`${bucket}: remove failed (${removeError.message})`);
      }
    }

    // 3. Auth deletion (cascades to remaining coach-owned rows).
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        transitioned: transition.transitioned ?? 0,
        forked: transition.forked ?? 0,
        warnings,
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
