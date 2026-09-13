-- Audit PR76-84. Candidate only: apply in isolated CI, not production.
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

  PERFORM 1 FROM public.user_roles WHERE user_id = p_client_id FOR UPDATE;

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


-- Version 1 retains its historical meaning. Old pending requests need a new request.
ALTER TABLE public.coach_join_requests DROP CONSTRAINT coach_join_requests_sharing_version_check;
ALTER TABLE public.coach_join_requests ADD CONSTRAINT coach_join_requests_sharing_version_check CHECK (sharing_version IN (1, 2));
ALTER TABLE public.coach_join_requests ALTER COLUMN sharing_version SET DEFAULT 2;
REVOKE EXECUTE ON FUNCTION public.accept_coach_invite(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_coaching(
  p_coach uuid,
  p_public_name text,
  p_summary text,
  p_sharing_version integer,
  p_request_key uuid
)
RETURNS public.coach_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_join_requests;
BEGIN
  IF v_uid IS NULL OR p_coach IS NULL OR p_coach = v_uid THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF p_sharing_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'consent_required';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'request_key_required';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = v_uid FOR UPDATE;
  SELECT * INTO v_result
  FROM public.coach_join_requests
  WHERE client_id = v_uid AND client_request_id = p_request_key;
  IF FOUND THEN
    IF v_result.coach_id <> p_coach THEN
      RAISE EXCEPTION 'request_key_conflict';
    END IF;
    RETURN v_result;
  END IF;
  SELECT * INTO v_result
  FROM public.coach_join_requests
  WHERE client_id = v_uid AND coach_id = p_coach AND status = 'pending';
  IF FOUND THEN
    RETURN v_result;
  END IF;
  PERFORM 1 FROM public.coach_profiles
    WHERE coach_id = p_coach AND published AND accepting_clients
    FOR SHARE;
  IF NOT FOUND OR NOT public.marketplace_coach_eligible(p_coach) THEN
    RAISE EXCEPTION 'coach_unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'already_coached';
  END IF;
  INSERT INTO public.coach_join_requests (
    coach_id, client_id, public_name, summary, sharing_version, client_request_id
  ) VALUES (
    p_coach, v_uid, btrim(p_public_name), btrim(p_summary), p_sharing_version, p_request_key
  )
  ON CONFLICT (coach_id, client_id) WHERE status = 'pending'
  DO UPDATE SET updated_at = public.coach_join_requests.updated_at
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.respond_coaching_request(p_request uuid, p_status text)
RETURNS public.coach_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_join_requests;
  v_scopes constant text[] := ARRAY[
    'checkins',
    'messages',
    'nutrition',
    'profile',
    'program',
    'progress_photos',
    'questionnaire',
    'workouts'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- Serialize every response for this client before locking any request row.
  SELECT * INTO v_result
  FROM public.coach_join_requests
  WHERE id = p_request AND v_uid IN (coach_id, client_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = v_result.client_id FOR UPDATE;
  SELECT * INTO v_result
  FROM public.coach_join_requests
  WHERE id = p_request AND v_uid IN (coach_id, client_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;
  IF NOT (
    (v_uid = v_result.client_id AND p_status = 'withdrawn')
    OR (v_uid = v_result.coach_id AND p_status IN ('accepted', 'declined'))
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  -- A replay is a historical receipt, never a new activation.
  IF v_result.status = p_status THEN
    RETURN v_result;
  END IF;
  IF v_result.status <> 'pending' THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  IF p_status = 'accepted' THEN
    IF v_result.sharing_version <> 2 THEN
      RAISE EXCEPTION 'consent_renewal_required';
    END IF;
    PERFORM 1 FROM public.coach_profiles
      WHERE coach_id = v_uid AND published AND accepting_clients
      FOR SHARE;
    IF NOT FOUND OR NOT public.marketplace_coach_eligible(v_uid) THEN
      RAISE EXCEPTION 'coach_unavailable';
    END IF;
    PERFORM public.activate_coaching_relationship(v_result.coach_id, v_result.client_id);
    INSERT INTO public.coaching_relationship_consents (
      coach_id, client_id, join_request_id, source, consent_version, scopes
    ) VALUES (
      v_result.coach_id,
      v_result.client_id,
      v_result.id,
      'directory_request',
      2,
      v_scopes
    )
    ON CONFLICT (join_request_id, client_id) WHERE join_request_id IS NOT NULL DO UPDATE SET
      consent_version = excluded.consent_version,
      scopes = excluded.scopes,
      accepted_at = now(),
      revoked_at = NULL;
    UPDATE public.coach_join_requests
    SET status = 'withdrawn', updated_at = clock_timestamp()
    WHERE client_id = v_result.client_id
      AND id <> p_request
      AND status = 'pending';
  END IF;
  UPDATE public.coach_join_requests
  SET status = p_status, updated_at = clock_timestamp()
  WHERE id = p_request
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_coaching_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_coaching_request(uuid, text) TO authenticated;


