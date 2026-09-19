-- P2.5 watch-proposal decision. Candidate only: apply after merge, not as a restamp.
-- Audit: the watch panel could show a current engine proposal (review.decision =
-- propose + exact (domain, type) upsert) but the human could not accept / modify /
-- refuse it there. Durable calorie and program applies stay on their existing
-- human-gated RPCs. This function only journals Vision 8.6 context on the
-- current proposal, keeps the signal open, and never rewrites source rows.
-- No new table. No 14th Edge Function. Refuse is not a context correction.
--
-- A decidable proposal is the concrete snapshot stored on the review
-- signal_action (kind + action from the Solo/fleet engines). A generic
-- (domain, type) pair is not enough: without that object the RPC raises
-- no_current_proposal and the panel hides Accept / Modify / Refuse.
--
-- The decision is locked to the review id + updated_at + proposal + evidence
-- the human saw. Loading "the latest review at click time" is forbidden.
--
-- Also closes the Coaché hole on save_athlete_weekly_review: a coached athlete
-- cannot persist a strategic review (authority coach) on their own dossier.

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
    'weight_span_days', 'checkin_count', 'avg_fatigue', 'avg_energy', 'goal',
    'protein_target', 'carbs_target', 'fat_target', 'weight_kg'
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
    IF v_uid = p_athlete_id THEN
      IF public.actor_is_actively_coached() THEN
        RAISE EXCEPTION 'not_authorized';
      END IF;
    ELSIF NOT public.is_coach_of(p_athlete_id) THEN
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

COMMENT ON FUNCTION public.save_athlete_weekly_review(uuid, date, text, text, text, jsonb, jsonb, jsonb) IS
  'Persists one ISO-week review. Solo (not coached) may save their own dossier. A Coaché cannot. The active Coach or a service-role/backend caller may save a coached dossier. Authority is coach when an active coach_client_links row exists.';

