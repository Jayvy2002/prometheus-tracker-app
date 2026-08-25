-- Coaching copy phyuijjekxtjvipjtdfv only.
-- Sign onboarding pings with vault webhook secret (no secrets in git).
-- Unsigned POSTs are rejected by notify-onboarding-complete when the secret env is set.

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
