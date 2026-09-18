-- P2 integrity: atomic signal upsert, review/signal athlete match, bounded JSON,
-- latest decision per (athlete, domain, type), Solo composite journal write, outbox.
-- Candidate only: apply in isolated CI, not production.
-- Does not auto-apply programs or targets. P1.5 COALESCE lifetime trial is unchanged.

CREATE OR REPLACE FUNCTION public.prometheus_json_forbids_raw(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_val jsonb;
BEGIN
  IF p IS NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p) = 'object' THEN
    IF p ? 'nutrition_logs' OR p ? 'workouts' OR p ? 'checkins' OR p ? 'weights' THEN
      RETURN true;
    END IF;
    FOR v_val IN SELECT value FROM jsonb_each(p)
    LOOP
      IF public.prometheus_json_forbids_raw(v_val) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p) = 'array' THEN
    FOR v_val IN SELECT value FROM jsonb_array_elements(p)
    LOOP
      IF public.prometheus_json_forbids_raw(v_val) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_json_object_keys_allowed(p jsonb, p_allowed text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p)
  LOOP
    IF NOT v_key = ANY (p_allowed) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_evidence_array_ok(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_val jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p) > 30 THEN
    RETURN false;
  END IF;
  FOR v_val IN SELECT value FROM jsonb_array_elements(p)
  LOOP
    IF jsonb_typeof(v_val) <> 'object' THEN
      RETURN false;
    END IF;
    IF NOT public.prometheus_json_object_keys_allowed(v_val, ARRAY['kind', 'summary', 'at']) THEN
      RETURN false;
    END IF;
    IF COALESCE(v_val->>'kind', '') = '' OR char_length(v_val->>'kind') > 80 THEN
      RETURN false;
    END IF;
    IF COALESCE(v_val->>'summary', '') = '' OR char_length(v_val->>'summary') > 500 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.prometheus_json_forbids_raw(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_json_object_keys_allowed(jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_evidence_array_ok(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prometheus_json_forbids_raw(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.prometheus_json_object_keys_allowed(jsonb, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.prometheus_evidence_array_ok(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_athlete_signal(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_hypothesis text,
  p_evidence_for jsonb DEFAULT '[]'::jsonb,
  p_evidence_against jsonb DEFAULT '[]'::jsonb,
  p_confidence text DEFAULT 'low',
  p_status text DEFAULT 'open',
  p_next_review_at timestamptz DEFAULT NULL
)
RETURNS public.athlete_signals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.athlete_signals;
BEGIN
  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_required';
  END IF;
  IF p_domain IS NULL OR p_domain NOT IN (
    'training', 'nutrition', 'recovery', 'weight', 'goal', 'adherence'
  ) THEN
    RAISE EXCEPTION 'invalid_domain';
  END IF;
  IF p_type IS NULL OR char_length(trim(p_type)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;
  IF p_hypothesis IS NULL OR char_length(trim(p_hypothesis)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_hypothesis';
  END IF;
  IF NOT public.prometheus_evidence_array_ok(p_evidence_for)
     OR NOT public.prometheus_evidence_array_ok(p_evidence_against) THEN
    RAISE EXCEPTION 'invalid_evidence';
  END IF;
  IF public.prometheus_json_forbids_raw(p_evidence_for)
     OR public.prometheus_json_forbids_raw(p_evidence_against) THEN
    RAISE EXCEPTION 'raw_logs_forbidden';
  END IF;
  IF p_confidence IS NULL OR p_confidence NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'invalid_confidence';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('open', 'waiting') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  INSERT INTO public.athlete_signals (
    athlete_id, domain, type, hypothesis,
    evidence_for, evidence_against, confidence, status,
    first_seen_at, last_seen_at, next_review_at
  )
  VALUES (
    p_athlete_id, p_domain, trim(p_type), trim(p_hypothesis),
    p_evidence_for, p_evidence_against, p_confidence, p_status,
    clock_timestamp(), clock_timestamp(), p_next_review_at
  )
  ON CONFLICT (athlete_id, domain, type) WHERE status IN ('open', 'waiting')
  DO UPDATE SET
    hypothesis = EXCLUDED.hypothesis,
    evidence_for = EXCLUDED.evidence_for,
    evidence_against = EXCLUDED.evidence_against,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    last_seen_at = clock_timestamp(),
    next_review_at = EXCLUDED.next_review_at,
    updated_at = clock_timestamp()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_athlete_weekly_review(
  p_athlete_id uuid,
  p_week_start date,
  p_data_quality text,
  p_decision text,
  p_summary text,
  p_aggregates jsonb DEFAULT '{}'::jsonb,
  p_tracking jsonb DEFAULT '{}'::jsonb,
  p_signal_actions jsonb DEFAULT '[]'::jsonb
)
RETURNS public.athlete_weekly_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_authority text;
  v_row public.athlete_weekly_reviews;
  v_action jsonb;
  v_monday date;
  v_signal public.athlete_signals;
BEGIN
  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_required';
  END IF;
  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'week_required';
  END IF;
  v_monday := date_trunc('week', p_week_start::timestamp)::date;
  IF p_week_start IS DISTINCT FROM v_monday THEN
    RAISE EXCEPTION 'invalid_week_start';
  END IF;
  IF p_data_quality IS NULL OR p_data_quality NOT IN ('insufficient', 'sparse', 'adequate') THEN
    RAISE EXCEPTION 'invalid_data_quality';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('wait', 'request_info', 'propose', 'close') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_summary IS NULL OR char_length(trim(p_summary)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_summary';
  END IF;
  IF p_aggregates IS NULL OR jsonb_typeof(p_aggregates) <> 'object'
     OR octet_length(p_aggregates::text) > 16384 THEN
    RAISE EXCEPTION 'invalid_aggregates';
  END IF;
  IF public.prometheus_json_forbids_raw(p_aggregates) THEN
    RAISE EXCEPTION 'raw_logs_forbidden';
  END IF;
  IF NOT public.prometheus_json_object_keys_allowed(p_aggregates, ARRAY[
    'window_start', 'window_end', 'logged_nutrition_days', 'avg_calories', 'calorie_target',
    'workout_count', 'expected_workouts', 'weigh_ins', 'weight_delta_kg', 'weight_start_kg',
    'weight_span_days', 'checkin_count', 'avg_fatigue', 'avg_energy', 'goal'
  ]) THEN
    RAISE EXCEPTION 'invalid_aggregates';
  END IF;
  IF p_tracking IS NULL OR jsonb_typeof(p_tracking) <> 'object'
     OR NOT public.prometheus_json_object_keys_allowed(p_tracking, ARRAY[
       'nutrition', 'workouts', 'weight', 'checkins'
     ]) THEN
    RAISE EXCEPTION 'invalid_tracking';
  END IF;
  IF p_signal_actions IS NULL OR jsonb_typeof(p_signal_actions) <> 'array'
     OR jsonb_array_length(p_signal_actions) > 40
     OR octet_length(p_signal_actions::text) > 32768 THEN
    RAISE EXCEPTION 'invalid_signal_actions';
  END IF;
  IF public.prometheus_json_forbids_raw(p_signal_actions) THEN
    RAISE EXCEPTION 'raw_logs_forbidden';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = p_athlete_id AND status = 'active'
  ) THEN
    v_authority := 'coach';
  ELSE
    v_authority := 'athlete';
  END IF;

  FOR v_action IN SELECT value FROM jsonb_array_elements(p_signal_actions)
  LOOP
    IF jsonb_typeof(v_action) <> 'object' THEN
      RAISE EXCEPTION 'invalid_signal_action';
    END IF;
    IF v_action->>'op' = 'upsert' THEN
      PERFORM public.upsert_athlete_signal(
        p_athlete_id,
        v_action->>'domain',
        v_action->>'type',
        v_action->>'hypothesis',
        COALESCE(v_action->'evidence_for', '[]'::jsonb),
        COALESCE(v_action->'evidence_against', '[]'::jsonb),
        COALESCE(v_action->>'confidence', 'low'),
        COALESCE(v_action->>'status', 'open'),
        CASE
          WHEN v_action ? 'next_review_at' AND v_action->>'next_review_at' IS NOT NULL
            THEN (v_action->>'next_review_at')::timestamptz
          ELSE NULL
        END
      );
    ELSIF v_action->>'op' = 'resolve' THEN
      SELECT * INTO v_signal
      FROM public.athlete_signals
      WHERE id = (v_action->>'id')::uuid
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
      END IF;
      IF v_signal.athlete_id IS DISTINCT FROM p_athlete_id THEN
        RAISE EXCEPTION 'signal_athlete_mismatch';
      END IF;
      PERFORM public.resolve_athlete_signal(
        v_signal.id,
        v_action->>'status',
        v_action->>'reason'
      );
    ELSE
      RAISE EXCEPTION 'invalid_signal_action';
    END IF;
  END LOOP;

  INSERT INTO public.athlete_weekly_reviews (
    athlete_id, week_start, authority, data_quality, decision, summary,
    aggregates, tracking, signal_actions, created_at, updated_at
  )
  VALUES (
    p_athlete_id, p_week_start, v_authority, p_data_quality, p_decision, trim(p_summary),
    p_aggregates, p_tracking, p_signal_actions, clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (athlete_id, week_start) DO UPDATE
  SET
    authority = EXCLUDED.authority,
    data_quality = EXCLUDED.data_quality,
    decision = EXCLUDED.decision,
    summary = EXCLUDED.summary,
    aggregates = EXCLUDED.aggregates,
    tracking = EXCLUDED.tracking,
    signal_actions = EXCLUDED.signal_actions,
    updated_at = clock_timestamp()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_athlete_decision(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb DEFAULT '{}'::jsonb,
  p_human_reason text DEFAULT NULL,
  p_applied_effect jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.athlete_decision_log;
  v_effect jsonb := COALESCE(p_applied_effect, '{}'::jsonb);
  v_data jsonb := COALESCE(p_data_used, '{}'::jsonb);
  v_proposal jsonb := COALESCE(p_proposal, '{}'::jsonb);
  v_reason text := NULLIF(trim(COALESCE(p_human_reason, '')), '');
  v_source text := NULLIF(trim(COALESCE(p_source, '')), '');
BEGIN
  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_required';
  END IF;
  IF p_domain IS NULL OR p_domain NOT IN (
    'training', 'nutrition', 'recovery', 'weight', 'goal', 'adherence'
  ) THEN
    RAISE EXCEPTION 'invalid_domain';
  END IF;
  IF p_type IS NULL OR char_length(trim(p_type)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'modified', 'refused', 'ignored') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_why IS NULL OR char_length(trim(p_why)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_why';
  END IF;
  IF jsonb_typeof(v_proposal) <> 'object' OR octet_length(v_proposal::text) > 16384 THEN
    RAISE EXCEPTION 'invalid_proposal';
  END IF;
  IF jsonb_typeof(v_data) <> 'object' OR octet_length(v_data::text) > 8192 THEN
    RAISE EXCEPTION 'invalid_data_used';
  END IF;
  IF jsonb_typeof(v_effect) <> 'object' OR octet_length(v_effect::text) > 8192 THEN
    RAISE EXCEPTION 'invalid_applied_effect';
  END IF;
  IF public.prometheus_json_forbids_raw(v_proposal)
     OR public.prometheus_json_forbids_raw(v_data)
     OR public.prometheus_json_forbids_raw(v_effect) THEN
    RAISE EXCEPTION 'raw_logs_forbidden';
  END IF;
  IF NOT public.prometheus_json_object_keys_allowed(v_data, ARRAY[
    'avg_calories', 'calorie_target', 'target_avg_kcal', 'workout_count',
    'logged_nutrition_days', 'weight_delta_kg', 'expected_workouts', 'weigh_ins',
    'avg_fatigue', 'avg_energy', 'window_start', 'window_end', 'checkin_count', 'goal'
  ]) THEN
    RAISE EXCEPTION 'invalid_data_used';
  END IF;
  IF NOT public.prometheus_json_object_keys_allowed(v_proposal, ARRAY[
    'kind', 'title', 'rationale', 'action', 'reason', 'draft', 'week_start',
    'type', 'flag', 'domain'
  ]) THEN
    RAISE EXCEPTION 'invalid_proposal';
  END IF;
  IF p_decision IN ('refused', 'ignored') AND v_effect <> '{}'::jsonb THEN
    RAISE EXCEPTION 'applied_effect_forbidden';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF v_uid = p_athlete_id THEN
      v_role := 'athlete';
    ELSE
      v_role := 'coach';
    END IF;
  ELSE
    v_role := 'athlete';
  END IF;

  INSERT INTO public.athlete_decision_log (
    athlete_id, actor_id, actor_role, domain, type, decision,
    proposal, why, data_used, human_reason, applied_effect, source, source_id, created_at
  )
  VALUES (
    p_athlete_id, v_uid, v_role, p_domain, trim(p_type), p_decision,
    v_proposal, trim(p_why), v_data, v_reason, v_effect, v_source, p_source_id, clock_timestamp()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_latest_athlete_decisions(p_athlete_id uuid)
RETURNS SETOF public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_required';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (d.domain, d.type) d.*
  FROM public.athlete_decision_log d
  WHERE d.athlete_id = p_athlete_id
  ORDER BY d.domain, d.type, d.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_latest_athlete_decisions_for_athletes(p_athlete_ids uuid[])
RETURNS SETOF public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_athlete_ids IS NULL THEN
    RAISE EXCEPTION 'athlete_required';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_athlete_ids) AS athlete_id
      WHERE athlete_id IS DISTINCT FROM auth.uid()
        AND NOT public.is_coach_of(athlete_id)
    ) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (d.athlete_id, d.domain, d.type) d.*
  FROM public.athlete_decision_log d
  WHERE d.athlete_id = ANY (p_athlete_ids)
  ORDER BY d.athlete_id, d.domain, d.type, d.created_at DESC;
END;
$$;

CREATE TABLE public.athlete_decision_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(trim(idempotency_key)) BETWEEN 1 AND 200),
  athlete_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  last_error text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.athlete_decision_outbox IS
  'Durable retry queue when record_athlete_decision fails after a human write. Never auto-applies programs or targets.';

ALTER TABLE public.athlete_decision_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.athlete_decision_outbox FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_athlete_decision_outbox(
  p_idempotency_key text,
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb DEFAULT '{}'::jsonb,
  p_human_reason text DEFAULT NULL,
  p_applied_effect jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL
)
RETURNS public.athlete_decision_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.athlete_decision_outbox;
BEGIN
  IF p_athlete_id IS NULL OR p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_outbox';
  END IF;
  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  INSERT INTO public.athlete_decision_outbox (idempotency_key, athlete_id, payload)
  VALUES (
    trim(p_idempotency_key),
    p_athlete_id,
    jsonb_strip_nulls(jsonb_build_object(
      'domain', p_domain,
      'type', p_type,
      'decision', p_decision,
      'proposal', COALESCE(p_proposal, '{}'::jsonb),
      'why', p_why,
      'data_used', COALESCE(p_data_used, '{}'::jsonb),
      'human_reason', NULLIF(trim(COALESCE(p_human_reason, '')), ''),
      'applied_effect', COALESCE(p_applied_effect, '{}'::jsonb),
      'source', NULLIF(trim(COALESCE(p_source, '')), ''),
      'source_id', p_source_id
    ))
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET attempts = public.athlete_decision_outbox.attempts + 1
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_solo_weekly_review_decision(
  p_week_start date,
  p_action text,
  p_reason text,
  p_proposed jsonb,
  p_evidence jsonb,
  p_decision text,
  p_domain text,
  p_type text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb DEFAULT '{}'::jsonb,
  p_applied_effect jsonb DEFAULT '{}'::jsonb
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_human text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'kept', 'dismissed') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_decision = 'accepted' THEN
    v_human := 'accepted';
  ELSIF p_decision = 'kept' THEN
    v_human := 'ignored';
  ELSE
    v_human := 'refused';
  END IF;

  INSERT INTO public.solo_weekly_reviews (
    user_id, week_start, action, reason, proposed, evidence, decision, decided_at
  )
  VALUES (
    v_uid, p_week_start, p_action, p_reason,
    COALESCE(p_proposed, '{}'::jsonb),
    COALESCE(p_evidence, '{}'::jsonb),
    p_decision, clock_timestamp()
  )
  ON CONFLICT (user_id, week_start) DO UPDATE
  SET
    action = EXCLUDED.action,
    reason = EXCLUDED.reason,
    proposed = EXCLUDED.proposed,
    evidence = EXCLUDED.evidence,
    decision = EXCLUDED.decision,
    decided_at = clock_timestamp();

  RETURN public.record_athlete_decision(
    v_uid,
    p_domain,
    p_type,
    v_human,
    COALESCE(p_proposal, '{}'::jsonb),
    p_why,
    COALESCE(p_data_used, '{}'::jsonb),
    NULL,
    COALESCE(p_applied_effect, '{}'::jsonb),
    'solo_weekly_reviews',
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_latest_athlete_decisions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_latest_athlete_decisions_for_athletes(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_athlete_decision_outbox(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_latest_athlete_decisions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_latest_athlete_decisions_for_athletes(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_athlete_decision_outbox(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb)
  TO authenticated, service_role;
