-- Messagerie enrichie (Vision §19, §20 V1).
--
-- Toujours une seule conversation par relation (coach_messages). On y ajoute :
--   * réponse à un message du même fil (reply_to_id) ;
--   * références vers l'objet canonique (programme, objectif, exercice, en
--     plus de séance et check-in) : jamais une copie des données ;
--   * pièces jointes (image, vidéo courte, audio/voix, fichier courant) dans
--     un bucket privé, rangées par fil : <coach>/<client>/<uuid>.<ext>.
-- Lire un objet référencé reste soumis à ses propres permissions : la fin de
-- relation retire l'accès aux nouvelles données sans réécrire le fil.

-- ---------------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------------

ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.coach_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.athlete_goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exercise_name text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS coach_messages_reply_idx
  ON public.coach_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- One attachment descriptor: where it is, what it is, how big. No free JSON.
CREATE OR REPLACE FUNCTION public.message_attachments_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_typeof(p) = 'array'
    AND jsonb_array_length(p) <= 4
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p) a
      WHERE jsonb_typeof(a) <> 'object'
         OR (SELECT count(*) FROM jsonb_object_keys(a) k
             WHERE k NOT IN ('path', 'kind', 'mime', 'size', 'name', 'duration_s')) > 0
         OR NOT (a ? 'path' AND a ? 'kind' AND a ? 'mime' AND a ? 'size' AND a ? 'name')
         OR jsonb_typeof(a->'path') <> 'string'
         OR (a->>'path') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|gif|heic|mp4|mov|webm|m4a|mp3|ogg|oga|wav|aac|pdf|txt|csv|xlsx|xls|docx|doc|pptx)$'
         OR (a->>'kind') NOT IN ('image', 'video', 'audio', 'file')
         OR jsonb_typeof(a->'mime') <> 'string'
         OR char_length(a->>'mime') NOT BETWEEN 3 AND 120
         OR jsonb_typeof(a->'size') <> 'number'
         OR (a->>'size')::numeric NOT BETWEEN 1 AND 26214400
         OR jsonb_typeof(a->'name') <> 'string'
         OR char_length(btrim(a->>'name')) NOT BETWEEN 1 AND 120
         OR (a ? 'duration_s' AND (jsonb_typeof(a->'duration_s') <> 'number'
             OR (a->>'duration_s')::numeric NOT BETWEEN 0 AND 600))
    );
$$;

REVOKE ALL ON FUNCTION public.message_attachments_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_attachments_valid(jsonb) TO authenticated, service_role;

ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_attachments_valid;
ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_attachments_valid CHECK (public.message_attachments_valid(attachments));

-- A message is text, attachments, or both. Never empty.
ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_body_check;
ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_body_length_check;
ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_body_length_check CHECK (
    char_length(btrim(body)) <= 2000
    AND (char_length(btrim(body)) >= 1 OR jsonb_array_length(attachments) > 0)
  );

-- At most one referenced object; an exercise can be named alone or inside a session.
ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_one_bilan;
ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_one_ref;
ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_one_ref CHECK (
    num_nonnulls(workout_id, checkin_id, program_id, goal_id) <= 1
    AND (exercise_name IS NULL OR num_nonnulls(checkin_id, program_id, goal_id) = 0)
  );
ALTER TABLE public.coach_messages DROP CONSTRAINT IF EXISTS coach_messages_exercise_name_check;
ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_exercise_name_check CHECK (
    exercise_name IS NULL OR char_length(btrim(exercise_name)) BETWEEN 1 AND 120
  );

-- ---------------------------------------------------------------------------
-- Ownership of what a message points to
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.coach_message_bilan_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active boolean;
  v_att jsonb;
  v_prefix text := NEW.coach_id::text || '/' || NEW.client_id::text || '/';
