-- P4.3: prospect messaging from a valid pending request, without dossier rights.
-- Limited consented snapshot is attached to the request. No questionnaire, no live dossier.

ALTER TABLE public.coach_messages
  DROP CONSTRAINT IF EXISTS coach_messages_template_key_check;
ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_template_key_check
  CHECK (template_key IN ('missed_training', 'missed_checkins', 'general_followup', 'reply', 'prospect'));

ALTER TABLE public.coach_join_requests
  ADD COLUMN IF NOT EXISTS prospect_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(prospect_snapshot) = 'object');

COMMENT ON COLUMN public.coach_join_requests.prospect_snapshot IS
  'Minimal explicitly consented prospect context: objective, level, discipline, language, expectations, availability, constraints, budget, summary. Not the questionnaire, private profile, or live athlete data.';

CREATE OR REPLACE FUNCTION public.marketplace_open_prospect(p_coach uuid, p_client uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) IN (p_coach, p_client)
    AND EXISTS (
      SELECT 1
      FROM public.coach_join_requests
      WHERE coach_id = p_coach
        AND client_id = p_client
        AND status IN ('pending', 'coach_accepted')
    );
$$;

REVOKE ALL ON FUNCTION public.marketplace_open_prospect(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_open_prospect(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.marketplace_open_prospect(uuid, uuid) IS
  'True when the caller is a party to a pending or coach_accepted join request. Does not grant is_coach_of.';

DROP POLICY IF EXISTS "Coach sends to own clients" ON public.coach_messages;
CREATE POLICY "Coach sends to own clients"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND coach_id = (SELECT auth.uid())
    AND (
      (
        public.is_coach_of(client_id)
        AND template_key IN ('missed_training', 'missed_checkins', 'general_followup', 'reply', 'prospect')
      )
      OR (
        public.marketplace_open_prospect((SELECT auth.uid()), client_id)
        AND template_key IN ('prospect', 'reply')
      )
    )
  );

DROP POLICY IF EXISTS "Client replies to own coach" ON public.coach_messages;
CREATE POLICY "Client replies to own coach"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND client_id = (SELECT auth.uid())
    AND template_key = 'reply'
    AND (
      public.is_client_of(coach_id)
      OR public.marketplace_open_prospect(coach_id, (SELECT auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.fetch_thread_messages(
  p_client_id uuid,
  p_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS SETOF public.coach_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Client required'; END IF;
  IF p_client_id <> v_uid
     AND NOT public.is_coach_of(p_client_id)
     AND NOT public.marketplace_open_prospect(v_uid, p_client_id)
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_messages m
      WHERE m.coach_id = v_uid AND m.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this thread';
    END IF;
  END IF;
  RETURN QUERY
    SELECT m.*
    FROM public.coach_messages m
    WHERE m.client_id = p_client_id
      AND (p_before IS NULL OR m.created_at < p_before)
      AND (m.client_id = v_uid OR m.coach_id = v_uid)
    ORDER BY m.created_at DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_thread_messages(uuid, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_thread_messages(uuid, timestamptz, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketplace_prospect_snapshot(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
  v_limit int;
BEGIN
  IF p_snapshot IS NULL OR p_snapshot = 'null'::jsonb THEN
    RETURN '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'invalid_snapshot';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_snapshot)
  LOOP
    IF v_key NOT IN (
      'objective', 'level', 'discipline', 'language', 'expectations',
      'availability', 'constraints', 'budget', 'summary'
    ) THEN
      RAISE EXCEPTION 'invalid_snapshot';
    END IF;
    IF jsonb_typeof(p_snapshot -> v_key) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid_snapshot';
    END IF;
    v_val := btrim(p_snapshot ->> v_key);
    v_limit := CASE v_key
      WHEN 'objective' THEN 200
      WHEN 'level' THEN 80
      WHEN 'discipline' THEN 80
      WHEN 'language' THEN 40
      WHEN 'expectations' THEN 500
      WHEN 'availability' THEN 300
      WHEN 'constraints' THEN 500
      WHEN 'budget' THEN 120
      WHEN 'summary' THEN 1500
      ELSE 0
    END;
    IF length(v_val) > v_limit THEN
      RAISE EXCEPTION 'invalid_snapshot';
    END IF;
    IF v_val <> '' THEN
      v_out := v_out || jsonb_build_object(v_key, v_val);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_prospect_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_prospect_snapshot(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.marketplace_prospect_snapshot(jsonb) IS
  'Normalizes the consented prospect snapshot. Rejects extra keys and non-text values.';

CREATE OR REPLACE FUNCTION public.request_coaching(
  p_coach uuid,
  p_public_name text,
  p_summary text,
  p_sharing_version integer,
  p_request_key uuid,
  p_snapshot jsonb
)
RETURNS public.coach_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_join_requests;
  v_snapshot jsonb := public.marketplace_prospect_snapshot(p_snapshot);
  v_summary text := btrim(coalesce(p_summary, ''));
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
  IF v_summary = '' THEN
    v_summary := coalesce(v_snapshot->>'summary', '');
  ELSIF NOT (v_snapshot ? 'summary') THEN
    v_snapshot := v_snapshot || jsonb_build_object('summary', v_summary);
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
    coach_id, client_id, public_name, summary, sharing_version, client_request_id, prospect_snapshot
  ) VALUES (
    p_coach, v_uid, btrim(p_public_name), v_summary, p_sharing_version, p_request_key, v_snapshot
  )
  ON CONFLICT (coach_id, client_id) WHERE status IN ('pending', 'coach_accepted')
  DO UPDATE SET updated_at = public.coach_join_requests.updated_at
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

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
BEGIN
  RETURN public.request_coaching(
    p_coach,
    p_public_name,
    p_summary,
    p_sharing_version,
    p_request_key,
    jsonb_build_object('summary', btrim(coalesce(p_summary, '')))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid, jsonb) IS
  'Athlete-initiated coaching request with a consented prospect snapshot. Not a payment.';
