-- M2a : départ autonome du client, même transition que le coach.
-- Git suit l’horloge de production après apply. Ne pas rejouer.

-- Notice minimale pour l’ancien coach. Aucun accès au dossier de l’athlète.
CREATE TABLE IF NOT EXISTS public.coach_relationship_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name text NOT NULL DEFAULT '',
  ended_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT coach_relationship_notice_distinct CHECK (coach_id <> client_id)
);

COMMENT ON TABLE public.coach_relationship_notices IS
  'Private receipt for the former coach when the athlete ends the relationship. No dossier access.';

ALTER TABLE public.coach_relationship_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_relationship_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_relationship_notices TO authenticated;
GRANT ALL ON public.coach_relationship_notices TO service_role;

DROP POLICY IF EXISTS coach_reads_relationship_notices ON public.coach_relationship_notices;
CREATE POLICY coach_reads_relationship_notices ON public.coach_relationship_notices
  FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS coach_relationship_notices_unread_idx
  ON public.coach_relationship_notices (coach_id, ended_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS coach_relationship_notices_coach_idx
  ON public.coach_relationship_notices (coach_id);
CREATE INDEX IF NOT EXISTS coach_relationship_notices_client_idx
  ON public.coach_relationship_notices (client_id);

CREATE OR REPLACE FUNCTION public.dismiss_coach_relationship_notice(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  UPDATE public.coach_relationship_notices
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_id AND coach_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_coach_relationship_notice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_coach_relationship_notice(uuid) TO authenticated;

-- Historique minimal de chaque fin réelle (auteur + rôle).
CREATE TABLE IF NOT EXISTS public.coach_relationship_endings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  initiated_as text NOT NULL CHECK (initiated_as IN ('client', 'coach', 'system')),
  ended_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coach_id <> client_id)
);

COMMENT ON TABLE public.coach_relationship_endings IS
  'Who ended which coaching link. Participants may read it; nobody forges rows.';

ALTER TABLE public.coach_relationship_endings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_relationship_endings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_relationship_endings TO authenticated;
GRANT ALL ON public.coach_relationship_endings TO service_role;

CREATE INDEX IF NOT EXISTS coach_relationship_endings_coach_idx
  ON public.coach_relationship_endings (coach_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS coach_relationship_endings_client_idx
  ON public.coach_relationship_endings (client_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS coach_relationship_endings_actor_idx
  ON public.coach_relationship_endings (initiated_by);

DROP POLICY IF EXISTS participants_read_relationship_endings ON public.coach_relationship_endings;
CREATE POLICY participants_read_relationship_endings ON public.coach_relationship_endings
  FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()) OR client_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.record_coaching_departure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.coach_relationship_endings (coach_id, client_id, initiated_by, initiated_as)
  VALUES (
    OLD.coach_id,
    OLD.client_id,
    auth.uid(),
    CASE auth.uid()
      WHEN OLD.client_id THEN 'client'
      WHEN OLD.coach_id THEN 'coach'
      ELSE 'system'
    END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coaching_departure() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS record_coaching_departure ON public.coach_client_links;
CREATE TRIGGER record_coaching_departure
  AFTER UPDATE OF status ON public.coach_client_links
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status = 'ended')
  EXECUTE FUNCTION public.record_coaching_departure();

COMMENT ON COLUMN public.user_profiles.coach_link_ended_at IS
  'Last time the coaching link ended (client or coach). Drives the solo-home notice. Visual ack is localStorage only.';

-- Les deux initiateurs passent par la même transition. Le lien actif est verrouillé avant les écritures.
CREATE OR REPLACE FUNCTION public.transition_client_to_solo(p_coach_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_coach_id IS NULL OR p_client_id IS NULL OR p_coach_id = p_client_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pair');
  END IF;

  PERFORM 1
  FROM public.coach_client_links
  WHERE coach_id = p_coach_id
    AND client_id = p_client_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  UPDATE public.program_assignments
  SET status = 'paused', updated_at = now()
  WHERE client_id = p_client_id
    AND assigned_by = p_coach_id
    AND status = 'active';

  UPDATE public.coach_client_links
  SET status = 'ended', updated_at = now()
  WHERE coach_id = p_coach_id
    AND client_id = p_client_id
    AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  UPDATE public.user_roles
  SET coaching_role = 'none', updated_at = now()
  WHERE user_id = p_client_id
    AND coaching_role = 'client';

  DELETE FROM public.client_tracking_config
  WHERE client_id = p_client_id
    AND coach_id = p_coach_id;

  UPDATE public.user_profiles
  SET coach_link_ended_at = now(),
      solo_trial_ends_at = COALESCE(solo_trial_ends_at, now() + interval '30 days'),
      updated_at = now()
  WHERE id = p_client_id;

  IF auth.uid() = p_client_id THEN
    INSERT INTO public.coach_relationship_notices (coach_id, client_id, client_name)
    SELECT p_coach_id, p_client_id, COALESCE(
      (SELECT full_name FROM public.user_profiles WHERE id = p_client_id),
      ''
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_client_to_solo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_client_to_solo(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.end_coach_client_link(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_client_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_end_self');
  END IF;
  RETURN public.transition_client_to_solo(v_uid, p_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.end_coach_client_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_coach_client_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_end_coach_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_coach_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT coach_id INTO v_coach_id
  FROM public.coach_client_links
  WHERE client_id = v_uid
    AND status = 'active';

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  v_result := public.transition_client_to_solo(v_coach_id, v_uid);
  IF v_result->>'ok' = 'true' THEN
    RETURN v_result || jsonb_build_object(
      'former_coach_id', v_coach_id,
      'ended_at', (SELECT coach_link_ended_at FROM public.user_profiles WHERE id = v_uid)
    );
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.client_end_coach_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_end_coach_link() TO authenticated;

-- FOR SHARE entre en conflit avec le FOR UPDATE du départ (y compris après attente).
CREATE OR REPLACE FUNCTION public.assert_client_target(p_client uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  IF p_client IS NULL THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_client = auth.uid() THEN
    RETURN;
  END IF;
  PERFORM 1
  FROM public.coach_client_links
  WHERE coach_id = auth.uid()
    AND client_id = p_client
    AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized for this client';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_client_target(uuid) FROM PUBLIC, anon, authenticated;

-- Les écritures d’attribution (directes et DEFINER) passent par le même verrou de relation.
CREATE OR REPLACE FUNCTION public.guard_active_coach_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.assigned_by <> NEW.client_id THEN
    PERFORM 1
    FROM public.coach_client_links
    WHERE coach_id = NEW.assigned_by
      AND client_id = NEW.client_id
      AND status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Coaching relationship is no longer active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_active_coach_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_active_coach_assignment ON public.program_assignments;
CREATE TRIGGER guard_active_coach_assignment
  BEFORE INSERT OR UPDATE OF status, assigned_by, client_id ON public.program_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_active_coach_assignment();

-- Le dossier coach se ferme dès que le lien passe à ended (filtre Realtime + RLS).
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.coach_client_links REPLICA IDENTITY FULL';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'replica identity full failed for coach_client_links: %', SQLERRM;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'coach_client_links'
  ) THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_client_links';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'realtime add failed for coach_client_links: %', SQLERRM;
    END;
  END IF;
END;
$$;
