-- Audit lot 5 (Q01) : invocation cron des rappels via vault, miroir du pattern fleet.
-- Le secret REMINDERS_CRON_SECRET est généré hors repo (vault + secrets edge),
-- puis le schedule dans supabase/cron/schedule_daily_reminders.sql est joué.

CREATE OR REPLACE FUNCTION public.invoke_send_daily_reminders()
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
    WHERE ds.name = 'REMINDERS_CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'send-daily-reminders: no REMINDERS_CRON_SECRET in vault';
  END IF;

  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION 'send-daily-reminders: pg_net missing';
  END IF;

  SELECT net.http_post(
    url := 'https://phyuijjekxtjvipjtdfv.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_send_daily_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_send_daily_reminders() TO postgres, service_role;

COMMENT ON FUNCTION public.invoke_send_daily_reminders() IS
  'Q01: pg_cron invoke of send-daily-reminders. Auth via vault REMINDERS_CRON_SECRET only (mirror of the fleet pattern).';
