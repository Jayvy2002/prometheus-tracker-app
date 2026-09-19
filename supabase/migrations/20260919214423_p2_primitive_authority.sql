-- Hotfix B — P2 primitive authority.
--
-- Production (phyuijjekxtjvipjtdfv, 2026-09-19, 126 migrations):
--   authenticated EXECUTE on:
--     upsert_athlete_signal, resolve_athlete_signal,
--     record_athlete_decision (11-arg and 13-arg),
--     enqueue_athlete_decision_outbox, queue_and_record_athlete_decision
--   record_athlete_decision_replay already service_role only.
--
-- A logged-in Solo or Coach could therefore write signals / journal / outbox
-- without going through save_athlete_weekly_review, commit_solo_weekly_review_decision,
-- apply_intervention, correct_athlete_watch_context or decide_athlete_watch_proposal.
--
-- Defense: REVOKE Data API EXECUTE on those five primitives. GRANT service_role only.
-- SECURITY DEFINER métier RPCs keep calling them as table owner.
-- drain_athlete_decision_outbox stays authenticated (client retry worker).

REVOKE ALL ON FUNCTION public.upsert_athlete_signal(uuid, text, text, text, jsonb, jsonb, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_athlete_signal(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_athlete_decision_outbox(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_and_record_athlete_decision(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_athlete_signal(uuid, text, text, text, jsonb, jsonb, text, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_athlete_signal(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_athlete_decision_outbox(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_and_record_athlete_decision(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.upsert_athlete_signal(uuid, text, text, text, jsonb, jsonb, text, text, timestamptz) IS
  'Hotfix B: internal primitive. Data API EXECUTE revoked. Called by save_athlete_weekly_review.';
COMMENT ON FUNCTION public.resolve_athlete_signal(uuid, text, text) IS
  'Hotfix B: internal primitive. Data API EXECUTE revoked. Called by save_athlete_weekly_review and correct_athlete_watch_context.';
COMMENT ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid) IS
  'Hotfix B: internal 11-arg wrapper. Data API EXECUTE revoked.';
COMMENT ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid) IS
  'Hotfix B: internal journal primitive. Data API EXECUTE revoked. Called by queue_and_record_athlete_decision.';
COMMENT ON FUNCTION public.enqueue_athlete_decision_outbox(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid) IS
  'Hotfix B: internal outbox primitive. Data API EXECUTE revoked. Called by queue_and_record_athlete_decision.';
COMMENT ON FUNCTION public.queue_and_record_athlete_decision(text, uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid) IS
  'Hotfix B: internal durable journal. Data API EXECUTE revoked. Called by commit_solo, apply_intervention, Watch RPCs.';
