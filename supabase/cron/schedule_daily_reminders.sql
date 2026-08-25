-- Schedule send-daily-reminders via pg_cron + pg_net.
-- This cannot be applied from the repo: it needs the project URL and the
-- service_role key, which must never be committed.
--
-- 1. Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
-- 2. Dashboard → Edge Functions → send-daily-reminders: set secrets
--    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
-- 3. Paste this in the SQL editor after replacing the two placeholders.

select cron.unschedule('send-daily-reminders')
where exists (
  select 1 from cron.job where jobname = 'send-daily-reminders'
);

select cron.schedule(
  'send-daily-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
