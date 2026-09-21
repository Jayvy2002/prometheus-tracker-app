-- P4.3: prospect messaging after coach_accepted, without dossier rights.

ALTER TABLE public.coach_messages
  DROP CONSTRAINT IF EXISTS coach_messages_template_key_check;
ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_template_key_check
  CHECK (template_key IN ('missed_training', 'missed_checkins', 'general_followup', 'reply', 'prospect'));

CREATE OR REPLACE FUNCTION public.marketplace_open_prospect(p_coach uuid, p_client uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) IN (p_coach, p_client)
    AND EXISTS (
      SELECT 1
      FROM public.coach_join_requests
      WHERE coach_id = p_coach
        AND client_id = p_client
        AND status = 'coach_accepted'
    );
$$;

REVOKE ALL ON FUNCTION public.marketplace_open_prospect(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_open_prospect(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.marketplace_open_prospect(uuid, uuid) IS
  'True when the caller is a party to a coach_accepted join request. Does not grant is_coach_of.';

DROP POLICY IF EXISTS "Coach sends to own clients" ON public.coach_messages;
CREATE POLICY "Coach sends to own clients"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND coach_id = (SELECT auth.uid())
    AND (
      (
        public.is_coach_of(client_id)
        AND template_key IN ('missed_training', 'missed_checkins', 'general_followup', 'reply', 'prospect')
      )
      OR (
        public.marketplace_open_prospect((SELECT auth.uid()), client_id)
        AND template_key IN ('prospect', 'reply')
      )
    )
  );

DROP POLICY IF EXISTS "Client replies to own coach" ON public.coach_messages;
CREATE POLICY "Client replies to own coach"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND client_id = (SELECT auth.uid())
    AND template_key = 'reply'
    AND (
      public.is_client_of(coach_id)
      OR public.marketplace_open_prospect(coach_id, (SELECT auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.fetch_thread_messages(
  p_client_id uuid,
  p_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS SETOF public.coach_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Client required'; END IF;
  IF p_client_id <> v_uid
     AND NOT public.is_coach_of(p_client_id)
     AND NOT public.marketplace_open_prospect(v_uid, p_client_id)
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_messages m
      WHERE m.coach_id = v_uid AND m.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this thread';
    END IF;
  END IF;
  RETURN QUERY
    SELECT m.*
    FROM public.coach_messages m
    WHERE m.client_id = p_client_id
      AND (p_before IS NULL OR m.created_at < p_before)
      AND (m.client_id = v_uid OR m.coach_id = v_uid)
    ORDER BY m.created_at DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_thread_messages(uuid, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_thread_messages(uuid, timestamptz, int) TO authenticated;
