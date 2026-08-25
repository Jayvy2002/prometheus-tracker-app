-- Coach intervention inbox + onboarding-complete ping to Second (Grok Bot).
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to the backup project.
-- GROK_BOT_WEBHOOK_URL / GROK_BOT_WEBHOOK_SECRET are Edge Function secrets, not SQL.
-- Second (assistant-coach) may insert drafts; the head coach can also create everything by hand.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS coach_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'onboarding_plan',
    'calorie_adjustment',
    'program_adjustment',
    'adherence_nutrition',
    'adherence_training',
    'workflow_improvement',
    'new_question',
    'other'
  )),
  title text,
  rationale text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'dismissed', 'kept')),
  source text NOT NULL DEFAULT 'second',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (client_id IS NULL OR coach_id <> client_id)
);

CREATE INDEX IF NOT EXISTS coach_interventions_coach_pending_idx
  ON coach_interventions (coach_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS coach_interventions_client_idx
  ON coach_interventions (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS coach_interventions_one_pending_onboarding
  ON coach_interventions (coach_id, client_id)
  WHERE kind = 'onboarding_plan' AND status = 'pending';

ALTER TABLE coach_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches read interventions for their clients" ON coach_interventions;
CREATE POLICY "Coaches read interventions for their clients"
  ON coach_interventions FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()) AND (client_id IS NULL OR public.is_coach_of(client_id)));

DROP POLICY IF EXISTS "Coaches update interventions for their clients" ON coach_interventions;
CREATE POLICY "Coaches update interventions for their clients"
  ON coach_interventions FOR UPDATE TO authenticated
  USING (coach_id = (select auth.uid()) AND public.is_coach_of(client_id))
  WITH CHECK (coach_id = (select auth.uid()) AND (client_id IS NULL OR public.is_coach_of(client_id)));

GRANT SELECT, UPDATE ON TABLE coach_interventions TO authenticated;

-- Second writes via project SQL (postgres / service_role, RLS bypassed).
-- Authenticated coaches may upsert only when is_coach_of.
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
  IF p_kind IN ('onboarding_plan', 'calorie_adjustment', 'program_adjustment', 'adherence_nutrition', 'adherence_training')
     AND p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
    'adherence_nutrition', 'adherence_training',
    'workflow_improvement', 'new_question', 'other'
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

  IF p_kind = 'onboarding_plan' THEN
    UPDATE public.coach_interventions
    SET
      title = p_title,
      rationale = COALESCE(p_rationale, ''),
      payload = p_payload,
      source = 'second',
      updated_at = now(),
      resolved_at = NULL
    WHERE coach_id = p_coach_id
      AND client_id = p_client_id
      AND kind = 'onboarding_plan'
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

-- AFTER UPDATE on user_profiles.onboarding_completed → edge function
-- (table is user_profiles; coaching links are coach_client_links).
-- verify_jwt is false on notify-onboarding-complete; never bake service_role into git.
CREATE OR REPLACE FUNCTION public.notify_onboarding_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
  v_invoke_key text;
BEGIN
  SELECT ccl.coach_id
    INTO v_coach_id
  FROM public.coach_client_links ccl
  WHERE ccl.client_id = NEW.id
    AND ccl.status = 'active'
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT ds.decrypted_secret
      INTO v_invoke_key
    FROM vault.decrypted_secrets ds
    WHERE ds.name = ANY (ARRAY[
      'functions_invoke_key',
      'anon_key',
      'supabase_anon_key',
      'SUPABASE_ANON_KEY'
    ])
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_invoke_key := NULL;
  END;

  IF v_invoke_key IS NOT NULL AND length(v_invoke_key) > 0 THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || v_invoke_key,
      'apikey', v_invoke_key
    );
  END IF;

  PERFORM net.http_post(
    url := 'https://phyuijjekxtjvipjtdfv.supabase.co/functions/v1/notify-onboarding-complete',
    headers := v_headers,
    body := jsonb_build_object(
      'user_id', NEW.id,
      'coach_id', v_coach_id,
      'full_name', NEW.full_name,
      'goal', NEW.goal,
      'training_frequency', NEW.training_frequency,
      'training_focus', NEW.training_focus,
      'injuries_limitations', NEW.injuries_limitations,
      'onboarding_completed', true,
      'kind', 'onboarding_plan'
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_onboarding_complete: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_onboarding_complete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_onboarding_complete ON public.user_profiles;
CREATE TRIGGER trg_notify_onboarding_complete
  AFTER UPDATE OF onboarding_completed ON public.user_profiles
  FOR EACH ROW
  WHEN (NEW.onboarding_completed = true AND OLD.onboarding_completed IS DISTINCT FROM true)
  EXECUTE FUNCTION public.notify_onboarding_complete();
