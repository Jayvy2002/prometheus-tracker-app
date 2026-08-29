-- Second as the only copilot: extra kinds + Realtime for live drafts.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to the live / backup project.
-- Coach UI pings via ask-second (JWT). Second writes pending drafts; coach confirms.

ALTER TABLE coach_interventions DROP CONSTRAINT IF EXISTS coach_interventions_kind_check;
ALTER TABLE coach_interventions ADD CONSTRAINT coach_interventions_kind_check
  CHECK (kind IN (
    'onboarding_plan',
    'calorie_adjustment',
    'program_adjustment',
    'adherence_nutrition',
    'adherence_training',
    'workflow_improvement',
    'new_question',
    'other',
    'ask_prometheus',
    'program_nl_edit'
  ));

DROP INDEX IF EXISTS coach_interventions_one_pending_onboarding;
CREATE UNIQUE INDEX IF NOT EXISTS coach_interventions_one_pending_second_job
  ON coach_interventions (
    coach_id,
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind
  )
  WHERE status = 'pending'
    AND kind IN ('onboarding_plan', 'ask_prometheus', 'program_nl_edit');

ALTER TABLE coach_interventions REPLICA IDENTITY FULL;
ALTER TABLE product_requests REPLICA IDENTITY FULL;
ALTER TABLE exercise_requests REPLICA IDENTITY FULL;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE coach_interventions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip coach_interventions';
END;
$pub$;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE product_requests;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip product_requests';
END;
$pub$;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE exercise_requests;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip exercise_requests';
END;
$pub$;

CREATE OR REPLACE FUNCTION public.upsert_coach_intervention(
  p_coach_id uuid,
  p_client_id uuid,
  p_kind text,
  p_rationale text,
  p_payload jsonb,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'coach_id is required';
  END IF;
  IF p_kind IN (
       'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
       'adherence_nutrition', 'adherence_training'
     )
     AND p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
    'adherence_nutrition', 'adherence_training',
    'workflow_improvement', 'new_question', 'other',
    'ask_prometheus', 'program_nl_edit'
  ) THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object';
  END IF;

  IF auth.uid() IS NOT NULL THEN
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

  IF p_kind IN ('onboarding_plan', 'ask_prometheus', 'program_nl_edit') THEN
    UPDATE public.coach_interventions
    SET
      title = p_title,
      rationale = COALESCE(p_rationale, ''),
      payload = p_payload,
      source = 'second',
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
    p_payload, 'pending', 'second', now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_coach_intervention(uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_coach_intervention(uuid, uuid, text, text, jsonb, text) TO authenticated, service_role;
