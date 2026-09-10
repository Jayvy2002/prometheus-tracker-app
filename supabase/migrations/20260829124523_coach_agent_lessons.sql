-- In-app coach agent memory + source=agent.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to backup nebysjpqifqphvmveowe or live.
-- When a coach edits a proposal then sends/keeps it, store the diff so the next
-- coach-agent call can learn THIS coach's patterns (tone, Relancer vs targets, macros).

-- ============================================================
-- Lessons (per coach, never shared)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coach_agent_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  proposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  intervention_id uuid REFERENCES public.coach_interventions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_agent_lessons_coach_idx
  ON public.coach_agent_lessons (coach_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_agent_lessons_coach_kind_idx
  ON public.coach_agent_lessons (coach_id, kind, created_at DESC);

ALTER TABLE public.coach_agent_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches read own agent lessons" ON public.coach_agent_lessons;
CREATE POLICY "Coaches read own agent lessons"
  ON public.coach_agent_lessons FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()));

DROP POLICY IF EXISTS "Coaches insert own agent lessons" ON public.coach_agent_lessons;
CREATE POLICY "Coaches insert own agent lessons"
  ON public.coach_agent_lessons FOR INSERT TO authenticated
  WITH CHECK (coach_id = (select auth.uid()));

GRANT SELECT, INSERT ON TABLE public.coach_agent_lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_agent_lessons TO service_role;

-- ============================================================
-- Fingerprint of the editable proposal (ignore meta / drafting keys)
-- ============================================================
CREATE OR REPLACE FUNCTION public.coach_agent_payload_fingerprint(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'answer', p->'answer',
    'notes', p->'notes',
    'body', p->'body',
    'suggestion', p->'suggestion',
    'observation', p->'observation',
    'cause', p->'cause',
    'program', p->'program',
    'tracking', p->'tracking',
    'patch', p->'patch',
    'nutrition', p->'nutrition',
    'calories', p->'calories',
    'protein', p->'protein',
    'carbs', p->'carbs',
    'fat', p->'fat'
  ));
$$;

-- ============================================================
-- On send/keep of an edited draft, persist a lesson for THIS coach
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_coach_agent_lesson_from_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposed jsonb;
  v_accepted jsonb;
BEGIN
  IF NEW.status NOT IN ('sent', 'kept') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  v_proposed := public.coach_agent_payload_fingerprint(
    COALESCE(OLD.payload->'agent_proposed', OLD.payload)
  );
  v_accepted := public.coach_agent_payload_fingerprint(NEW.payload);

  IF v_proposed = '{}'::jsonb AND v_accepted = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF v_proposed IS NOT DISTINCT FROM v_accepted THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.coach_agent_lessons (
    coach_id, kind, proposed, accepted, intervention_id
  ) VALUES (
    NEW.coach_id,
    NEW.kind,
    v_proposed,
    v_accepted,
    NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'record_coach_agent_lesson_from_send: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coach_agent_lesson_from_send() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_coach_agent_lesson ON public.coach_interventions;
CREATE TRIGGER trg_record_coach_agent_lesson
  AFTER UPDATE OF status, payload ON public.coach_interventions
  FOR EACH ROW
  WHEN (NEW.status IN ('sent', 'kept') AND OLD.status = 'pending')
  EXECUTE FUNCTION public.record_coach_agent_lesson_from_send();

-- ============================================================
-- upsert_coach_intervention: allow source=agent
-- ============================================================
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
BEGIN
  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'coach_id is required';
  END IF;
  IF v_source NOT IN ('second', 'fleet', 'prometheus_local', 'agent') THEN
    v_source := 'agent';
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
