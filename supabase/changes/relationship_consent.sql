-- Candidate, isolated replay only. Promote with the Supabase CLI after validation.
CREATE TABLE IF NOT EXISTS public.coaching_relationship_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_id uuid REFERENCES public.coach_invites(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source = 'direct_invite'),
  consent_version integer NOT NULL CHECK (consent_version > 0),
  scopes text[] NOT NULL CHECK (
    cardinality(scopes) > 0
    AND scopes <@ ARRAY['checkins','messages','nutrition','profile','program','progress_photos','questionnaire','workouts']::text[]
  ),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (coach_id <> client_id),
  UNIQUE(invite_id, client_id)
);
ALTER TABLE public.coaching_relationship_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coaching_relationship_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coaching_relationship_consents TO authenticated;
GRANT ALL ON public.coaching_relationship_consents TO service_role;
CREATE INDEX IF NOT EXISTS coaching_consents_coach_idx ON public.coaching_relationship_consents(coach_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS coaching_consents_client_idx ON public.coaching_relationship_consents(client_id, accepted_at DESC);
DROP POLICY IF EXISTS participants_read_relationship_consents ON public.coaching_relationship_consents;
CREATE POLICY participants_read_relationship_consents ON public.coaching_relationship_consents
  FOR SELECT TO authenticated USING (coach_id=(SELECT auth.uid()) OR client_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.accept_coach_invite(
  p_token text,
  p_consent_version integer,
  p_scopes text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_expected constant text[] := ARRAY['checkins','messages','nutrition','profile','program','progress_photos','questionnaire','workouts'];
  v_normalized text[];
  v_result jsonb;
  v_invite public.coach_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF p_consent_version <> 1 THEN RETURN jsonb_build_object('ok',false,'error','consent_version_required'); END IF;
  SELECT array_agg(DISTINCT scope ORDER BY scope) INTO v_normalized FROM unnest(p_scopes) AS item(scope);
  IF v_normalized IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_consent_scope');
  END IF;
  v_result := public.accept_coach_invite(p_token);
  IF COALESCE((v_result->>'ok')::boolean,false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT * INTO STRICT v_invite FROM public.coach_invites WHERE token=p_token;
  INSERT INTO public.coaching_relationship_consents(
    coach_id,client_id,invite_id,source,consent_version,scopes
  ) VALUES(
    v_invite.coach_id,auth.uid(),v_invite.id,'direct_invite',p_consent_version,v_normalized
  ) ON CONFLICT(invite_id,client_id) DO UPDATE SET
    consent_version=excluded.consent_version,
    scopes=excluded.scopes,
    accepted_at=now(),
    revoked_at=NULL;
  RETURN v_result || jsonb_build_object('consent_version',p_consent_version);
END; $$;
REVOKE ALL ON FUNCTION public.accept_coach_invite(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_coach_invite(text,integer,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_coach_invite(text,integer,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_relationship_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.coaching_relationship_consents SET revoked_at=COALESCE(revoked_at,now())
    WHERE coach_id=OLD.coach_id AND client_id=OLD.client_id AND revoked_at IS NULL;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.revoke_relationship_consent() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS revoke_relationship_consent ON public.coach_client_links;
CREATE TRIGGER revoke_relationship_consent AFTER UPDATE OF status ON public.coach_client_links
  FOR EACH ROW WHEN (OLD.status='active' AND NEW.status='ended')
  EXECUTE FUNCTION public.revoke_relationship_consent();
