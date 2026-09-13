-- Candidate, isolated replay only. Preserve a minimal record of each actual end.
CREATE TABLE IF NOT EXISTS public.coach_relationship_endings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 initiated_as text NOT NULL CHECK (initiated_as IN ('client','coach','system')),
 ended_at timestamptz NOT NULL DEFAULT now(),
 CHECK (coach_id <> client_id)
);
ALTER TABLE public.coach_relationship_endings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_relationship_endings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_relationship_endings TO authenticated;
GRANT ALL ON public.coach_relationship_endings TO service_role;
CREATE INDEX IF NOT EXISTS coach_relationship_endings_coach_idx ON public.coach_relationship_endings(coach_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS coach_relationship_endings_client_idx ON public.coach_relationship_endings(client_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS coach_relationship_endings_actor_idx ON public.coach_relationship_endings(initiated_by);
DROP POLICY IF EXISTS participants_read_relationship_endings ON public.coach_relationship_endings;
CREATE POLICY participants_read_relationship_endings ON public.coach_relationship_endings FOR SELECT TO authenticated
 USING (coach_id=(SELECT auth.uid()) OR client_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.record_coaching_departure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.coach_relationship_endings(coach_id,client_id,initiated_by,initiated_as)
 VALUES(OLD.coach_id,OLD.client_id,auth.uid(),CASE auth.uid()
  WHEN OLD.client_id THEN 'client' WHEN OLD.coach_id THEN 'coach' ELSE 'system' END);
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.record_coaching_departure() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS record_coaching_departure ON public.coach_client_links;
CREATE TRIGGER record_coaching_departure AFTER UPDATE OF status ON public.coach_client_links
 FOR EACH ROW WHEN (OLD.status='active' AND NEW.status='ended')
 EXECUTE FUNCTION public.record_coaching_departure();

-- Keep authorization valid until the intervention transaction commits.
-- FOR SHARE conflicts with the departure's FOR UPDATE, including after waiting.
CREATE OR REPLACE FUNCTION public.assert_client_target(p_client uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path=public AS $$
BEGIN
 IF p_client IS NULL THEN RETURN; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF p_client=auth.uid() THEN RETURN; END IF;
 PERFORM 1 FROM public.coach_client_links
  WHERE coach_id=auth.uid() AND client_id=p_client AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized for this client'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_client_target(uuid) FROM PUBLIC, anon, authenticated;

-- Cover direct and DEFINER assignment writes through the same relationship lock.
-- Paused archives and self-owned assignments retain their existing behavior.
CREATE OR REPLACE FUNCTION public.guard_active_coach_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='active' AND NEW.assigned_by<>NEW.client_id THEN
  PERFORM 1 FROM public.coach_client_links
   WHERE coach_id=NEW.assigned_by AND client_id=NEW.client_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coaching relationship is no longer active'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_active_coach_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_active_coach_assignment ON public.program_assignments;
CREATE TRIGGER guard_active_coach_assignment
 BEFORE INSERT OR UPDATE OF status,assigned_by,client_id ON public.program_assignments
 FOR EACH ROW EXECUTE FUNCTION public.guard_active_coach_assignment();
