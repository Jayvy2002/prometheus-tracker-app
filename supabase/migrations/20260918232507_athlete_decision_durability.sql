-- P2.3 durability: outbox uniqueness per athlete, author preserved, journal
-- intent in the same transaction as the human action, Solo profile+journal TX,
-- eligible Solo triage for the weekly loop (no dashboard required).
-- Candidate only. Does not auto-apply programs or targets.
-- Does not invert P1.5 COALESCE lifetime trial.

ALTER TABLE public.athlete_decision_outbox
  DROP CONSTRAINT IF EXISTS athlete_decision_outbox_idempotency_key_key;

ALTER TABLE public.athlete_decision_outbox
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE INDEX IF NOT EXISTS athlete_decision_outbox_due
  ON public.athlete_decision_outbox (next_attempt_at, created_at)
  WHERE processed_at IS NULL AND failed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS athlete_decision_outbox_athlete_key
  ON public.athlete_decision_outbox (athlete_id, idempotency_key);

COMMENT ON TABLE public.athlete_decision_outbox IS
  'Retry queue scoped to (athlete_id, idempotency_key). Collision with another dossier must not return that row. Never auto-applies.';

CREATE OR REPLACE FUNCTION public.prometheus_strip_routing(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v jsonb := COALESCE(p, 'null'::jsonb);
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_arr jsonb;
BEGIN
  IF v IS NULL OR v = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) = 'array' THEN
    SELECT COALESCE(jsonb_agg(public.prometheus_strip_routing(elem)), '[]'::jsonb)
      INTO v_arr
    FROM jsonb_array_elements(v) AS elem;
    RETURN v_arr;
  END IF;
  IF jsonb_typeof(v) <> 'object' THEN
    RETURN v;
  END IF;
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v)
  LOOP
    IF v_key IN ('assign_client_id', 'for_client_id', 'client_id', 'coach_id') THEN
      CONTINUE;
    END IF;
    v_out := v_out || jsonb_build_object(v_key, public.prometheus_strip_routing(v_val));
  END LOOP;
  RETURN v_out;
END;
$$;

ALTER TABLE public.athlete_decision_log
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DROP INDEX IF EXISTS public.athlete_decision_log_one_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS athlete_decision_log_one_idempotency
  ON public.athlete_decision_log (athlete_id, idempotency_key);

