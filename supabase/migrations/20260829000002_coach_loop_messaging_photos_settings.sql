-- Coaching loop: two-way messages, progress photos, coach settings.
-- Coaching copy only: phyuijjekxtjvipjtdfv. Do not apply to the live tracker.

-- ============================================================
-- 1. coach_messages: client replies on the same thread table
-- ============================================================
ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.coach_messages
  SET sender_id = coach_id
  WHERE sender_id IS NULL;

ALTER TABLE public.coach_messages
  ALTER COLUMN sender_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_template_key_check;
  ALTER TABLE public.coach_messages
    ADD CONSTRAINT coach_messages_template_key_check
    CHECK (template_key IN ('missed_training', 'missed_checkins', 'general_followup', 'reply'));
END $$;

DO $$ BEGIN
  ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_sender_party;
  ALTER TABLE public.coach_messages
    ADD CONSTRAINT coach_messages_sender_party
    CHECK (sender_id = coach_id OR sender_id = client_id);
END $$;

CREATE INDEX IF NOT EXISTS coach_messages_thread_idx
  ON public.coach_messages (coach_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_messages_coach_unread_idx
  ON public.coach_messages (coach_id, created_at DESC)
  WHERE read_at IS NULL;

DROP POLICY IF EXISTS "Coaches insert messages for their clients" ON public.coach_messages;
DROP POLICY IF EXISTS "Coaches read messages they sent" ON public.coach_messages;
DROP POLICY IF EXISTS "Clients read their coach messages" ON public.coach_messages;
DROP POLICY IF EXISTS "Clients mark their messages read" ON public.coach_messages;
DROP POLICY IF EXISTS "Thread participants read messages" ON public.coach_messages;
DROP POLICY IF EXISTS "Coach sends to own clients" ON public.coach_messages;
DROP POLICY IF EXISTS "Client replies to own coach" ON public.coach_messages;
DROP POLICY IF EXISTS "Recipient marks messages read" ON public.coach_messages;

CREATE POLICY "Thread participants read messages"
  ON public.coach_messages FOR SELECT TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR client_id = (select auth.uid())
  );

CREATE POLICY "Coach sends to own clients"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND coach_id = (select auth.uid())
    AND public.is_coach_of(client_id)
  );

CREATE POLICY "Client replies to own coach"
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND client_id = (select auth.uid())
    AND public.is_client_of(coach_id)
    AND template_key = 'reply'
  );

CREATE POLICY "Recipient marks messages read"
  ON public.coach_messages FOR UPDATE TO authenticated
  USING (
    (client_id = (select auth.uid()) AND sender_id <> (select auth.uid()))
    OR (coach_id = (select auth.uid()) AND sender_id <> (select auth.uid()))
  )
  WITH CHECK (
    (client_id = (select auth.uid()) AND sender_id <> (select auth.uid()))
    OR (coach_id = (select auth.uid()) AND sender_id <> (select auth.uid()))
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.coach_messages TO authenticated;

-- ============================================================
-- 2. coach_settings (light personalization, not a marketplace)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coach_settings (
  coach_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visible_tabs text[] NOT NULL DEFAULT ARRAY[
    'overview', 'training', 'progress', 'checkins', 'health', 'notes'
  ]::text[],
  queue_mode_default boolean NOT NULL DEFAULT true,
  nudge_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_settings_tabs_ok CHECK (
    visible_tabs <@ ARRAY['overview', 'training', 'progress', 'checkins', 'health', 'notes']::text[]
    AND cardinality(visible_tabs) >= 1
  )
);

ALTER TABLE public.coach_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches manage own settings" ON public.coach_settings;
CREATE POLICY "Coaches manage own settings"
  ON public.coach_settings FOR ALL TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (coach_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_settings TO authenticated;

-- ============================================================
-- 3. progress_photos (client uploads, coach of that client reads)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  taken_at date NOT NULL DEFAULT (CURRENT_DATE),
  kind text NOT NULL DEFAULT 'front' CHECK (kind IN ('front', 'side', 'back')),
  storage_path text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS progress_photos_user_idx
  ON public.progress_photos (user_id, taken_at DESC);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients read own progress photos" ON public.progress_photos;
DROP POLICY IF EXISTS "Coaches read client progress photos" ON public.progress_photos;
DROP POLICY IF EXISTS "Clients insert own progress photos" ON public.progress_photos;
DROP POLICY IF EXISTS "Clients update own progress photos" ON public.progress_photos;
DROP POLICY IF EXISTS "Clients delete own progress photos" ON public.progress_photos;

CREATE POLICY "Clients read own progress photos"
  ON public.progress_photos FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Coaches read client progress photos"
  ON public.progress_photos FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

CREATE POLICY "Clients insert own progress photos"
  ON public.progress_photos FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Clients update own progress photos"
  ON public.progress_photos FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Clients delete own progress photos"
  ON public.progress_photos FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.progress_photos TO authenticated;

-- Private bucket: signed URLs only. Path: {user_id}/{uuid}.ext
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'progress-photos',
  'progress-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Clients upload progress photos" ON storage.objects;
DROP POLICY IF EXISTS "Clients update own progress photos" ON storage.objects;
DROP POLICY IF EXISTS "Clients delete own progress photos" ON storage.objects;
DROP POLICY IF EXISTS "Owner or coach can read progress photos" ON storage.objects;

CREATE POLICY "Clients upload progress photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Clients update own progress photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Clients delete own progress photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Owner or coach can read progress photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR public.is_coach_of(((storage.foldername(name))[1])::uuid)
    )
  );
