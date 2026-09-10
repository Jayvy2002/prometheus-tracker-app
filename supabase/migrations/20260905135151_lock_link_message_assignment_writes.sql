-- Lock down three write paths the audit found open in production.
--
-- 1. coach_client_links — `authenticated` had UPDATE on every column and the policy only checked
--    coach_id = auth.uid(). A coach could therefore run
--      UPDATE coach_client_links SET client_id = <any uuid>, status = 'active' WHERE id = <own row>
--    and become is_coach_of(<any user>): full read of workouts / nutrition / weight / check-ins /
--    photos / intake and write of kcal targets, with no signal to the victim. An ex-coach could also
--    flip an `ended` row back to `active`. Links are created only by accept_coach_invite (SECURITY
--    DEFINER, ON CONFLICT DO UPDATE), so the app only ever writes status / updated_at /
--    last_visited_at / last_nudged_at from the client (coachingStore.ts touchClientVisit, nudge,
--    removeClient fallback). Grant exactly those columns and only on active rows.
--
-- 2. coach_messages — recipients could UPDATE any column ("Recipient marks messages read" had no
--    column restriction): a client could rewrite the coach's message body. Only read_at is written
--    by the app (markThreadRead / markRead).
--
-- 3. program_assignments — one FOR ALL policy with USING (assigned_by = uid OR client_id = uid):
--    DELETE has no WITH CHECK, so a coached client could delete the assignment their coach made.
--    Split into per-command policies; only the assigner mutates. Solo users assign to themselves
--    (assigned_by = client_id = uid) and keep every right.
--
-- 4. search_food_products — SECURITY DEFINER with default PUBLIC EXECUTE: the whole food_products
--    table (incl. created_by user ids) was enumerable with the anon key. Same REVOKE as every other RPC.
--
-- 5. invoke_coach_fleet_round — "no vault secret" and "no pg_net" were RAISE WARNING + RETURN NULL,
--    so cron.job_run_details said `succeeded` while nothing ran (this is how the nightly round was
--    silently dead for days). RAISE EXCEPTION makes the job show as failed. Body otherwise identical
--    to 20260831000002 (no Grok fallback, FLEET_CRON_SECRET only).

-- 1. coach_client_links -----------------------------------------------------------------------
REVOKE UPDATE ON public.coach_client_links FROM authenticated;
GRANT UPDATE (status, updated_at, last_visited_at, last_nudged_at)
  ON public.coach_client_links TO authenticated;

DROP POLICY IF EXISTS "Coaches can end their links" ON public.coach_client_links;
CREATE POLICY "Coaches can end their links" ON public.coach_client_links
  FOR UPDATE TO authenticated
  USING (coach_id = (select auth.uid()) AND status = 'active')
  WITH CHECK (coach_id = (select auth.uid()));

-- 2. coach_messages ---------------------------------------------------------------------------
REVOKE UPDATE ON public.coach_messages FROM authenticated;
GRANT UPDATE (read_at) ON public.coach_messages TO authenticated;

-- 3. program_assignments ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Coaches and self manage assignments" ON public.program_assignments;
DROP POLICY IF EXISTS "Assignment participants read" ON public.program_assignments;
DROP POLICY IF EXISTS "Assigner inserts assignments" ON public.program_assignments;
DROP POLICY IF EXISTS "Assigner updates assignments" ON public.program_assignments;
DROP POLICY IF EXISTS "Assigner deletes assignments" ON public.program_assignments;

CREATE POLICY "Assignment participants read" ON public.program_assignments
  FOR SELECT TO authenticated
  USING (assigned_by = (select auth.uid()) OR client_id = (select auth.uid()));

CREATE POLICY "Assigner inserts assignments" ON public.program_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND (client_id = (select auth.uid()) OR public.is_coach_of(client_id))
  );

CREATE POLICY "Assigner updates assignments" ON public.program_assignments
  FOR UPDATE TO authenticated
  USING (assigned_by = (select auth.uid()))
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND (client_id = (select auth.uid()) OR public.is_coach_of(client_id))
  );

CREATE POLICY "Assigner deletes assignments" ON public.program_assignments
  FOR DELETE TO authenticated
  USING (assigned_by = (select auth.uid()));

-- 4. search_food_products ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.search_food_products(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_food_products(text, int) TO authenticated, service_role;

-- 5. invoke_coach_fleet_round -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_coach_fleet_round()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_req_id bigint;
BEGIN
  BEGIN
    SELECT ds.decrypted_secret
      INTO v_key
    FROM vault.decrypted_secrets ds
    WHERE ds.name = 'FLEET_CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'coach-fleet-round: no FLEET_CRON_SECRET in vault — nightly round NOT invoked';
  END IF;

  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION 'coach-fleet-round: pg_net missing — nightly round NOT invoked';
  END IF;

  SELECT net.http_post(
    url := 'https://phyuijjekxtjvipjtdfv.supabase.co/functions/v1/coach-fleet-round',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'X-Webhook-Key', v_key
    ),
    body := jsonb_build_object('trigger', 'cron')
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_coach_fleet_round() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_coach_fleet_round() TO postgres, service_role;

COMMENT ON FUNCTION public.invoke_coach_fleet_round() IS
  'Nightly pg_cron invoke of in-app coach-fleet-round. Auth via vault FLEET_CRON_SECRET only. Raises (job shows failed) when the secret or pg_net is missing.';