BEGIN
  IF NEW.workout_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workouts w
    WHERE w.id = NEW.workout_id AND w.user_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'workout_not_client';
  END IF;
  IF NEW.checkin_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.daily_checkins c
    WHERE c.id = NEW.checkin_id AND c.user_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'checkin_not_client';
  END IF;
  IF NEW.goal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.athlete_goals g
    WHERE g.id = NEW.goal_id AND g.user_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'goal_not_client';
  END IF;
  IF NEW.program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = NEW.program_id
      AND (
        p.owner_id IN (NEW.coach_id, NEW.client_id)
        OR EXISTS (
          SELECT 1 FROM public.program_assignments pa
          WHERE pa.program_id = p.id AND pa.client_id = NEW.client_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'program_not_in_relationship';
  END IF;
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.coach_messages r
    WHERE r.id = NEW.reply_to_id
      AND r.coach_id = NEW.coach_id
      AND r.client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'reply_not_in_thread';
  END IF;

  -- Before activation (prospect) only text and attachments: no data shared by reference.
  IF num_nonnulls(NEW.workout_id, NEW.checkin_id, NEW.program_id, NEW.goal_id, NEW.exercise_name) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.coach_client_links l
      WHERE l.coach_id = NEW.coach_id AND l.client_id = NEW.client_id AND l.status = 'active'
    ) INTO v_active;
    IF NOT v_active THEN
      RAISE EXCEPTION 'refs_need_active_relationship';
    END IF;
  END IF;

  -- Attachments live in this thread's folder and were really uploaded.
  FOR v_att IN SELECT * FROM jsonb_array_elements(NEW.attachments) LOOP
    IF left(v_att->>'path', char_length(v_prefix)) <> v_prefix THEN
      RAISE EXCEPTION 'attachment_not_in_thread';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'message-attachments' AND o.name = v_att->>'path'
    ) THEN
      RAISE EXCEPTION 'attachment_missing';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_message_bilan_owned() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_messages_bilan_owned ON public.coach_messages;
CREATE TRIGGER coach_messages_bilan_owned
  BEFORE INSERT OR UPDATE OF workout_id, checkin_id, client_id, program_id, goal_id, exercise_name, reply_to_id, attachments
  ON public.coach_messages
  FOR EACH ROW EXECUTE FUNCTION public.coach_message_bilan_owned();

-- ---------------------------------------------------------------------------
-- Storage: private bucket, one folder per thread
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  26214400,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/aac',
    'application/pdf', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Who may still write in a thread: the two parties of an active relationship,
-- or of an open marketplace conversation.
CREATE OR REPLACE FUNCTION public.message_thread_writable(p_coach text, p_client text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_coach uuid;
  v_client uuid;
BEGIN
  IF v_uid IS NULL OR p_coach IS NULL OR p_client IS NULL THEN RETURN false; END IF;
  IF p_coach !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR p_client !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_coach := p_coach::uuid;
  v_client := p_client::uuid;
  IF v_uid NOT IN (v_coach, v_client) OR v_coach = v_client THEN RETURN false; END IF;
  RETURN EXISTS (
      SELECT 1 FROM public.coach_client_links l
      WHERE l.coach_id = v_coach AND l.client_id = v_client AND l.status = 'active'
    )
    OR public.marketplace_open_prospect(v_coach, v_client);
END;
$$;

REVOKE ALL ON FUNCTION public.message_thread_writable(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_thread_writable(text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Thread parties upload message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Thread parties read message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Uploader removes unsent message attachment" ON storage.objects;

CREATE POLICY "Thread parties upload message attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND public.message_thread_writable((storage.foldername(name))[1], (storage.foldername(name))[2])
    AND storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-z0-9]{2,5}$'
  );

-- Like the messages themselves, the history of a thread stays readable by its two parties.
CREATE POLICY "Thread parties read message attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND (SELECT auth.uid())::text IN ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

-- A failed send may clean its own upload; a sent attachment is part of the thread.
CREATE POLICY "Uploader removes unsent message attachment"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND owner = (SELECT auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.coach_messages m
      WHERE m.attachments @> jsonb_build_array(jsonb_build_object('path', name))
    )
  );

COMMENT ON COLUMN public.coach_messages.attachments IS
  'Up to 4 descriptors {path, kind, mime, size, name, duration_s?}. Files live in the private message-attachments bucket under <coach>/<client>/. Validated by message_attachments_valid and coach_message_bilan_owned.';
COMMENT ON COLUMN public.coach_messages.program_id IS
  'Reference to the canonical program (Vision §19), never a copy. Reading it follows program permissions.';
