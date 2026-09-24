import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  StorageCleanupError,
  deleteAuthUserAfterStorageCleanup,
  removeMessageAttachments,
} from "./storageCleanup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Vision §30 — deletion is requested, then purged after a recovery window.
 *
 * A signed-in person calling this function (or the RPC directly) only
 * *requests* the deletion: request_account_deletion withdraws access at once
 * and keeps every row until account_deletion_window() has passed.
 *
 * The hourly cron (Bearer ACCOUNT_PURGE_CRON_SECRET, body {"mode":"purge_due"})
 * claims due requests and runs, for each, the unchanged C03 purge:
 * 0. prepare_account_deletion — read-only preflight, refuses the last operator.
 * 1. close_coach_account (service_role): every active client keeps an exact
 *    copy of their program through the P3 snapshot engine, then goes Solo.
 *    Single transaction — all or nothing, safe to retry.
 * 2. Message thread files of the person (both sides), fail-closed.
 * 3. Complete Storage cleanup of the person's own prefixes (fail-closed),
 *    then Auth user deletion. account_deletion_guard still refuses the last
 *    operator and purges claimed provisional copies in the same transaction.
 * Any failure puts the request back in the queue (release_account_deletion);
 * after 5 attempts it waits for an operator. Nothing is ever half-deleted
 * silently: the Auth user is only removed after every step succeeded.
 */
class PurgeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function purgeUser(adminClient: SupabaseClient, userId: string) {
  const { error: prepError } = await adminClient.rpc("prepare_account_deletion", { p_user: userId });
  if (prepError) {
    const last = (prepError.message ?? "").includes("last_operator");
    throw new PurgeError(last ? "last_operator" : "prepare_failed", prepError.message);
  }

  const { data: closed, error: closeError } = await adminClient.rpc(
    "close_coach_account",
    { p_coach_id: userId },
  );
  if (closeError) throw new PurgeError("close_coach_account", closeError.message);
  const transition = (closed ?? {}) as { ok?: boolean; transitioned?: number; forked?: number };
  if (transition.ok === false) throw new PurgeError("close_coach_account", "Coach transition refused, account kept.");

  try {
    const { data: threadFiles, error: listError } = await adminClient.rpc(
      "account_message_attachment_paths",
      { p_user: userId },
    );
    if (listError) throw new StorageCleanupError("list_failed", `message-attachments: ${listError.message}`);
    await removeMessageAttachments(adminClient, (threadFiles ?? []) as string[]);
    await deleteAuthUserAfterStorageCleanup(
      adminClient,
      userId,
      (id) => adminClient.auth.admin.deleteUser(id),
    );
  } catch (cleanupErr) {
    if (cleanupErr instanceof StorageCleanupError) {
      throw new PurgeError("storage_cleanup_failed", `${cleanupErr.reason}: ${cleanupErr.message}`);
    }
    throw cleanupErr;
  }
  return { transitioned: transition.transitioned ?? 0, forked: transition.forked ?? 0 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = (Deno.env.get("ACCOUNT_PURGE_CRON_SECRET") ?? "").trim();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Scheduled purge: only the cron secret or the service key.
    const isService = bearer === serviceRoleKey.trim() || (cronSecret.length > 0 && bearer === cronSecret);
    if (isService) {
      const body = await req.json().catch(() => ({})) as { mode?: string };
      if (body.mode !== "purge_due") return json({ error: "unknown_mode" }, 400);
      const { data: due, error: claimError } = await adminClient.rpc("claim_due_account_deletions", { p_limit: 10 });
      if (claimError) return json({ error: `claim: ${claimError.message}` }, 500);
      const results: Array<{ user: string; ok: boolean; code?: string }> = [];
      for (const userId of (due ?? []) as string[]) {
        try {
          await purgeUser(adminClient, userId);
          results.push({ user: userId, ok: true });
        } catch (err) {
          const code = err instanceof PurgeError ? err.code : "unexpected";
          await adminClient.rpc("release_account_deletion", {
            p_user: userId,
            p_error: `${code}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
          });
          results.push({ user: userId, ok: false, code });
        }
      }
      return json({ purged: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
    }

    // A person: request the deletion (recovery window), never an immediate purge.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    const { data: requested, error: requestError } = await userClient.rpc("request_account_deletion");
    if (requestError) {
      const last = (requestError.message ?? "").includes("last_operator");
      return json({ error: last ? "last_operator" : requestError.message }, last ? 409 : 500);
    }
    return json({ success: true, ...(requested as Record<string, unknown>) });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
