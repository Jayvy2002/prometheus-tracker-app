-- M4b : l’acceptation d’une demande d’annuaire active le même lien que l’invitation.
-- Aucun paiement, aucun abonnement.

CREATE OR REPLACE FUNCTION public.activate_coaching_relationship(p_coach uuid, p_client uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing uuid;
BEGIN
  IF p_coach IS NULL OR p_client IS NULL OR p_coach = p_client THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  PERFORM 1 FROM public.user_roles WHERE user_id = p_client FOR UPDATE;

  SELECT coach_id INTO v_existing
  FROM public.coach_client_links
  WHERE client_id = p_client AND status = 'active'
  FOR UPDATE;
  IF v_existing IS NOT NULL AND v_existing <> p_coach THEN
    RAISE EXCEPTION 'already_coached';
  END IF;

  BEGIN
    INSERT INTO public.coach_client_links (coach_id, client_id, status)
    VALUES (p_coach, p_client, 'active')
    ON CONFLICT (coach_id, client_id) DO UPDATE
      SET status = 'active', updated_at = now();
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_coached';
  END;

  INSERT INTO public.user_roles (user_id, role, coaching_role)
  VALUES (p_client, 'free', 'client')
  ON CONFLICT (user_id) DO UPDATE
    SET coaching_role = CASE
      WHEN public.user_roles.coaching_role = 'coach' THEN 'coach'
      ELSE 'client'
    END,
    updated_at = now();

  INSERT INTO public.client_tracking_config (
    coach_id, client_id,
    track_weight, track_checkins, track_nutrition, track_workouts, workout_focus,
    training_vars, nutrition_vars, checkin_vars
  )
  SELECT
    p_coach,
    p_client,
    COALESCE((cs.default_tracking->>'track_weight')::boolean, true),
    COALESCE((cs.default_tracking->>'track_checkins')::boolean, true),
    COALESCE((cs.default_tracking->>'track_nutrition')::boolean, true),
    COALESCE((cs.default_tracking->>'track_workouts')::boolean, true),
    COALESCE(cs.default_tracking->>'workout_focus', ''),
    COALESCE(
      cs.default_tracking->'training_vars',
      cs.default_tracking->'training',
      '{"sets":true,"reps":true,"reps_range":true,"rir":true,"load":true,"rest":true}'::jsonb
    ),
    COALESCE(
      cs.default_tracking->'nutrition_vars',
      cs.default_tracking->'nutrition',
      '{"calories":true,"protein":true,"carbs":true,"fat":true,"water":true,"steps":true}'::jsonb
    ),
    COALESCE(
      cs.default_tracking->'checkin_vars',
      cs.default_tracking->'checkin',
      '{"sleep_hours":true,"sleep_quality":true,"energy":true,"mood":true,"motivation":true,"hunger":true,"fatigue":true,"stress":true,"soreness":true,"joint_pain":true,"notes":true}'::jsonb
    )
  FROM (SELECT 1) AS _
  LEFT JOIN public.coach_settings cs ON cs.coach_id = p_coach
  ON CONFLICT (coach_id, client_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.activate_coaching_relationship(uuid, uuid) IS
  'Internal link activation shared with directory accept. Not granted to authenticated or anon.';

REVOKE ALL ON FUNCTION public.activate_coaching_relationship(uuid, uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.coaching_relationship_consents
  DROP CONSTRAINT coaching_relationship_consents_source_check;
ALTER TABLE public.coaching_relationship_consents
  ADD CONSTRAINT coaching_relationship_consents_source_check
  CHECK (source IN ('direct_invite', 'directory_request'));

ALTER TABLE public.coaching_relationship_consents
  ADD COLUMN IF NOT EXISTS join_request_id uuid REFERENCES public.coach_join_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coaching_consents_join_request
  ON public.coaching_relationship_consents (join_request_id, client_id)
  WHERE join_request_id IS NOT NULL;

COMMENT ON TABLE public.coaching_relationship_consents IS
  'Client consent for a direct invite or a directory request. Inserts only via the matching accept RPC.';

COMMENT ON TABLE public.coach_join_requests IS
  'Directory requests. accepted activates coach_client_links through activate_coaching_relationship. Not a paid subscription.';

DROP INDEX IF EXISTS public.coach_join_requests_open_pair;
CREATE UNIQUE INDEX IF NOT EXISTS coach_join_requests_open_pair
  ON public.coach_join_requests (coach_id, client_id)
  WHERE status = 'pending';

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
  IF p_sharing_version IS DISTINCT FROM 1 THEN
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
  IF v_result.status = p_status THEN
    IF p_status = 'accepted' THEN
      PERFORM public.activate_coaching_relationship(v_result.coach_id, v_result.client_id);
      INSERT INTO public.coaching_relationship_consents (
        coach_id, client_id, join_request_id, source, consent_version, scopes
      ) VALUES (
        v_result.coach_id,
        v_result.client_id,
        v_result.id,
        'directory_request',
        1,
        v_scopes
      )
      ON CONFLICT (join_request_id, client_id) WHERE join_request_id IS NOT NULL DO UPDATE SET
        consent_version = excluded.consent_version,
        scopes = excluded.scopes,
        accepted_at = now(),
        revoked_at = NULL;
    END IF;
    RETURN v_result;
  END IF;
  IF v_result.status <> 'pending' THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  IF p_status = 'accepted' THEN
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
      1,
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

COMMENT ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) IS
  'Creates a directory request. sharing_version 1 is the full coaching consent set if the coach accepts.';
COMMENT ON FUNCTION public.respond_coaching_request(uuid, text) IS
  'Coach accept activates the coaching link via activate_coaching_relationship. No subscription, no payment.';
