-- Nightly in-app fleet round on the coaching copy only (phyuijjekxtjvipjtdfv).
-- Architecture lock 2026-08-29: no Grok Bots / no Second ping.
-- Do not apply to backup nebysjpqifqphvmveowe. Secret stays in vault, never git.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_coach_fleet_round()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_req_id bigint;
BEGIN
  BEGIN
    SELECT ds.decrypted_secret
      INTO v_key
    FROM vault.decrypted_secrets ds
    WHERE ds.name = ANY (ARRAY[
      'FLEET_CRON_SECRET',
      'GROK_BOT_WEBHOOK_SECRET',
      'grok_bot_webhook_secret'
    ])
    ORDER BY array_position(
      ARRAY[
        'FLEET_CRON_SECRET',
        'GROK_BOT_WEBHOOK_SECRET',
        'grok_bot_webhook_secret'
      ],
      ds.name
    )
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE WARNING 'coach-fleet-round: no vault secret, skip cron invoke';
    RETURN NULL;
  END IF;

  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE WARNING 'coach-fleet-round: pg_net missing, skip cron invoke';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://phyuijjekxtjvipjtdfv.supabase.co/functions/v1/coach-fleet-round',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'X-Webhook-Key', v_key
    ),
    body := jsonb_build_object('trigger', 'cron')
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_coach_fleet_round() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_coach_fleet_round() TO postgres, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'coach-fleet-round') THEN
    PERFORM cron.unschedule('coach-fleet-round');
  END IF;
  PERFORM cron.schedule(
    'coach-fleet-round',
    '0 4 * * *',
    'SELECT public.invoke_coach_fleet_round();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'coach-fleet-round cron not scheduled (%); enable pg_cron then re-run', SQLERRM;
END;
$$;
