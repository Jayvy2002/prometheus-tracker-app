-- Architecture lock 2026-08-29 (Jayvy): DO NOT create Grok Bots.
-- Second was too slow. Per-coach / per-client bots will not scale.
-- Weekly review is IN APP: triage_coach_fleet (every active client) +
-- coach-fleet-round (drafts only). Never auto-apply. Never ping Second.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to backup nebysjpqifqphvmveowe.

COMMENT ON FUNCTION public.triage_coach_fleet(uuid) IS
  'Cheap weekly SQL triage of EVERY active linked client (14-day aggregates, not raw logs). Used by in-app coach-fleet-round. Not a Grok Bot. Writes are drafts only.';

COMMENT ON FUNCTION public.invoke_coach_fleet_round() IS
  'Nightly pg_cron invoke of in-app coach-fleet-round. Auth via vault FLEET_CRON_SECRET (fallback GROK_BOT_WEBHOOK_SECRET as HMAC, not a Grok Bot ping).';