CREATE OR REPLACE FUNCTION public.prometheus_effects_are_material(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v jsonb := COALESCE(public.prometheus_strip_routing(p), '{}'::jsonb);
  v_key text;
  v_val jsonb;
BEGIN
  IF jsonb_typeof(v) <> 'object' THEN
    RETURN false;
  END IF;
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v)
  LOOP
    IF v_val IS NULL OR v_val = 'null'::jsonb THEN
      CONTINUE;
    ELSIF jsonb_typeof(v_val) = 'object' AND v_val = '{}'::jsonb THEN
      CONTINUE;
    ELSIF jsonb_typeof(v_val) = 'array' AND jsonb_array_length(v_val) = 0 THEN
      CONTINUE;
    ELSIF jsonb_typeof(v_val) = 'string' AND v_val = '""'::jsonb THEN
      CONTINUE;
    ELSIF jsonb_typeof(v_val) = 'boolean' AND v_val = 'false'::jsonb THEN
      CONTINUE;
    ELSE
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_json_material_snapshot(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v jsonb := COALESCE(public.prometheus_strip_routing(p), '{}'::jsonb);
  v_payload jsonb;
  v_out jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF jsonb_typeof(v) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  FOREACH v_key IN ARRAY ARRAY[
    'calories', 'protein', 'carbs', 'fat', 'daily_calorie_target', 'target_avg_kcal',
    'draft', 'program_id', 'days', 'title', 'rationale', 'kind', 'action', 'reason',
    'flag', 'patch', 'program', 'note', 'message', 'tracking', 'assign_program_id'
  ]
  LOOP
    IF v ? v_key THEN
      v_out := v_out || jsonb_build_object(v_key, v -> v_key);
    END IF;
  END LOOP;
  IF v ? 'payload' AND jsonb_typeof(v -> 'payload') = 'object' THEN
    v_payload := (v -> 'payload') - ARRAY['assign_client_id', 'for_client_id', 'client_id', 'coach_id'];
    v_out := v_out || jsonb_build_object('payload', v_payload);
  END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_map_intervention_kind(p_kind text, p_hint text)
RETURNS TABLE(domain text, type text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_hint text := lower(btrim(COALESCE(p_hint, '')));
BEGIN
  IF p_kind = 'program_adjustment' THEN
    domain := 'training'; type := 'program_adjustment'; RETURN NEXT; RETURN;
  ELSIF p_kind = 'adherence_training' THEN
    domain := 'training'; type := 'missed_sessions'; RETURN NEXT; RETURN;
  ELSIF p_kind = 'adherence_nutrition' THEN
    domain := 'nutrition'; type := 'not_following'; RETURN NEXT; RETURN;
  ELSIF p_kind = 'calorie_adjustment' THEN
    IF v_hint LIKE '%too_fast%' THEN
      domain := 'weight'; type := 'too_fast';
    ELSIF v_hint LIKE '%stall%' OR v_hint LIKE '%cut_gain%' OR v_hint LIKE '%bulk_stall%' THEN
      domain := 'weight'; type := 'stall';
    ELSIF v_hint LIKE '%carb%' THEN
      domain := 'recovery'; type := 'fatigue';
    ELSE
      domain := 'nutrition'; type := 'not_following';
    END IF;
    RETURN NEXT; RETURN;
  ELSIF p_kind = 'keep_in_touch' THEN
    domain := 'adherence'; type := 'keep_in_touch'; RETURN NEXT; RETURN;
  ELSIF p_kind = 'onboarding_plan' THEN
    domain := 'goal'; type := 'onboarding'; RETURN NEXT; RETURN;
  ELSIF p_kind IN ('training', 'nutrition', 'recovery', 'weight', 'goal', 'adherence') THEN
    domain := p_kind; type := p_kind; RETURN NEXT; RETURN;
  ELSE
    domain := 'goal'; type := COALESCE(NULLIF(p_kind, ''), 'other'); RETURN NEXT; RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_map_intervention_decision(
  p_status text,
  p_edited boolean,
  p_has_effect boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status = 'dismissed' THEN 'refused'
    WHEN p_status = 'kept' AND COALESCE(p_has_effect, false) AND COALESCE(p_edited, false) THEN 'modified'
    WHEN p_status = 'kept' AND COALESCE(p_has_effect, false) THEN 'accepted'
    WHEN p_status = 'kept' THEN 'ignored'
    WHEN COALESCE(p_edited, false) THEN 'modified'
    ELSE 'accepted'
  END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_canonical_action_field(p_key text, p_val jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_val IS NULL OR p_val = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF p_key = 'calories' THEN
    IF jsonb_typeof(p_val) = 'number' THEN
      RETURN jsonb_build_object('calories', p_val);
    END IF;
    IF jsonb_typeof(p_val) = 'object' THEN
      RETURN jsonb_strip_nulls(jsonb_build_object(
        'calories', p_val->'calories',
        'protein', p_val->'protein',
        'carbs', p_val->'carbs',
        'fat', p_val->'fat'
      ));
    END IF;
  END IF;
  RETURN public.prometheus_strip_routing(p_val);
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_submitted_covered_by(
  p_original jsonb,
  p_submitted jsonb,
  p_canonicalize boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_orig jsonb;
  v_orig_val jsonb;
  v_sub_val jsonb;
BEGIN
  IF p_submitted IS NULL OR p_submitted = 'null'::jsonb THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p_submitted) = 'object' THEN
    IF p_original IS NULL OR jsonb_typeof(p_original) <> 'object' THEN
      v_orig := '{}'::jsonb;
    ELSE
      v_orig := p_original;
    END IF;
    FOR v_key IN SELECT key FROM jsonb_each(p_submitted)
    LOOP
      IF v_key IN ('assign_client_id', 'for_client_id', 'client_id', 'coach_id') THEN
        CONTINUE;
      END IF;
      v_orig_val := v_orig->v_key;
      v_sub_val := p_submitted->v_key;
      IF COALESCE(p_canonicalize, true) THEN
        v_orig_val := public.prometheus_canonical_action_field(v_key, v_orig_val);
        v_sub_val := public.prometheus_canonical_action_field(v_key, v_sub_val);
      END IF;
      IF NOT public.prometheus_submitted_covered_by(v_orig_val, v_sub_val, false) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;
  RETURN public.prometheus_strip_routing(COALESCE(p_original, 'null'::jsonb))
    IS NOT DISTINCT FROM public.prometheus_strip_routing(p_submitted);
END;
$$;

DROP FUNCTION IF EXISTS public.prometheus_submitted_covered_by(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.prometheus_proposal_materially_edited(p_original jsonb, p_submitted jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.prometheus_json_material_snapshot(p_submitted) = '{}'::jsonb THEN false
    ELSE NOT public.prometheus_submitted_covered_by(
      public.prometheus_json_material_snapshot(p_original),
      public.prometheus_json_material_snapshot(p_submitted)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_evidence_from_payload(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v jsonb := COALESCE(p, '{}'::jsonb);
  e jsonb := '{}'::jsonb;
  v_out jsonb := '{}'::jsonb;
  k text;
  mapped text;
  val jsonb;
BEGIN
  IF jsonb_typeof(v) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF jsonb_typeof(v->'evidence') = 'object' THEN
    e := v->'evidence';
  END IF;
  FOREACH k IN ARRAY ARRAY[
    'avg_calories', 'calorie_target', 'target_avg_kcal', 'workout_count',
    'logged_nutrition_days', 'weight_delta_kg', 'expected_workouts', 'weigh_ins',
    'avg_fatigue', 'avg_energy', 'window_start', 'window_end', 'checkin_count', 'goal'
  ]
  LOOP
    mapped := CASE k WHEN 'target_avg_kcal' THEN 'calorie_target' ELSE k END;
    IF v_out ? mapped THEN
      CONTINUE;
    END IF;
    IF v ? k AND v->k IS NOT NULL AND v->k <> 'null'::jsonb THEN
      val := v->k;
    ELSIF e ? k AND e->k IS NOT NULL AND e->k <> 'null'::jsonb THEN
      val := e->k;
    ELSE
      CONTINUE;
    END IF;
    v_out := v_out || jsonb_build_object(mapped, val);
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_intake_has_medical_flags(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p->>'cardiaqueHtaPoitrine', '') = 'Oui'
      OR COALESCE(p->>'etourdissementsEquilibre', '') = 'Oui'
      OR COALESCE(p->>'medecinLimiteExercices', '') = 'Oui';
$$;

CREATE OR REPLACE FUNCTION public.prometheus_calendar_age_years(p_dob date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_dob IS NULL THEN NULL
    ELSE EXTRACT(YEAR FROM age(CURRENT_DATE, p_dob))::int
  END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_athlete_evidence_snapshot(p_athlete uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := CURRENT_DATE - 13;
  v_to date := CURRENT_DATE;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_athlete IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'avg_calories', (
      SELECT ROUND(AVG(day_kcal))
      FROM (
        SELECT SUM(nl.calories)::numeric AS day_kcal
        FROM public.nutrition_logs nl
        WHERE nl.user_id = p_athlete
          AND nl.logged_at::date BETWEEN v_from AND v_to
        GROUP BY nl.logged_at::date
      ) days
    ),
    'logged_nutrition_days', (
      SELECT COUNT(DISTINCT nl.logged_at::date)
      FROM public.nutrition_logs nl
      WHERE nl.user_id = p_athlete
        AND nl.logged_at::date BETWEEN v_from AND v_to
    ),
    'workout_count', (
      SELECT COUNT(*) FILTER (WHERE COALESCE(w.completed, true))
      FROM public.workouts w
      WHERE w.user_id = p_athlete
        AND w.date::date BETWEEN v_from AND v_to
    ),
    'checkin_count', (
      SELECT COUNT(*)
      FROM public.daily_checkins c
      WHERE c.user_id = p_athlete
        AND c.checked_at::date BETWEEN v_from AND v_to
    ),
    'weigh_ins', (
      SELECT COUNT(*)
      FROM public.weight_measurements wm
      WHERE wm.user_id = p_athlete
        AND wm.measured_at::date BETWEEN v_from AND v_to
    ),
    'window_start', v_from,
    'window_end', v_to
  )) INTO v_out;
  RETURN COALESCE(v_out, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_resolve_decision_evidence(
  p_athlete uuid,
  p_original jsonb DEFAULT '{}'::jsonb,
  p_submitted jsonb DEFAULT '{}'::jsonb,
  p_effects jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.prometheus_evidence_from_payload(
    COALESCE(public.prometheus_athlete_evidence_snapshot(p_athlete), '{}'::jsonb)
    || COALESCE(p_original, '{}'::jsonb)
    || COALESCE(p_submitted, '{}'::jsonb)
    || COALESCE(p_effects, '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.prometheus_assert_decision_payload(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb,
  p_applied_effect jsonb,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_effect jsonb := COALESCE(p_applied_effect, '{}'::jsonb);
  v_data jsonb := COALESCE(p_data_used, '{}'::jsonb);
  v_proposal jsonb := COALESCE(p_proposal, '{}'::jsonb);
  v_key text := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
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
  IF v_key IS NOT NULL AND char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_decision_idempotency_key(
  p_athlete_id uuid,
  p_idempotency_key text,
  p_source text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_decision text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_type text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_derived text;
  v_key text;
BEGIN
  IF p_athlete_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_derived := left(
    p_athlete_id::text || ':' || coalesce(p_source, 'unknown') || ':' || coalesce(p_source_id::text, '')
      || ':' || coalesce(p_decision, '') || ':' || coalesce(p_domain, '') || ':' || coalesce(p_type, ''),
    200
  );
  IF NULLIF(trim(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    v_key := v_derived;
  ELSIF position(p_athlete_id::text in trim(p_idempotency_key)) = 1 THEN
    v_key := left(trim(p_idempotency_key), 200);
  ELSE
    v_key := left(p_athlete_id::text || ':' || trim(p_idempotency_key), 200);
  END IF;
  IF char_length(v_key) < 1 THEN
    RETURN NULL;
  END IF;
  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_lock_decision_key(p_athlete_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_athlete_id IS NULL OR NULLIF(trim(COALESCE(p_key, '')), '') IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_athlete_id::text || ':decision:' || trim(p_key)), 1, 16))::bit(64)::bigint
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_outbox_record_failure(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
BEGIN
  UPDATE public.athlete_decision_outbox
  SET
    attempts = attempts + 1,
    last_error = left(p_error, 500),
    failed_at = CASE WHEN attempts + 1 >= 8 THEN clock_timestamp() ELSE failed_at END,
    next_attempt_at = CASE
      WHEN attempts + 1 >= 8 THEN next_attempt_at
      ELSE clock_timestamp() + (interval '30 seconds') * (2 ^ least(attempts, 6))
    END
  WHERE id = p_id
  RETURNING attempts INTO v_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_decision_outbox_payload(
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb,
  p_human_reason text,
  p_applied_effect jsonb,
  p_source text,
  p_source_id uuid,
  p_key text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'domain', p_domain,
    'type', p_type,
    'decision', p_decision,
    'proposal', COALESCE(p_proposal, '{}'::jsonb),
    'why', p_why,
    'data_used', COALESCE(p_data_used, '{}'::jsonb),
    'human_reason', NULLIF(trim(COALESCE(p_human_reason, '')), ''),
    'applied_effect', COALESCE(p_applied_effect, '{}'::jsonb),
    'source', NULLIF(trim(COALESCE(p_source, '')), ''),
    'source_id', p_source_id,
    'idempotency_key', p_key
  ));
$$;

CREATE OR REPLACE FUNCTION public.prometheus_outbox_intents_equal(p_stored jsonb, p_incoming jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (COALESCE(p_stored, '{}'::jsonb) - 'idempotency_key')
    IS NOT DISTINCT FROM (COALESCE(p_incoming, '{}'::jsonb) - 'idempotency_key');
$$;

CREATE OR REPLACE FUNCTION public.prometheus_record_stored_outbox(p_box public.athlete_decision_outbox)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := COALESCE(p_box.payload, '{}'::jsonb);
BEGIN
  RETURN public.record_athlete_decision_replay(
    p_box.athlete_id,
    v->>'domain',
    v->>'type',
    v->>'decision',
    COALESCE(v->'proposal', '{}'::jsonb),
    COALESCE(v->>'why', 'decision'),
    COALESCE(v->'data_used', '{}'::jsonb),
    v->>'human_reason',
    COALESCE(v->'applied_effect', '{}'::jsonb),
    v->>'source',
    NULLIF(v->>'source_id', '')::uuid,
    p_box.idempotency_key,
    p_box.actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prometheus_strip_routing(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_effects_are_material(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_json_material_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_proposal_materially_edited(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_map_intervention_kind(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_map_intervention_decision(text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_canonical_action_field(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_submitted_covered_by(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_evidence_from_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_intake_has_medical_flags(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_calendar_age_years(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_athlete_evidence_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_resolve_decision_evidence(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_assert_decision_payload(uuid, text, text, text, jsonb, text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_lock_decision_key(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_decision_idempotency_key(uuid, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_outbox_record_failure(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_decision_outbox_payload(text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_outbox_intents_equal(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_record_stored_outbox(public.athlete_decision_outbox) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid);
DROP FUNCTION IF EXISTS public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.record_athlete_decision_replay(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.prometheus_write_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.prometheus_write_athlete_decision(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb,
  p_human_reason text,
  p_applied_effect jsonb,
  p_source text,
  p_source_id uuid,
  p_idempotency_key text,
  p_actor_id uuid
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := p_actor_id;
  v_role text;
  v_row public.athlete_decision_log;
  v_effect jsonb := COALESCE(p_applied_effect, '{}'::jsonb);
  v_data jsonb := COALESCE(p_data_used, '{}'::jsonb);
  v_proposal jsonb := COALESCE(p_proposal, '{}'::jsonb);
  v_reason text := NULLIF(trim(COALESCE(p_human_reason, '')), '');
  v_source text := NULLIF(trim(COALESCE(p_source, '')), '');
  v_key text := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
BEGIN
  PERFORM public.prometheus_assert_decision_payload(
    p_athlete_id, p_domain, p_type, p_decision, v_proposal, p_why, v_data, v_effect, v_key
  );
  PERFORM public.prometheus_lock_decision_key(p_athlete_id, v_key);

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.athlete_decision_log
    WHERE athlete_id = p_athlete_id AND idempotency_key = v_key
    FOR UPDATE;
    IF FOUND THEN
      IF v_row.domain IS DISTINCT FROM p_domain
         OR v_row.type IS DISTINCT FROM btrim(p_type)
         OR v_row.decision IS DISTINCT FROM p_decision
         OR v_row.proposal IS DISTINCT FROM v_proposal
         OR v_row.applied_effect IS DISTINCT FROM v_effect THEN
        RAISE EXCEPTION 'idempotency_conflict';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  IF v_actor IS NULL OR v_actor = p_athlete_id THEN
    v_role := 'athlete';
  ELSE
    v_role := 'coach';
  END IF;

  INSERT INTO public.athlete_decision_log (
    athlete_id, actor_id, actor_role, domain, type, decision,
    proposal, why, data_used, human_reason, applied_effect, source, source_id,
    idempotency_key, created_at
  )
  VALUES (
    p_athlete_id, v_actor, v_role, p_domain, trim(p_type), p_decision,
    v_proposal, trim(p_why), v_data, v_reason, v_effect, v_source, p_source_id,
    v_key, clock_timestamp()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 13-arg form has no DEFAULT: PG 42P13 forbids a required arg after a default,
-- and defaults here would make the 11-arg wrapper ambiguous.
-- Client path: author is always auth.uid(), never a client-supplied identity.
CREATE OR REPLACE FUNCTION public.record_athlete_decision(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb,
  p_human_reason text,
  p_applied_effect jsonb,
  p_source text,
  p_source_id uuid,
  p_idempotency_key text,
  p_actor_id uuid
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN public.prometheus_write_athlete_decision(
    p_athlete_id, p_domain, p_type, p_decision, p_proposal, p_why,
    p_data_used, p_human_reason, p_applied_effect, p_source, p_source_id,
    p_idempotency_key, v_uid
  );
END;
$$;

-- Drain/queue path: author comes from the stored outbox row, never from auth.uid()
-- and never from a client-supplied identity. Not granted to authenticated.
CREATE OR REPLACE FUNCTION public.record_athlete_decision_replay(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb,
  p_human_reason text,
  p_applied_effect jsonb,
  p_source text,
  p_source_id uuid,
  p_idempotency_key text,
  p_actor_id uuid
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;
  RETURN public.prometheus_write_athlete_decision(
    p_athlete_id, p_domain, p_type, p_decision, p_proposal, p_why,
    p_data_used, p_human_reason, p_applied_effect, p_source, p_source_id,
    p_idempotency_key, p_actor_id
  );
END;
$$;

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
  v_key text;
  v_payload jsonb;
BEGIN
  v_key := public.prometheus_decision_idempotency_key(
    p_athlete_id, p_idempotency_key, p_source, p_source_id, p_decision, p_domain, p_type
  );
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'invalid_outbox';
  END IF;
  PERFORM public.prometheus_assert_decision_payload(
    p_athlete_id, p_domain, p_type, p_decision,
    COALESCE(p_proposal, '{}'::jsonb), p_why,
    COALESCE(p_data_used, '{}'::jsonb),
    COALESCE(p_applied_effect, '{}'::jsonb),
    v_key
  );
  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  PERFORM public.prometheus_lock_decision_key(p_athlete_id, v_key);

  v_payload := public.prometheus_decision_outbox_payload(
    p_domain, p_type, p_decision,
    COALESCE(p_proposal, '{}'::jsonb),
    p_why,
    COALESCE(p_data_used, '{}'::jsonb),
    p_human_reason,
    COALESCE(p_applied_effect, '{}'::jsonb),
    p_source,
    p_source_id,
    v_key
  );

  INSERT INTO public.athlete_decision_outbox (idempotency_key, athlete_id, actor_id, payload)
  VALUES (v_key, p_athlete_id, v_uid, v_payload)
  ON CONFLICT (athlete_id, idempotency_key)
  DO UPDATE SET
    payload = public.athlete_decision_outbox.payload
  WHERE public.prometheus_outbox_intents_equal(
    public.athlete_decision_outbox.payload,
    EXCLUDED.payload
  )
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;
  IF v_row.athlete_id IS DISTINCT FROM p_athlete_id THEN
    RAISE EXCEPTION 'outbox_athlete_mismatch';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_and_record_athlete_decision(
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
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box public.athlete_decision_outbox;
  v_row public.athlete_decision_log;
BEGIN
  v_box := public.enqueue_athlete_decision_outbox(
    p_idempotency_key, p_athlete_id, p_domain, p_type, p_decision,
    p_proposal, p_why, p_data_used, p_human_reason, p_applied_effect, p_source, p_source_id
  );
  IF v_box.processed_at IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.athlete_decision_log
    WHERE athlete_id = p_athlete_id AND idempotency_key = v_box.idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN v_row;
    END IF;
  END IF;

  BEGIN
    v_row := public.prometheus_record_stored_outbox(v_box);
    UPDATE public.athlete_decision_outbox
    SET processed_at = clock_timestamp(), last_error = NULL, failed_at = NULL
    WHERE id = v_box.id AND athlete_id = p_athlete_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.prometheus_outbox_record_failure(v_box.id, SQLERRM);
    v_row := NULL;
  END;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.drain_athlete_decision_outbox(p_limit integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_candidate public.athlete_decision_outbox;
  v_box public.athlete_decision_outbox;
  v_n int := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 25;
  END IF;
  IF p_limit > 100 THEN
    p_limit := 100;
  END IF;

  -- Peek without row locks, then for each key: advisory → outbox → journal.
  FOR v_candidate IN
    SELECT *
    FROM public.athlete_decision_outbox
    WHERE processed_at IS NULL
      AND failed_at IS NULL
      AND next_attempt_at <= clock_timestamp()
      AND (
        v_uid IS NULL
        OR athlete_id = v_uid
        OR public.is_coach_of(athlete_id)
      )
    ORDER BY next_attempt_at, created_at
    LIMIT p_limit
  LOOP
    PERFORM public.prometheus_lock_decision_key(
      v_candidate.athlete_id, v_candidate.idempotency_key
    );
    SELECT * INTO v_box
    FROM public.athlete_decision_outbox
    WHERE id = v_candidate.id
      AND processed_at IS NULL
      AND failed_at IS NULL
      AND next_attempt_at <= clock_timestamp()
    FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    BEGIN
      PERFORM public.prometheus_record_stored_outbox(v_box);
      UPDATE public.athlete_decision_outbox
      SET processed_at = clock_timestamp(), last_error = NULL, failed_at = NULL
      WHERE id = v_box.id;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.prometheus_outbox_record_failure(v_box.id, SQLERRM);
    END;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.coach_intervention_queue_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind record;
  v_hint text;
  v_edited boolean;
  v_has_effect boolean;
  v_human text;
  v_effect jsonb;
  v_submitted jsonb;
  v_data jsonb;
BEGIN
  IF current_setting('prometheus.intervention_journaled', true) = NEW.id::text THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_hint := COALESCE(NEW.payload->>'flag', NEW.payload->>'reason', '');
  SELECT * INTO v_kind FROM public.prometheus_map_intervention_kind(NEW.kind, v_hint);
  v_submitted := COALESCE(NEW.payload, '{}'::jsonb);
  v_edited := public.prometheus_proposal_materially_edited(OLD.payload, v_submitted)
    OR public.prometheus_proposal_materially_edited(
      OLD.payload,
      COALESCE(NEW.applied_values, '{}'::jsonb) || v_submitted
    );
  v_effect := COALESCE(public.prometheus_strip_routing(NEW.applied_values), '{}'::jsonb);
  v_has_effect := public.prometheus_effects_are_material(v_effect);
  v_human := public.prometheus_map_intervention_decision(NEW.status, v_edited, v_has_effect);
  IF v_human IN ('refused', 'ignored') THEN
    v_effect := '{}'::jsonb;
  END IF;
  v_data := public.prometheus_resolve_decision_evidence(
    NEW.client_id,
    COALESCE(OLD.payload, '{}'::jsonb),
    v_submitted,
    COALESCE(NEW.applied_values, '{}'::jsonb)
  );
  PERFORM public.queue_and_record_athlete_decision(
    'coach_interventions:' || NEW.id::text || ':' || NEW.status,
    NEW.client_id,
    v_kind.domain,
    v_kind.type,
    v_human,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', NEW.kind,
      'title', NEW.title,
      'rationale', NEW.rationale,
      'action', NEW.kind,
      'reason', NULLIF(v_hint, ''),
      'flag', NEW.payload->>'flag'
    )),
    left(COALESCE(NULLIF(btrim(NEW.rationale), ''), NEW.kind), 500),
    v_data,
    NULL,
    v_effect,
    'coach_interventions',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_interventions_queue_decision ON public.coach_interventions;
CREATE TRIGGER coach_interventions_queue_decision
AFTER UPDATE OF status ON public.coach_interventions
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status IN ('sent', 'kept', 'dismissed'))
EXECUTE FUNCTION public.coach_intervention_queue_decision();

CREATE OR REPLACE FUNCTION public.apply_intervention(
  p_id uuid,
  p_idempotency_key text,
  p_claim_key text,
  p_status text,
  p_payload jsonb,
  p_effects jsonb,
  p_client_msg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.coach_interventions%ROWTYPE;
  v_applied jsonb := '{}'::jsonb;
  v_client uuid;
  v_kind record;
  v_hint text;
  v_edited boolean;
  v_has_effect boolean;
  v_human text;
  v_effect jsonb;
  v_original jsonb;
  v_data jsonb;
BEGIN
  -- Target = auth.uid() or is_coach_of. assert_client_target raises:
  -- Not authorized for this client
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  IF p_status NOT IN ('sent', 'dismissed', 'kept') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      ('x' || substr(md5(v_uid::text || ':' || p_idempotency_key), 1, 16))::bit(64)::bigint
    );
    SELECT result INTO v_applied
    FROM public.mutation_idempotency
    WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      PERFORM public.drain_athlete_decision_outbox(10);
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'applied', v_applied);
    END IF;
    v_client := NULLIF(p_effects->>'assign_client_id', '')::uuid;
    PERFORM public.assert_client_target(v_client);
    PERFORM public.assert_client_target(NULLIF(p_effects->'program'->>'assign_client_id', '')::uuid);
    v_applied := public._apply_intervention_effects(
      v_uid, v_client, COALESCE(p_effects, '{}'::jsonb), p_client_msg_id, '{}'::jsonb
    );
    INSERT INTO public.mutation_idempotency (user_id, idempotency_key, result)
    VALUES (v_uid, p_idempotency_key, v_applied);
    RETURN jsonb_build_object('ok', true, 'replayed', false, 'applied', v_applied);
  END IF;

  SELECT * INTO v_row
  FROM public.coach_interventions
  WHERE id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.coach_id <> v_uid THEN
    RAISE EXCEPTION 'Not this coach';
  END IF;

  IF v_row.status <> 'pending' THEN
    IF v_row.idempotency_key IS NOT DISTINCT FROM p_idempotency_key THEN
      PERFORM public.drain_athlete_decision_outbox(10);
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'applied', v_row.applied_values);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_resolved');
  END IF;

  IF v_row.claim_key IS NOT NULL
     AND v_row.claim_key IS DISTINCT FROM p_claim_key
     AND v_row.claimed_at IS NOT NULL
     AND v_row.claimed_at > now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  v_client := COALESCE(v_row.client_id, NULLIF(p_effects->>'assign_client_id', '')::uuid);
  PERFORM public.assert_client_target(v_client);
  PERFORM public.assert_client_target(NULLIF(p_effects->>'assign_client_id', '')::uuid);
  PERFORM public.assert_client_target(NULLIF(p_effects->'program'->>'assign_client_id', '')::uuid);

  v_original := COALESCE(v_row.payload, '{}'::jsonb);
  v_applied := public._apply_intervention_effects(
    v_uid, v_client, COALESCE(p_effects, '{}'::jsonb), p_client_msg_id, v_applied
  );

  IF v_row.kind = 'calorie_adjustment' AND v_client IS NOT NULL THEN
    SELECT jsonb_build_object(
      'calories', p.daily_calorie_target,
      'protein', p.protein_target,
      'carbs', p.carbs_target,
      'fat', p.fat_target,
      'snapshot_at', now()
    )
    INTO v_applied
    FROM public.user_profiles p
    WHERE p.id = v_client;
  END IF;

  IF v_client IS NOT NULL THEN
    v_hint := COALESCE(
      COALESCE(p_payload, v_original)->>'flag',
      COALESCE(p_payload, v_original)->>'reason',
      ''
    );
    SELECT * INTO v_kind FROM public.prometheus_map_intervention_kind(v_row.kind, v_hint);
    v_edited := public.prometheus_proposal_materially_edited(v_original, COALESCE(p_payload, v_original))
      OR public.prometheus_proposal_materially_edited(v_original, COALESCE(p_effects, '{}'::jsonb));
    v_effect := COALESCE(public.prometheus_strip_routing(p_effects), '{}'::jsonb);
    v_has_effect := public.prometheus_effects_are_material(v_effect);
    v_human := public.prometheus_map_intervention_decision(p_status, v_edited, v_has_effect);
    IF v_human IN ('refused', 'ignored') THEN
      v_effect := '{}'::jsonb;
    END IF;
    v_data := public.prometheus_resolve_decision_evidence(
      v_client, v_original, COALESCE(p_payload, '{}'::jsonb), COALESCE(p_effects, '{}'::jsonb)
    );
    PERFORM set_config('prometheus.intervention_journaled', p_id::text, true);
    PERFORM public.queue_and_record_athlete_decision(
      'coach_interventions:' || p_id::text || ':' || p_status,
      v_client,
      v_kind.domain,
      v_kind.type,
      v_human,
      jsonb_strip_nulls(jsonb_build_object(
        'kind', v_row.kind,
        'title', v_row.title,
        'rationale', v_row.rationale,
        'action', v_row.kind,
        'reason', NULLIF(v_hint, ''),
        'flag', COALESCE(p_payload, v_original)->>'flag'
      )),
      left(COALESCE(NULLIF(btrim(v_row.rationale), ''), v_row.kind), 500),
      v_data,
      NULL,
      v_effect,
      'coach_interventions',
      p_id
    );
  END IF;

  UPDATE public.coach_interventions
  SET status = p_status,
      payload = COALESCE(p_payload, payload),
      applied_values = COALESCE(v_applied, applied_values),
      claim_key = NULL,
      claimed_at = NULL,
      idempotency_key = p_idempotency_key,
      client_msg_id = COALESCE(p_client_msg_id, client_msg_id),
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'applied', v_applied);
END;
$$;

DROP FUNCTION IF EXISTS public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb, text);

-- 13-arg form has no DEFAULT (42P13 + unique 12-arg wrapper).
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
  p_data_used jsonb,
  p_applied_effect jsonb,
  p_idempotency_key text
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_human text;
  v_key text;
  v_proposed jsonb := COALESCE(p_proposed, '{}'::jsonb);
  v_effect jsonb := COALESCE(p_applied_effect, '{}'::jsonb);
  v_proposal jsonb := COALESCE(p_proposal, '{}'::jsonb);
  v_row public.athlete_decision_log;
  v_box public.athlete_decision_outbox;
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
  v_key := public.prometheus_decision_idempotency_key(
    v_uid,
    COALESCE(
      NULLIF(trim(COALESCE(p_idempotency_key, '')), ''),
      'solo_weekly_reviews:' || v_uid::text || ':' || p_week_start::text
    ),
    'solo_weekly_reviews',
    NULL,
    v_human,
    p_domain,
    p_type
  );
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  IF v_human IN ('refused', 'ignored') THEN
    v_effect := '{}'::jsonb;
  END IF;

  PERFORM public.prometheus_lock_decision_key(v_uid, v_key);
  SELECT * INTO v_box
  FROM public.athlete_decision_outbox
  WHERE athlete_id = v_uid AND idempotency_key = v_key
  FOR UPDATE;
  SELECT * INTO v_row
  FROM public.athlete_decision_log
  WHERE athlete_id = v_uid AND idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_row.domain IS DISTINCT FROM p_domain
       OR v_row.type IS DISTINCT FROM btrim(p_type)
       OR v_row.decision IS DISTINCT FROM v_human
       OR v_row.proposal IS DISTINCT FROM v_proposal
       OR v_row.applied_effect IS DISTINCT FROM v_effect THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    UPDATE public.athlete_decision_outbox
    SET processed_at = COALESCE(processed_at, clock_timestamp()),
        last_error = NULL,
        failed_at = NULL
    WHERE athlete_id = v_uid AND idempotency_key = v_key AND processed_at IS NULL;
    RETURN v_row;
  END IF;

  IF v_box.id IS NOT NULL THEN
    IF NOT public.prometheus_outbox_intents_equal(
      v_box.payload,
      public.prometheus_decision_outbox_payload(
        p_domain, p_type, v_human, v_proposal, p_why,
        COALESCE(p_data_used, '{}'::jsonb), NULL, v_effect,
        'solo_weekly_reviews', NULL, v_key
      )
    ) THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    BEGIN
      v_row := public.prometheus_record_stored_outbox(v_box);
      UPDATE public.athlete_decision_outbox
      SET processed_at = clock_timestamp(), last_error = NULL, failed_at = NULL
      WHERE id = v_box.id AND athlete_id = v_uid;
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.prometheus_outbox_record_failure(v_box.id, SQLERRM);
      v_row := NULL;
    END;
    RETURN v_row;
  END IF;

  IF p_decision = 'accepted'
     AND v_proposed ? 'calories'
     AND NULLIF(v_proposed->>'calories', '') IS NOT NULL THEN
    UPDATE public.user_profiles
    SET
      daily_calorie_target = (v_proposed->>'calories')::int,
      protein_target = COALESCE((v_proposed->>'protein')::int, protein_target),
      carbs_target = COALESCE((v_proposed->>'carbs')::int, carbs_target),
      fat_target = COALESCE((v_proposed->>'fat')::int, fat_target),
      updated_at = clock_timestamp()
    WHERE id = v_uid;
  END IF;

  INSERT INTO public.solo_weekly_reviews (
    user_id, week_start, action, reason, proposed, evidence, decision, decided_at
  )
  VALUES (
    v_uid, p_week_start, p_action, p_reason,
    v_proposed,
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

  v_row := public.queue_and_record_athlete_decision(
    v_key,
    v_uid,
    p_domain,
    p_type,
    v_human,
    v_proposal,
    p_why,
    COALESCE(p_data_used, '{}'::jsonb),
    NULL,
    v_effect,
    'solo_weekly_reviews',
    NULL
  );
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.triage_eligible_solo_weekly(p_athlete_id uuid DEFAULT NULL)
RETURNS TABLE (athlete_id uuid, dossier jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := CURRENT_DATE - 13;
  v_to date := CURRENT_DATE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL THEN
    IF p_athlete_id IS NOT NULL AND p_athlete_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    p_athlete_id := v_uid;
  END IF;

  RETURN QUERY
  WITH solos AS (
    SELECT p.id AS athlete_id, p.*
    FROM public.user_profiles p
    WHERE (p_athlete_id IS NULL OR p.id = p_athlete_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.coach_client_links ccl
        WHERE ccl.client_id = p.id AND ccl.status = 'active'
      )
  ),
  nutrition_days AS (
    SELECT nl.user_id, nl.logged_at::date AS d, SUM(nl.calories)::numeric AS kcal
    FROM public.nutrition_logs nl
    JOIN solos s ON s.athlete_id = nl.user_id
    WHERE nl.logged_at::date BETWEEN v_from AND v_to
    GROUP BY nl.user_id, nl.logged_at::date
  ),
  nutrition_agg AS (
    SELECT user_id, COUNT(*)::int AS logged_nutrition_days,
      COALESCE(AVG(kcal), 0)::numeric AS avg_calories
    FROM nutrition_days GROUP BY user_id
  ),
  workout_agg AS (
    SELECT w.user_id, COUNT(*) FILTER (WHERE COALESCE(w.completed, true))::int AS workout_count
    FROM public.workouts w
    JOIN solos s ON s.athlete_id = w.user_id
    WHERE w.date::date BETWEEN v_from AND v_to
    GROUP BY w.user_id
  ),
  checkin_agg AS (
    SELECT c.user_id, COUNT(*)::int AS checkin_count,
      AVG(c.fatigue)::numeric AS avg_fatigue,
      AVG(c.energy_level)::numeric AS avg_energy
    FROM public.daily_checkins c
    JOIN solos s ON s.athlete_id = c.user_id
    WHERE c.checked_at::date BETWEEN v_from AND v_to
    GROUP BY c.user_id
  ),
  weight_ord AS (
    SELECT wm.user_id, wm.weight_kg, wm.measured_at,
      ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at ASC) AS rn_asc,
      ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at DESC) AS rn_desc
    FROM public.weight_measurements wm
    JOIN solos s ON s.athlete_id = wm.user_id
    WHERE wm.measured_at::date BETWEEN v_from AND v_to
  ),
  weight_agg AS (
    SELECT a.user_id, a.weight_kg AS weight_start_kg, b.weight_kg AS weight_end_kg,
      ROUND((b.weight_kg - a.weight_kg)::numeric, 1) AS weight_delta_kg,
      GREATEST(1, (b.measured_at::date - a.measured_at::date))::int AS weight_span_days,
      (SELECT COUNT(*)::int FROM weight_ord w WHERE w.user_id = a.user_id) AS weigh_ins
    FROM weight_ord a JOIN weight_ord b ON b.user_id = a.user_id AND b.rn_desc = 1
    WHERE a.rn_asc = 1
  )
  SELECT s.athlete_id,
    jsonb_build_object(
      'coach_id', s.athlete_id,
      'client_id', s.athlete_id,
      'full_name', COALESCE(s.full_name, ''),
      'goal', COALESCE(s.goal, ''),
      'training_frequency', COALESCE(NULLIF(s.training_frequency, 0), 3),
      'calorie_target', COALESCE(s.daily_calorie_target, 0),
      'protein_target', COALESCE(s.protein_target, 0),
      'carbs_target', COALESCE(s.carbs_target, 0),
      'fat_target', COALESCE(s.fat_target, 0),
      'weight_kg', COALESCE(s.weight_kg, 0),
      'logged_nutrition_days', COALESCE(n.logged_nutrition_days, 0),
      'avg_calories', ROUND(COALESCE(n.avg_calories, 0)),
      'workout_count', COALESCE(w.workout_count, 0),
      'checkin_count', COALESCE(c.checkin_count, 0),
      'avg_fatigue', c.avg_fatigue,
      'avg_energy', c.avg_energy,
      'weight_start_kg', wt.weight_start_kg,
      'weight_end_kg', wt.weight_end_kg,
      'weight_delta_kg', wt.weight_delta_kg,
      'weight_span_days', wt.weight_span_days,
      'weigh_ins', COALESCE(wt.weigh_ins, 0),
      'tracking', jsonb_build_object(
        'nutrition', true, 'workouts', true, 'weight', true, 'checkins', true
      ),
      'is_minor', (s.date_of_birth IS NOT NULL AND public.prometheus_calendar_age_years(s.date_of_birth) < 18),
      'has_medical_flags', public.prometheus_intake_has_medical_flags(COALESCE(s.kinesiology_intake, '{}'::jsonb))
    )
  FROM solos s
  LEFT JOIN nutrition_agg n ON n.user_id = s.athlete_id
  LEFT JOIN workout_agg w ON w.user_id = s.athlete_id
  LEFT JOIN checkin_agg c ON c.user_id = s.athlete_id
  LEFT JOIN weight_agg wt ON wt.user_id = s.athlete_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prometheus_write_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_athlete_decision_replay(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prometheus_record_stored_outbox(public.athlete_decision_outbox) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_athlete_decision_outbox(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_and_record_athlete_decision(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.drain_athlete_decision_outbox(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.triage_eligible_solo_weekly(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coach_intervention_queue_decision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_intervention(uuid, text, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prometheus_write_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_athlete_decision_replay(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prometheus_record_stored_outbox(public.athlete_decision_outbox)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_athlete_decision_outbox(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_and_record_athlete_decision(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drain_athlete_decision_outbox(integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.triage_eligible_solo_weekly(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_intervention(uuid, text, text, text, jsonb, jsonb, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.drain_athlete_decision_outbox(integer) IS
  'Idempotent outbox drain. Advisory lock then outbox row then journal. Author is the stored actor_id. Backoff + dead-letter after 8 failures. Never auto-applies programs or targets.';
COMMENT ON FUNCTION public.triage_eligible_solo_weekly(uuid) IS
  'Eligible Solo dossiers (no active coach). Bounded window, calendar age, PAR-Q medical flags. Server weekly loop; dashboard catch-up is optional.';
COMMENT ON FUNCTION public.record_athlete_decision_replay(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid) IS
  'Internal replay: writes the stored outbox author. Not granted to authenticated.';
COMMENT ON FUNCTION public.prometheus_record_stored_outbox(public.athlete_decision_outbox) IS
  'Internal reprise: journals the immutable stored outbox payload and actor_id. Not granted to authenticated.';
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
BEGIN
  RETURN public.commit_solo_weekly_review_decision(
    p_week_start, p_action, p_reason, p_proposed, p_evidence, p_decision,
    p_domain, p_type, p_proposal, p_why, p_data_used, p_applied_effect, NULL::text
  );
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
BEGIN
  RETURN public.record_athlete_decision(
    p_athlete_id, p_domain, p_type, p_decision, p_proposal, p_why,
    p_data_used, p_human_reason, p_applied_effect, p_source, p_source_id,
    NULL::text, NULL::uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_solo_weekly_review_decision(date, text, text, jsonb, jsonb, text, text, text, jsonb, text, jsonb, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_intervention(uuid, text, text, text, jsonb, jsonb, text) IS
  'D02 : applique les effets et journalise la décision dans la même transaction. idempotency_key = exactement une fois. Cible = auth.uid() ou is_coach_of.';
