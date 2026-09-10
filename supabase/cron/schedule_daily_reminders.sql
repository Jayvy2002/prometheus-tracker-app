-- Schedule send-daily-reminders via pg_cron + pg_net + vault (Q01).
-- Same pattern as coach-fleet-round: the secret lives in vault, never in git.
--
-- One-time setup (Supabase Dashboard):
-- 1. Edge Functions → send-daily-reminders → Secrets: set REMINDERS_CRON_SECRET
--    to the generated value (given separately, never committed).
-- 2. Database → Vault (or SQL below): store the SAME value as REMINDERS_CRON_SECRET.
-- 3. Run the cron.schedule block below (every minute — the edge only sends
--    when a user's HH:MM matches in their own timezone, and skips logged days).
-- 4. VAPID keys must also be set on the edge (VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT).

-- 2. Vault (run once):
-- SELECT vault.create_secret('<GENERATED>', 'REMINDERS_CRON_SECRET');

-- 3. Schedule (every minute; per-minute HH:MM match + tag dedup inside the edge):
SELECT cron.unschedule('send-daily-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-daily-reminders'
);

SELECT cron.schedule(
  'send-daily-reminders',
  '* * * * *',
  $$SELECT public.invoke_send_daily_reminders();$$
);
