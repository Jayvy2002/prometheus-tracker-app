-- Schedule coach-fleet-round via pg_cron + pg_net.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to backup nebysjpqifqphvmveowe.
-- This cannot bake the service_role key: paste in the SQL editor after replacing
-- PROJECT_REF and SERVICE_ROLE_KEY, or rely on vault like notify_onboarding_complete.
--
-- 1. Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
-- 2. Dashboard → Edge Functions → coach-fleet-round: set optional XAI_API_KEY / GROK_API_KEY.
--    Without a key the job still writes deterministic Relancer cards (IA off).
-- 3. Nightly 04:00 UTC. JWT is not used here — Authorization is the service role.

select cron.unschedule('coach-fleet-round')
where exists (
  select 1 from cron.job where jobname = 'coach-fleet-round'
);

select cron.schedule(
  'coach-fleet-round',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://phyuijjekxtjvipjtdfv.supabase.co/functions/v1/coach-fleet-round',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);
