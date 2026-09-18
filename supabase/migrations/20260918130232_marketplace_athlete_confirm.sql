-- P1.4: Coach accept continues a marketplace request; only the athlete's
-- confirmation activates coach_client_links. No payment, no subscription.

ALTER TABLE public.coach_join_requests
  DROP CONSTRAINT IF EXISTS coach_join_requests_status_check;

ALTER TABLE public.coach_join_requests
  ADD CONSTRAINT coach_join_requests_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'coach_accepted',
    'athlete_confirmed',
    'declined',
    'withdrawn'
  ));

DROP INDEX IF EXISTS public.coach_join_requests_open_pair;
CREATE UNIQUE INDEX coach_join_requests_open_pair
  ON public.coach_join_requests (coach_id, client_id)
  WHERE status IN ('pending', 'coach_accepted');

COMMENT ON TABLE public.coach_join_requests IS
  'Directory requests. accepted is a historical terminal status from coach-only activation; new writes never produce it. coach_accepted is a prospect. athlete_confirmed is the athlete confirmation. Not a paid subscription.';

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
  WHERE client_id = v_uid
    AND coach_id = p_coach
    AND status IN ('pending', 'coach_accepted');
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
  ON CONFLICT (coach_id, client_id) WHERE status IN ('pending', 'coach_accepted')
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
  v_target text;
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

  v_target := CASE p_status
    WHEN 'accepted' THEN 'coach_accepted'
    WHEN 'confirmed' THEN 'athlete_confirmed'
    ELSE p_status
  END;

  IF NOT (
    (v_uid = v_result.client_id AND p_status IN ('withdrawn', 'confirmed'))
    OR (v_uid = v_result.coach_id AND p_status IN ('accepted', 'declined'))
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_result.status = v_target THEN
    RETURN v_result;
  END IF;

  IF v_result.status = 'accepted' THEN
    RAISE EXCEPTION 'request_closed';
  END IF;

  IF p_status = 'accepted' THEN
    IF v_result.status <> 'pending' THEN
      RAISE EXCEPTION 'request_closed';
    END IF;
    IF v_result.sharing_version <> 2 THEN
      RAISE EXCEPTION 'consent_renewal_required';
    END IF;
    PERFORM 1 FROM public.coach_profiles
      WHERE coach_id = v_uid AND published AND accepting_clients
      FOR SHARE;
    IF NOT FOUND OR NOT public.marketplace_coach_eligible(v_uid) THEN
      RAISE EXCEPTION 'coach_unavailable';
    END IF;
    UPDATE public.coach_join_requests
    SET status = 'coach_accepted', updated_at = clock_timestamp()
    WHERE id = p_request
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF p_status = 'declined' THEN
    IF v_result.status <> 'pending' THEN
      RAISE EXCEPTION 'request_closed';
    END IF;
    UPDATE public.coach_join_requests
    SET status = 'declined', updated_at = clock_timestamp()
    WHERE id = p_request
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF p_status = 'withdrawn' THEN
    IF v_result.status NOT IN ('pending', 'coach_accepted') THEN
      RAISE EXCEPTION 'request_closed';
    END IF;
    UPDATE public.coach_join_requests
    SET status = 'withdrawn', updated_at = clock_timestamp()
    WHERE id = p_request
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF p_status = 'confirmed' THEN
    IF v_result.status <> 'coach_accepted' THEN
      RAISE EXCEPTION 'request_closed';
    END IF;
    IF v_result.sharing_version <> 2 THEN
      RAISE EXCEPTION 'consent_renewal_required';
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
      AND status IN ('pending', 'coach_accepted');
    UPDATE public.coach_join_requests
    SET status = 'athlete_confirmed', updated_at = clock_timestamp()
    WHERE id = p_request
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  RAISE EXCEPTION 'not_authorized';
END;
$$;

REVOKE ALL ON FUNCTION public.respond_coaching_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_coaching_request(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) IS
  'Creates a directory request. sharing_version 2 is the request-time disclosure; activation still requires athlete confirmation.';
COMMENT ON FUNCTION public.respond_coaching_request(uuid, text) IS
  'Coach accepted continues a prospect (stored as coach_accepted). Historical accepted stays accepted and cannot replay. Athlete confirmed activates the coaching link. No subscription, no payment.';
COMMENT ON FUNCTION public.activate_coaching_relationship(uuid, uuid) IS
  'Internal link activation. Marketplace uses it only after athlete confirmation. Not granted to authenticated or anon.';

REVOKE ALL ON FUNCTION public.activate_coaching_relationship(uuid, uuid) FROM PUBLIC, anon, authenticated;
