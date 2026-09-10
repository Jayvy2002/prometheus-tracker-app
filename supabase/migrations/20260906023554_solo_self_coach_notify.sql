-- Dump prod (CREATE OR REPLACE). Déjà applied. Ne pas rejouer en prod.
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
