-- P2.6 Vision 8.7: apply the accepted watch calorie draft (the engine's
-- already-minimum step). Candidate only: apply after merge, not as a restamp.
-- Audit: P2.5 journals accepted/modified/refused with applied_effect = {}.
-- Applying calories from the watch panel was hors-scope. This RPC writes
-- ONLY a complete CalorieDraft after a human accept, using the existing
-- Solo profile update (same columns as commit_solo) and Coach
-- coach_set_client_nutrition_targets. It is not a third apply engine: it
-- does not call commit_solo_weekly_review_decision, apply_intervention,
-- or rewrite programs / source measurements. No new table. No 14th Edge
-- Function. Accept still does not auto-apply. A Coaché cannot apply.

CREATE OR REPLACE FUNCTION public.prometheus_is_complete_calorie_draft(p_draft jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_cal numeric;
  v_pro numeric;
  v_carb numeric;
  v_fat numeric;
BEGIN
  IF p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object' THEN
    RETURN false;
  END IF;
  BEGIN
    v_cal := NULLIF(p_draft->>'calories', '')::numeric;
    v_pro := NULLIF(p_draft->>'protein', '')::numeric;
    v_carb := NULLIF(p_draft->>'carbs', '')::numeric;
    v_fat := NULLIF(p_draft->>'fat', '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  IF v_cal IS NULL OR v_pro IS NULL OR v_carb IS NULL OR v_fat IS NULL THEN
    RETURN false;
  END IF;
  IF v_cal < 800 OR v_cal > 8000 THEN
    RETURN false;
  END IF;
  IF v_pro <= 0 OR v_carb <= 0 OR v_fat <= 0 THEN
    RETURN false;
  END IF;
  RETURN abs((v_pro * 4) + (v_carb * 4) + (v_fat * 9) - v_cal) <= v_cal * 0.15;
END;
$$;

COMMENT ON FUNCTION public.prometheus_is_complete_calorie_draft(jsonb) IS
  'P2.6: complete CalorieDraft (calories 800–8000, macros > 0, kcal from macros within 15%). Internal.';

REVOKE ALL ON FUNCTION public.prometheus_is_complete_calorie_draft(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_athlete_watch_minimum(
  p_signal_id uuid,
  p_journal_id uuid,
  p_seen_proposal jsonb,
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
  v_prior public.athlete_decision_log;
  v_existing public.athlete_decision_log;
  v_review public.athlete_weekly_reviews;
  v_row public.athlete_decision_log;
  v_draft jsonb;
  v_effect jsonb;
  v_proposal jsonb;
  v_week text;
  v_key text;
  v_calories int;
  v_protein int;
  v_carbs int;
  v_fat int;
  v_why text := 'Application du minimum calorique accepté. Aucune réécriture de programme ni de mesures sources.';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_signal_id IS NULL THEN
    RAISE EXCEPTION 'signal_required';
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

  IF p_journal_id IS NULL THEN
    RAISE EXCEPTION 'no_prior_accept';
  END IF;
  IF jsonb_typeof(COALESCE(p_seen_proposal, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'stale_proposal';
  END IF;

  SELECT * INTO v_prior
  FROM public.athlete_decision_log
  WHERE id = p_journal_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_prior.athlete_id IS DISTINCT FROM v_signal.athlete_id
     OR v_prior.source_id IS DISTINCT FROM v_signal.id
     OR v_prior.source IS DISTINCT FROM 'prometheus_watch'
     OR v_prior.decision IS DISTINCT FROM 'accepted'
     OR COALESCE(v_prior.proposal->>'kind', '') IS DISTINCT FROM 'watch_proposal_decision' THEN
    RAISE EXCEPTION 'no_prior_accept';
  END IF;

  IF v_prior.proposal IS DISTINCT FROM COALESCE(p_seen_proposal, '{}'::jsonb) THEN
    RAISE EXCEPTION 'stale_proposal';
  END IF;

  v_week := NULLIF(trim(COALESCE(v_prior.proposal->>'week_start', '')), '');
  IF v_week IS NULL OR v_week !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'no_applicable_minimum';
  END IF;

  SELECT * INTO v_review
  FROM public.athlete_weekly_reviews
  WHERE athlete_id = v_signal.athlete_id
  ORDER BY week_start DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND
     OR v_review.week_start::text IS DISTINCT FROM v_week
     OR v_review.updated_at > v_prior.created_at THEN
    RAISE EXCEPTION 'stale_proposal';
  END IF;

  v_draft := v_prior.proposal->'draft';
  IF NOT public.prometheus_is_complete_calorie_draft(v_draft) THEN
    RAISE EXCEPTION 'no_applicable_minimum';
  END IF;

  v_calories := round((v_draft->>'calories')::numeric)::int;
  v_protein := round((v_draft->>'protein')::numeric)::int;
  v_carbs := round((v_draft->>'carbs')::numeric)::int;
  v_fat := round((v_draft->>'fat')::numeric)::int;
  v_effect := jsonb_build_object(
    'daily_calorie_target', v_calories,
    'protein_target', v_protein,
    'carbs_target', v_carbs,
    'fat_target', v_fat
  );
  v_proposal := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'watch_minimum_apply',
    'action', 'calorie_adjustment',
    'reason', NULLIF(trim(COALESCE(v_prior.proposal->>'reason', '')), ''),
    'domain', v_signal.domain,
    'type', v_signal.type,
    'week_start', v_week,
    'flag', NULLIF(trim(COALESCE(v_prior.proposal->>'flag', '')), ''),
    'draft', jsonb_build_object(
      'calories', v_calories,
      'protein', v_protein,
      'carbs', v_carbs,
      'fat', v_fat
    )
  ));

  SELECT * INTO v_existing
  FROM public.athlete_decision_log
  WHERE athlete_id = v_signal.athlete_id
    AND source = 'prometheus_watch'
    AND source_id = v_signal.id
    AND COALESCE(proposal->>'kind', '') = 'watch_minimum_apply'
    AND COALESCE(proposal->>'week_start', '') = v_week
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
        v_signal.domain, v_signal.type, 'accepted', v_proposal, v_why,
        COALESCE(v_prior.data_used, '{}'::jsonb), NULL, v_effect,
        'prometheus_watch', v_signal.id, v_existing.idempotency_key
      )
    ) THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  v_key := public.prometheus_decision_idempotency_key(
    v_signal.athlete_id,
    'watch-apply:' || v_signal.id::text || ':' || v_week,
    'prometheus_watch',
    v_signal.id,
    'accepted',
    v_signal.domain,
    v_signal.type
  );
  IF p_idempotency_key IS NOT NULL AND char_length(trim(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  IF v_uid = v_signal.athlete_id THEN
    UPDATE public.user_profiles
    SET
      daily_calorie_target = v_calories,
      protein_target = v_protein,
      carbs_target = v_carbs,
      fat_target = v_fat,
      updated_at = clock_timestamp()
    WHERE id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_persisted';
    END IF;
  ELSE
    PERFORM public.coach_set_client_nutrition_targets(
      v_signal.athlete_id,
      v_calories,
      v_protein,
      v_carbs,
      v_fat
    );
  END IF;

  v_row := public.queue_and_record_athlete_decision(
    v_key,
    v_signal.athlete_id,
    v_signal.domain,
    v_signal.type,
    'accepted',
    v_proposal,
    v_why,
    COALESCE(v_prior.data_used, '{}'::jsonb),
    NULL,
    v_effect,
    'prometheus_watch',
    v_signal.id
  );

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_persisted';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.apply_athlete_watch_minimum(uuid, uuid, jsonb, text) IS
  'P2.6 Vision 8.7: Solo (not coached) or the active Coach applies the complete calorie draft the human already accepted on the watch panel. Caller must send the exact P2.5 journal id + proposal they saw. A newer review is stale_proposal. Relance / incomplete draft is no_applicable_minimum. Writes only user_profiles calorie/macros (Coach via coach_set_client_nutrition_targets). Signal stays open. Never auto-applies. Never rewrites programs or source measurements. Workspace never grants this.';

REVOKE ALL ON FUNCTION public.apply_athlete_watch_minimum(uuid, uuid, jsonb, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.apply_athlete_watch_minimum(uuid, uuid, jsonb, text)
  TO authenticated, service_role;
