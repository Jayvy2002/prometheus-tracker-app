-- Solo living program (VISION chantier 1 lot C): the same coach-agent engine,
-- with coach_id = client_id = the solo. Do NOT make is_coach_of(self) true —
-- a coach would then appear as their own client on the roster.
-- Coaching copy: phyuijjekxtjvipjtdfv.

-- 1. Allow self-rows on coach_interventions (was CHECK coach_id <> client_id)
DO $drop$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.coach_interventions'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%coach_id%client_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.coach_interventions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$drop$;

-- 2. Predicate: the caller is a solo (role none, no active coach link). Coaches and
--    coached athletes stay out — they must not read/write self-coach drafts.
CREATE OR REPLACE FUNCTION public.is_self_coach()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (select auth.uid()) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.coach_client_links
      WHERE client_id = (select auth.uid()) AND status = 'active'
    )
    AND COALESCE(
      (SELECT coaching_role FROM public.user_roles WHERE user_id = (select auth.uid())),
      'none'
    ) = 'none';
$$;

REVOKE ALL ON FUNCTION public.is_self_coach() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_self_coach() TO authenticated, service_role;

-- 3. RLS: the solo reads/updates drafts where they are both coach and client.
DROP POLICY IF EXISTS "Self-coach manage own interventions" ON public.coach_interventions;
CREATE POLICY "Self-coach manage own interventions"
  ON public.coach_interventions FOR ALL TO authenticated
  USING (
    coach_id = (select auth.uid())
    AND client_id = (select auth.uid())
    AND public.is_self_coach()
  )
  WITH CHECK (
    coach_id = (select auth.uid())
    AND client_id = (select auth.uid())
    AND public.is_self_coach()
  );

-- 4. upsert_coach_intervention: service_role (notify / agent) and JWT self-coach
--    may write coach_id = client_id when the person is not a coached athlete.
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

-- 5. Intake complete → ping the agent for solos too (coach_id = the athlete).
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
  v_locale text := 'fr';
BEGIN
  SELECT ccl.coach_id
    INTO v_coach_id
  FROM public.coach_client_links ccl
  WHERE ccl.client_id = NEW.id
    AND ccl.status = 'active'
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    -- Solo: they are their own coach. Coaches / leftover client-role rows skip.
    IF EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.id AND coaching_role IN ('coach', 'client')
    ) THEN
      RETURN NEW;
    END IF;
    v_coach_id := NEW.id;
  END IF;

  BEGIN
    v_locale := CASE
      WHEN COALESCE(NEW.language, '') ILIKE 'en%' THEN 'en'
      ELSE 'fr'
    END;
  EXCEPTION WHEN undefined_column THEN
    v_locale := 'fr';
  END;

  BEGIN
    SELECT ds.decrypted_secret
      INTO v_invoke_key
    FROM vault.decrypted_secrets ds
    WHERE ds.name = ANY (ARRAY[
      'grok_bot_webhook_secret',
      'GROK_BOT_WEBHOOK_SECRET',
      'notify_secret',
      'NOTIFY_SECRET',
      'functions_invoke_key',
      'anon_key',
      'supabase_anon_key',
      'SUPABASE_ANON_KEY'
    ])
    ORDER BY array_position(
      ARRAY[
        'grok_bot_webhook_secret',
        'GROK_BOT_WEBHOOK_SECRET',
        'notify_secret',
        'NOTIFY_SECRET',
        'functions_invoke_key',
        'anon_key',
        'supabase_anon_key',
        'SUPABASE_ANON_KEY'
      ],
      ds.name
    )
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_invoke_key := NULL;
  END;

  IF v_invoke_key IS NOT NULL AND length(v_invoke_key) > 0 THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || v_invoke_key,
      'X-Webhook-Key', v_invoke_key,
      'X-Sender-Key', v_invoke_key
    );
  END IF;

  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE WARNING 'notify_onboarding_complete: pg_net missing, skip ping';
    RETURN NEW;
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
      'kind', 'onboarding_plan',
      'locale', v_locale,
      'self_coach', v_coach_id = NEW.id
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

NOTIFY pgrst, 'reload schema';
