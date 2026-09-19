-- Hotfix A — coach_client_links identity is immutable; status transitions are RPC-only.
--
-- Production (phyuijjekxtjvipjtdfv, 2026-09-19):
--   UPDATE policy "Coaches can end their links"
--     USING  (coach_id = auth.uid() AND status = 'active')
--     WITH CHECK (coach_id = auth.uid())
--   authenticated column UPDATE: status, updated_at, last_visited_at, last_nudged_at
--   authenticated table INSERT/DELETE/TRUNCATE still granted (no INSERT/DELETE policies)
--   anon still had table ALL
--
-- Column grants already blocked SET client_id / coach_id for authenticated.
-- The policy did not freeze identity, so restoring a table-level UPDATE grant would
-- let an active Coach retarget client_id and become is_coach_of(victim).
-- authenticated could also SET status = 'ended' and skip end_coach_client_link /
-- client_end_coach_link (solo transition, program pause, commercial trial).
--
-- Defense in depth:
--   1. trigger: id / coach_id / client_id never change, including for table owner
--   2. WITH CHECK keeps status = 'active' (bookkeeping cannot flip or resurrect)
--   3. REVOKE status UPDATE; REVOKE INSERT/DELETE/TRUNCATE from authenticated
--   4. REVOKE ALL from anon
-- Bookkeeping last_visited_at / last_nudged_at stays a column UPDATE for the
-- active Coach. Creation, ending, and reactivation stay SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.protect_coach_client_link_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'coach_client_link_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_coach_client_link_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_coach_client_link_identity ON public.coach_client_links;
CREATE TRIGGER protect_coach_client_link_identity
  BEFORE UPDATE ON public.coach_client_links
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_coach_client_link_identity();

COMMENT ON FUNCTION public.protect_coach_client_link_identity() IS
  'Hotfix A: coach_id, client_id and id of a coaching link never change. Status transitions go through SECURITY DEFINER RPCs.';

REVOKE ALL ON TABLE public.coach_client_links FROM PUBLIC, anon;
REVOKE INSERT, DELETE, TRUNCATE, UPDATE ON TABLE public.coach_client_links FROM authenticated;
GRANT SELECT ON TABLE public.coach_client_links TO authenticated;
GRANT UPDATE (last_visited_at, last_nudged_at, updated_at)
  ON TABLE public.coach_client_links TO authenticated;

DROP POLICY IF EXISTS "Coaches can end their links" ON public.coach_client_links;
DROP POLICY IF EXISTS "Coaches update active link bookkeeping" ON public.coach_client_links;
CREATE POLICY "Coaches update active link bookkeeping" ON public.coach_client_links
  FOR UPDATE TO authenticated
  USING (coach_id = (select auth.uid()) AND status = 'active')
  WITH CHECK (coach_id = (select auth.uid()) AND status = 'active');
