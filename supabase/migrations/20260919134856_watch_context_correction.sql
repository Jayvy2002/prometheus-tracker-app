-- P2.4 context correction. Candidate only: apply after merge, not as a restamp.
-- Audit: resolve_athlete_signal closes a row but the next weekly review re-upserts
-- known engine types, so a human “not relevant / incorrect” did not stop the old
-- interpretation from driving the following analysis. record_athlete_decision
-- already stores refused/ignored (proposal memory) but has no corrected value
-- and is not atomic with resolve. This migration adds `corrected` to the journal
-- CHECK + payload assert, and one SECURITY DEFINER RPC that resolves the open
-- signal as not_relevant and appends a corrected journal row in the same
-- transaction. No new table. Never rewrites nutrition/workout/weight/program
-- source rows. No 14th Edge Function.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'athlete_decision_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%accepted%'
      AND pg_get_constraintdef(con.oid) LIKE '%ignored%'
      AND pg_get_constraintdef(con.oid) NOT LIKE '%applied_effect%'
      AND pg_get_constraintdef(con.oid) NOT LIKE '%corrected%'
  LOOP
    EXECUTE format('ALTER TABLE public.athlete_decision_log DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.athlete_decision_log
  ADD CONSTRAINT athlete_decision_log_decision_check
  CHECK (decision IN ('accepted', 'modified', 'refused', 'ignored', 'corrected'));

COMMENT ON COLUMN public.athlete_decision_log.decision IS
  'accepted | modified | refused | ignored | corrected. Refused/ignored/corrected require empty applied_effect. corrected = watch-context correction (Vision 8.5); it does not rewrite source measurements.';

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
  IF p_decision IS NULL OR p_decision NOT IN (
    'accepted', 'modified', 'refused', 'ignored', 'corrected'
  ) THEN
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
  IF p_decision IN ('refused', 'ignored', 'corrected') AND v_effect <> '{}'::jsonb THEN
    RAISE EXCEPTION 'applied_effect_forbidden';
  END IF;
  IF v_key IS NOT NULL AND char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prometheus_watch_signal_data_used(p_evidence jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_fp jsonb := '{}'::jsonb;
  v_data jsonb := '{}'::jsonb;
  v_window text;
  v_key text;
  v_allowed text[] := ARRAY[
    'avg_calories', 'calorie_target', 'target_avg_kcal', 'workout_count',
    'logged_nutrition_days', 'weight_delta_kg', 'expected_workouts', 'weigh_ins',
    'avg_fatigue', 'avg_energy', 'window_start', 'window_end', 'checkin_count', 'goal'
  ];
BEGIN
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' THEN
    RETURN '{}'::jsonb;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_evidence)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      CONTINUE;
    END IF;
    IF v_item->>'kind' = 'fingerprint' THEN
      BEGIN
        v_fp := (v_item->>'summary')::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_fp := '{}'::jsonb;
      END;
    ELSIF v_item->>'kind' = 'window' THEN
      v_window := v_item->>'summary';
    END IF;
  END LOOP;

  IF jsonb_typeof(v_fp) = 'object' THEN
    FOREACH v_key IN ARRAY v_allowed LOOP
      IF v_fp ? v_key AND v_fp->v_key IS NOT NULL AND jsonb_typeof(v_fp->v_key) <> 'null' THEN
        v_data := v_data || jsonb_build_object(v_key, v_fp->v_key);
      END IF;
    END LOOP;
  END IF;

  IF v_window IS NOT NULL AND v_window ~ '^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$' THEN
    v_data := v_data || jsonb_build_object(
      'window_start', split_part(v_window, '..', 1),
      'window_end', split_part(v_window, '..', 2)
    );
  END IF;

  RETURN v_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_athlete_watch_context(
  p_signal_id uuid,
  p_action text,
  p_human_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_signal public.athlete_signals;
  v_row public.athlete_decision_log;
  v_reason text := NULLIF(trim(COALESCE(p_human_reason, '')), '');
  v_action text := NULLIF(trim(COALESCE(p_action, '')), '');
  v_key text;
  v_data jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_signal_id IS NULL THEN
    RAISE EXCEPTION 'signal_required';
  END IF;
  IF v_action IS NULL OR v_action NOT IN ('not_relevant', 'corrected') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  SELECT * INTO v_signal
  FROM public.athlete_signals
  WHERE id = p_signal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_uid = v_signal.athlete_id THEN
    IF public.actor_is_actively_coached() THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  ELSIF NOT public.is_coach_of(v_signal.athlete_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_key := public.prometheus_decision_idempotency_key(
    v_signal.athlete_id,
    p_idempotency_key,
    'prometheus_watch',
    v_signal.id,
    'corrected',
    v_signal.domain,
    v_signal.type
  );

  IF v_signal.status IN ('resolved', 'not_relevant') THEN
    SELECT * INTO v_row
    FROM public.athlete_decision_log
    WHERE athlete_id = v_signal.athlete_id
      AND source = 'prometheus_watch'
      AND source_id = v_signal.id
      AND decision = 'corrected'
    ORDER BY created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'already_closed';
    END IF;
    -- Identical replay (same action + reason) is idempotent. A different
    -- payload must not silently return the previous journal.
    IF COALESCE(v_row.proposal->>'action', '') IS NOT DISTINCT FROM v_action
       AND COALESCE(v_row.human_reason, '') IS NOT DISTINCT FROM v_reason THEN
      RETURN v_row;
    END IF;
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  v_data := public.prometheus_watch_signal_data_used(v_signal.evidence_for);

  PERFORM public.resolve_athlete_signal(v_signal.id, 'not_relevant', v_reason);

  v_row := public.queue_and_record_athlete_decision(
    v_key,
    v_signal.athlete_id,
    v_signal.domain,
    v_signal.type,
    'corrected',
    jsonb_build_object(
      'kind', 'watch_context_correction',
      'action', v_action,
      'domain', v_signal.domain,
      'type', v_signal.type
    ),
    'Correction de contexte : l''ancienne interprétation ne doit plus conduire la revue suivante tant que les preuves n''ont pas changé.',
    v_data,
    v_reason,
    '{}'::jsonb,
    'prometheus_watch',
    v_signal.id
  );

  -- queue_and_record swallows a journal error, keeps the outbox, and returns
  -- NULL. Raise so resolve + enqueue roll back with the caller transaction.
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_persisted';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.correct_athlete_watch_context(uuid, text, text, text) IS
  'P2.4 Vision 8.5: Solo (not coached) or the active Coach closes an open watch signal as not_relevant and appends a corrected journal row. Atomic: a missing journal raises not_persisted and rolls back the resolve. Identical replay is idempotent; a different action or reason is idempotency_conflict. Never auto-applies. Never rewrites source measurements. Workspace never grants this.';

REVOKE ALL ON FUNCTION public.prometheus_watch_signal_data_used(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.correct_athlete_watch_context(uuid, text, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.prometheus_watch_signal_data_used(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.correct_athlete_watch_context(uuid, text, text, text)
  TO authenticated, service_role;
