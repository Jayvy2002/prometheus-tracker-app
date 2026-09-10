-- Dump prod (CREATE OR REPLACE). Déjà applied. Ne pas rejouer en prod.
CREATE OR REPLACE FUNCTION public.upsert_coach_intervention(
  p_coach_id uuid,
  p_client_id uuid,
  p_kind text,
  p_rationale text,
  p_payload jsonb,
  p_title text DEFAULT NULL,
  p_source text DEFAULT 'agent'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source text := COALESCE(NULLIF(trim(p_source), ''), 'agent');
  v_prev_payload jsonb;
  v_handled_at timestamptz;
  v_self boolean := (p_coach_id IS NOT NULL AND p_coach_id IS NOT DISTINCT FROM p_client_id);
BEGIN
  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'coach_id is required';
  END IF;
  IF v_source NOT IN ('second', 'fleet', 'prometheus_local', 'agent') THEN
    v_source := 'agent';
  END IF;
  IF p_kind IN (
       'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
       'adherence_nutrition', 'adherence_training', 'keep_in_touch'
     )
     AND p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
    'adherence_nutrition', 'adherence_training', 'keep_in_touch',
    'workflow_improvement', 'new_question', 'other',
    'ask_prometheus', 'program_nl_edit'
  ) THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object';
  END IF;

  IF v_self THEN
    IF EXISTS (
      SELECT 1 FROM public.coach_client_links
      WHERE client_id = p_client_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Coached athletes cannot self-coach';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_client_id AND coaching_role = 'client'
    ) THEN
      RAISE EXCEPTION 'Coached athletes cannot self-coach';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_coach_id THEN
      RAISE EXCEPTION 'Not this client''s coach';
    END IF;
  ELSIF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> p_coach_id THEN
      RAISE EXCEPTION 'Not this client''s coach';
    END IF;
    IF p_client_id IS NOT NULL AND NOT public.is_coach_of(p_client_id) THEN
      RAISE EXCEPTION 'Not this client''s coach';
    END IF;
  ELSIF p_client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.coach_client_links
      WHERE coach_id = p_coach_id
        AND client_id = p_client_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Client is not linked to this coach';
    END IF;
  END IF;

  -- Fleet: refresh pending in place. Never reopen sent/dismissed/kept.
  IF v_source = 'fleet' AND p_client_id IS NOT NULL THEN
    UPDATE public.coach_interventions
    SET
      kind = p_kind,
      title = p_title,
      rationale = COALESCE(p_rationale, ''),
      payload = p_payload,
      source = 'fleet',
      updated_at = now(),
      resolved_at = NULL
    WHERE coach_id = p_coach_id
      AND client_id = p_client_id
      AND source = 'fleet'
      AND status = 'pending'
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    SELECT payload, COALESCE(resolved_at, updated_at)
      INTO v_prev_payload, v_handled_at
    FROM public.coach_interventions
    WHERE coach_id = p_coach_id
      AND client_id = p_client_id
      AND kind = p_kind
      AND COALESCE(payload->>'flag', kind) = COALESCE(p_payload->>'flag', p_kind)
      AND status IN ('sent', 'dismissed', 'kept')
    ORDER BY COALESCE(resolved_at, updated_at) DESC NULLS LAST
    LIMIT 1;

    IF v_handled_at IS NOT NULL
       AND v_handled_at >= (now() - interval '7 days')
       AND NOT public.fleet_evidence_changed(v_prev_payload, p_payload) THEN
      RETURN NULL;
    END IF;
  END IF;

  IF p_kind IN ('onboarding_plan', 'ask_prometheus', 'program_nl_edit') AND v_source <> 'fleet' THEN
    UPDATE public.coach_interventions
    SET
      title = p_title,
      rationale = COALESCE(p_rationale, ''),
      payload = p_payload,
      source = v_source,
      updated_at = now(),
      resolved_at = NULL
    WHERE coach_id = p_coach_id
      AND client_id IS NOT DISTINCT FROM p_client_id
      AND kind = p_kind
      AND status = 'pending'
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.coach_interventions (
    coach_id, client_id, kind, title, rationale, payload, status, source, updated_at
  )
  VALUES (
    p_coach_id, p_client_id, p_kind, p_title, COALESCE(p_rationale, ''),
    p_payload, 'pending', v_source, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_coach_intervention(uuid, uuid, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_coach_intervention(uuid, uuid, text, text, jsonb, text, text) TO authenticated, service_role;

