-- Schedule in-app coach-fleet-round via pg_cron + pg_net + vault.
-- Architecture lock: no Grok Bots. This cron is NOT a Second ping.
-- Auth: vault FLEET_CRON_SECRET only (no GROK_BOT_WEBHOOK_SECRET fallback).
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to backup nebysjpqifqphvmveowe.
-- Never bake SERVICE_ROLE_KEY in git. The invoke function reads vault at runtime.
--
-- 1. pg_cron + pg_net enabled (coaching copy already has both).
-- 2. Edge Function coach-fleet-round: set FLEET_CRON_SECRET to the same vault value.
-- 3. Nightly 04:00 UTC. JWT is used for the in-app « Lancer la tournée » button.
--    Never POST GROK_BOT_WEBHOOK_URL.

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
    WHERE ds.name = 'FLEET_CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE WARNING 'coach-fleet-round: no FLEET_CRON_SECRET in vault, skip cron invoke';
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

COMMENT ON FUNCTION public.invoke_coach_fleet_round() IS
  'Nightly pg_cron invoke of in-app coach-fleet-round. Auth via vault FLEET_CRON_SECRET only.';

SELECT cron.unschedule('coach-fleet-round')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'coach-fleet-round'
);

SELECT cron.schedule(
  'coach-fleet-round',
  '0 4 * * *',
  $$SELECT public.invoke_coach_fleet_round();$$
);
