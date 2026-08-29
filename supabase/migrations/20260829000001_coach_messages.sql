-- Thin coach → client nudges (not a chat app).
-- Coaching copy only: phyuijjekxtjvipjtdfv. Do not apply to the live tracker.

ALTER TABLE public.coach_client_links
  ADD COLUMN IF NOT EXISTS last_nudged_at timestamptz;

CREATE TABLE IF NOT EXISTS public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  template_key text NOT NULL DEFAULT 'general_followup'
    CHECK (template_key IN ('missed_training', 'missed_checkins', 'general_followup')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK (coach_id <> client_id),
  CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS coach_messages_coach_idx
  ON public.coach_messages (coach_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_messages_client_unread_idx
  ON public.coach_messages (client_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches insert messages for their clients" ON public.coach_messages;
CREATE POLICY "Coaches insert messages for their clients"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = (select auth.uid())
    AND public.is_coach_of(client_id)
  );

DROP POLICY IF EXISTS "Coaches read messages they sent" ON public.coach_messages;
CREATE POLICY "Coaches read messages they sent"
  ON public.coach_messages FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()));

DROP POLICY IF EXISTS "Clients read their coach messages" ON public.coach_messages;
CREATE POLICY "Clients read their coach messages"
  ON public.coach_messages FOR SELECT TO authenticated
  USING (client_id = (select auth.uid()));

DROP POLICY IF EXISTS "Clients mark their messages read" ON public.coach_messages;
CREATE POLICY "Clients mark their messages read"
  ON public.coach_messages FOR UPDATE TO authenticated
  USING (client_id = (select auth.uid()))
  WITH CHECK (client_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE ON TABLE public.coach_messages TO authenticated;
