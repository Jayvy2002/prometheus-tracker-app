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

DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'coach_join_requests'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%sharing_version%'
  LOOP
    EXECUTE format('ALTER TABLE public.coach_join_requests DROP CONSTRAINT %I', v_name);
  END LOOP;
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'coach_messages'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%char_length(trim(body))%'
  LOOP
    EXECUTE format('ALTER TABLE public.coach_messages DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.coach_join_requests
  ADD CONSTRAINT coach_join_requests_sharing_version_check
  CHECK (sharing_version IN (1, 2, 3));

ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_body_length_check
  CHECK (char_length(trim(body)) BETWEEN 1 AND 2000);

CREATE OR REPLACE FUNCTION public.marketplace_open_prospect(p_coach uuid, p_client uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) IN (p_coach, p_client)
    AND public.coach_relationship_is_open(p_coach)
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
  'True when the caller is a party to a pending or coach_accepted join request and the Coach lifecycle is still open. Fail-closed after coach_account_closures. Does not grant is_coach_of.';

CREATE OR REPLACE FUNCTION public.withdraw_open_prospects_on_coach_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.coach_join_requests
     SET status = 'withdrawn',
         updated_at = clock_timestamp()
   WHERE coach_id = NEW.coach_id
     AND status IN ('pending', 'coach_accepted');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_open_prospects_on_coach_closure() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.withdraw_open_prospects_on_coach_closure() IS
  'Internal. When a Coach is stamped in coach_account_closures, pending and coach_accepted requests become withdrawn in the same transaction. Does not touch active P3 links.';

DROP TRIGGER IF EXISTS withdraw_open_prospects_on_coach_closure ON public.coach_account_closures;
CREATE TRIGGER withdraw_open_prospects_on_coach_closure
  AFTER INSERT ON public.coach_account_closures
  FOR EACH ROW
  EXECUTE FUNCTION public.withdraw_open_prospects_on_coach_closure();

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
        AND workout_id IS NULL
        AND checkin_id IS NULL
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
      OR (
        public.marketplace_open_prospect(coach_id, (SELECT auth.uid()))
        AND workout_id IS NULL
        AND checkin_id IS NULL
      )
    )
  );

CREATE OR REPLACE FUNCTION public.coach_message_prospect_no_dossier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (NEW.workout_id IS NOT NULL OR NEW.checkin_id IS NOT NULL)
     AND public.marketplace_open_prospect(NEW.coach_id, NEW.client_id)
     AND NOT public.is_coach_of(NEW.client_id)
  THEN
    RAISE EXCEPTION 'prospect_no_dossier';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_message_prospect_no_dossier() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_message_prospect_no_dossier ON public.coach_messages;
CREATE TRIGGER coach_message_prospect_no_dossier
  BEFORE INSERT OR UPDATE ON public.coach_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.coach_message_prospect_no_dossier();

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
  v_snapshot jsonb := '{}'::jsonb;
  v_summary text := btrim(coalesce(p_summary, ''));
BEGIN
  IF v_uid IS NULL OR p_coach IS NULL OR p_coach = v_uid THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF p_sharing_version IS DISTINCT FROM 2 AND p_sharing_version IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'consent_required';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'request_key_required';
  END IF;
  IF p_sharing_version = 3 THEN
    v_snapshot := public.marketplace_prospect_snapshot(p_snapshot);
    IF v_summary = '' THEN
      v_summary := coalesce(v_snapshot->>'summary', '');
    ELSIF NOT (v_snapshot ? 'summary') THEN
      v_snapshot := v_snapshot || jsonb_build_object('summary', v_summary);
    END IF;
  ELSE
    IF v_summary = '' AND p_snapshot IS NOT NULL AND jsonb_typeof(p_snapshot) = 'object' THEN
      v_summary := btrim(coalesce(p_snapshot->>'summary', ''));
    END IF;
    v_snapshot := CASE
      WHEN v_summary <> '' THEN jsonb_build_object('summary', v_summary)
      ELSE '{}'::jsonb
    END;
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
  'Athlete-initiated coaching request. sharing_version 3 is the limited prospect snapshot disclosure. Version 2 remains the historical name+summary contract.';

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

  IF p_status = 'confirmed' THEN
    IF v_uid <> v_result.client_id THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    PERFORM public.lock_coach_relationship_lifecycle(v_result.coach_id);
    PERFORM 1 FROM public.user_roles WHERE user_id = v_result.client_id FOR UPDATE;
    SELECT * INTO v_result
    FROM public.coach_join_requests
    WHERE id = p_request AND v_uid IN (coach_id, client_id)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'request_not_found';
    END IF;
    IF v_uid <> v_result.client_id THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF v_result.status = 'athlete_confirmed' THEN
      RETURN v_result;
    END IF;
    IF v_result.status = 'accepted' THEN
      RAISE EXCEPTION 'request_closed';
    END IF;
    IF v_result.status <> 'coach_accepted' THEN
      RAISE EXCEPTION 'request_closed';
    END IF;
    IF v_result.sharing_version IS DISTINCT FROM 2 AND v_result.sharing_version IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'consent_renewal_required';
    END IF;
    IF NOT public.coach_relationship_is_open(v_result.coach_id) THEN
      RAISE EXCEPTION 'coach_unavailable';
    END IF;
    PERFORM 1 FROM public.coach_profiles
      WHERE coach_id = v_result.coach_id AND published AND accepting_clients
      FOR SHARE;
    IF NOT FOUND OR NOT public.marketplace_coach_eligible(v_result.coach_id) THEN
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
      AND status IN ('pending', 'coach_accepted');
    UPDATE public.coach_join_requests
    SET status = 'athlete_confirmed', updated_at = clock_timestamp()
    WHERE id = p_request
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

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
    ELSE p_status
  END;

  IF NOT (
    (v_uid = v_result.client_id AND p_status = 'withdrawn')
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
    IF v_result.sharing_version IS DISTINCT FROM 2 AND v_result.sharing_version IS DISTINCT FROM 3 THEN
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

  RAISE EXCEPTION 'not_authorized';
END;
$$;

REVOKE ALL ON FUNCTION public.respond_coaching_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_coaching_request(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.respond_coaching_request(uuid, text) IS
  'Coach accepted continues a prospect (stored as coach_accepted). Historical accepted stays accepted and cannot replay. Athlete confirmed takes the Coach lifecycle mutex, then user_roles(client) FOR UPDATE, then the request row FOR UPDATE, revalidates, then activates. sharing_version 2 (historical name+summary) and 3 (limited prospect snapshot) may complete. Relationship consent_version stays 2. Not a payment.';