DROP FUNCTION IF EXISTS public.decide_athlete_watch_proposal(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.decide_athlete_watch_proposal(
  p_signal_id uuid,
  p_decision text,
  p_human_reason text,
  p_idempotency_key text DEFAULT NULL,
  p_review_id uuid DEFAULT NULL,
  p_seen_updated_at timestamptz DEFAULT NULL,
  p_seen_proposal jsonb DEFAULT NULL,
  p_seen_evidence jsonb DEFAULT NULL
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_signal public.athlete_signals;
  v_review public.athlete_weekly_reviews;
  v_existing public.athlete_decision_log;
  v_row public.athlete_decision_log;
  v_decision text := NULLIF(trim(COALESCE(p_decision, '')), '');
  v_reason text := NULLIF(trim(COALESCE(p_human_reason, '')), '');
  v_key text;
  v_data jsonb;
  v_signal_data jsonb;
  v_seen jsonb;
  v_judged jsonb;
  v_proposal jsonb;
  v_why text := 'Décision humaine sur la proposition courante. Le signal reste ouvert. Aucune cible ni programme n''est écrit par cette décision.';
  v_proposes boolean := false;
  v_action jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_signal_id IS NULL THEN
    RAISE EXCEPTION 'signal_required';
  END IF;
  IF v_decision IS NULL OR v_decision NOT IN ('accepted', 'modified', 'refused') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF v_decision IN ('modified', 'refused') THEN
    IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'invalid_reason';
    END IF;
  ELSIF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  SELECT * INTO v_signal
  FROM public.athlete_signals
  WHERE id = p_signal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_signal.status <> 'open' THEN
    RAISE EXCEPTION 'no_current_proposal';
  END IF;

  IF v_uid = v_signal.athlete_id THEN
    IF public.actor_is_actively_coached() THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  ELSIF NOT public.is_coach_of(v_signal.athlete_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_review
  FROM public.athlete_weekly_reviews
  WHERE athlete_id = v_signal.athlete_id
  ORDER BY week_start DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_review.decision <> 'propose' THEN
    RAISE EXCEPTION 'no_current_proposal';
  END IF;

  FOR v_action IN SELECT value FROM jsonb_array_elements(COALESCE(v_review.signal_actions, '[]'::jsonb))
  LOOP
    IF jsonb_typeof(v_action) <> 'object' THEN
      CONTINUE;
    END IF;
    IF v_action->>'op' = 'upsert'
       AND v_action->>'domain' = v_signal.domain
       AND v_action->>'type' = v_signal.type
       AND v_action->>'status' = 'open'
       AND v_action->>'confidence' IN ('medium', 'high') THEN
      v_proposes := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_proposes THEN
    RAISE EXCEPTION 'no_current_proposal';
  END IF;

  v_judged := COALESCE(v_action->'proposal', '{}'::jsonb);
  IF jsonb_typeof(v_judged) <> 'object'
     OR COALESCE(NULLIF(trim(v_judged->>'kind'), ''), '') = ''
     OR COALESCE(NULLIF(trim(v_judged->>'action'), ''), '') = ''
     OR v_judged->>'action' IN ('accepted', 'modified', 'refused', 'ignored', 'corrected') THEN
    RAISE EXCEPTION 'no_current_proposal';
  END IF;

  IF p_review_id IS NULL
     OR p_seen_updated_at IS NULL
     OR jsonb_typeof(COALESCE(p_seen_proposal, 'null'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_seen_evidence, 'null'::jsonb)) <> 'object'
     OR v_review.id IS DISTINCT FROM p_review_id
     OR v_review.updated_at IS DISTINCT FROM p_seen_updated_at
     OR v_judged IS DISTINCT FROM COALESCE(p_seen_proposal, '{}'::jsonb) THEN
    RAISE EXCEPTION 'stale_proposal';
  END IF;

  v_data := public.prometheus_watch_signal_data_used(COALESCE(v_action->'evidence_for', '[]'::jsonb));
  v_seen := public.prometheus_watch_signal_data_used(
    jsonb_build_array(
      jsonb_build_object('kind', 'fingerprint', 'summary', COALESCE(p_seen_evidence, '{}'::jsonb)::text)
    )
  );
  IF (COALESCE(v_data, '{}'::jsonb) - 'window_start' - 'window_end')
     IS DISTINCT FROM (COALESCE(v_seen, '{}'::jsonb) - 'window_start' - 'window_end') THEN
    RAISE EXCEPTION 'stale_proposal';
  END IF;

  v_proposal := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'watch_proposal_decision',
    'action', v_judged->>'action',
    'reason', NULLIF(trim(COALESCE(v_judged->>'reason', '')), ''),
    'domain', v_signal.domain,
    'type', v_signal.type,
    'week_start', v_review.week_start::text,
    'flag', NULLIF(trim(COALESCE(v_judged->>'flag', '')), ''),
    'title', NULLIF(trim(COALESCE(v_judged->>'title', '')), ''),
    'rationale', NULLIF(trim(COALESCE(v_judged->>'rationale', '')), ''),
    'draft', CASE
      WHEN jsonb_typeof(v_judged->'draft') = 'object' THEN v_judged->'draft'
      ELSE NULL
    END
  ));

  SELECT * INTO v_existing
  FROM public.athlete_decision_log
  WHERE athlete_id = v_signal.athlete_id
    AND source = 'prometheus_watch'
    AND source_id = v_signal.id
    AND COALESCE(proposal->>'kind', '') = 'watch_proposal_decision'
    AND COALESCE(proposal->>'week_start', '') = v_review.week_start::text
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF public.prometheus_outbox_intents_equal(
      public.prometheus_decision_outbox_payload(
        v_existing.domain, v_existing.type, v_existing.decision, v_existing.proposal, v_existing.why,
        COALESCE(v_existing.data_used, '{}'::jsonb), v_existing.human_reason, v_existing.applied_effect,
        v_existing.source, v_existing.source_id, v_existing.idempotency_key
      ),
      public.prometheus_decision_outbox_payload(
        v_signal.domain, v_signal.type, v_decision, v_proposal, v_why,
        v_data, v_reason, '{}'::jsonb,
        'prometheus_watch', v_signal.id, v_existing.idempotency_key
      )
    ) THEN
      RETURN v_existing;
    END IF;
    IF v_existing.decision IS DISTINCT FROM v_decision THEN
      RAISE EXCEPTION 'already_decided';
    END IF;
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  v_signal_data := public.prometheus_watch_signal_data_used(v_signal.evidence_for);
  IF (COALESCE(v_data, '{}'::jsonb) - 'window_start' - 'window_end')
     IS DISTINCT FROM (COALESCE(v_signal_data, '{}'::jsonb) - 'window_start' - 'window_end') THEN
    RAISE EXCEPTION 'stale_proposal';
  END IF;

  -- Unique per (signal, decision, ISO week). The same open signal must be
  -- journalable again after a later proposing review; a client key without
  -- week_start would collide on athlete_decision_outbox and silently return
  -- the previous week's row.
  v_key := public.prometheus_decision_idempotency_key(
    v_signal.athlete_id,
    'watch-decide:' || v_signal.id::text || ':' || v_decision || ':' || v_review.week_start::text,
    'prometheus_watch',
    v_signal.id,
    v_decision,
    v_signal.domain,
    v_signal.type
  );
  IF p_idempotency_key IS NOT NULL AND char_length(trim(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  v_row := public.queue_and_record_athlete_decision(
    v_key,
    v_signal.athlete_id,
    v_signal.domain,
    v_signal.type,
    v_decision,
    v_proposal,
    v_why,
    v_data,
    v_reason,
    '{}'::jsonb,
    'prometheus_watch',
    v_signal.id
  );

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_persisted';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.decide_athlete_watch_proposal(uuid, text, text, text, uuid, timestamptz, jsonb, jsonb) IS
  'P2.5 Vision 8.6: Solo (not coached) or the active Coach journals accepted/modified/refused on the concrete watch proposal snapshotted on the current review signal_action. Caller must send the exact review id/updated_at + judged proposal + evidence fingerprint they saw. A newer review or a moved fingerprint is stale_proposal. data_used comes from that action. Identical payload is idempotent; a different reason is idempotency_conflict. Signal stays open. Never auto-applies. Never rewrites source measurements. Workspace never grants this.';

REVOKE ALL ON FUNCTION public.decide_athlete_watch_proposal(uuid, text, text, text, uuid, timestamptz, jsonb, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.decide_athlete_watch_proposal(uuid, text, text, text, uuid, timestamptz, jsonb, jsonb)
  TO authenticated, service_role;
