-- UX27 : un message coach peut pointer la séance / le check-in dont il parle.
-- SET NULL : supprimer un log n'efface pas le fil. Un seul bilan par message.

ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkin_id uuid REFERENCES public.daily_checkins(id) ON DELETE SET NULL;

ALTER TABLE public.coach_messages
  DROP CONSTRAINT IF EXISTS coach_messages_one_bilan;
ALTER TABLE public.coach_messages
  ADD CONSTRAINT coach_messages_one_bilan
  CHECK (workout_id IS NULL OR checkin_id IS NULL);

CREATE INDEX IF NOT EXISTS coach_messages_workout_idx
  ON public.coach_messages (workout_id)
  WHERE workout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coach_messages_checkin_idx
  ON public.coach_messages (checkin_id)
  WHERE checkin_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.coach_message_bilan_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_messages_bilan_owned ON public.coach_messages;
CREATE TRIGGER coach_messages_bilan_owned
  BEFORE INSERT OR UPDATE OF workout_id, checkin_id, client_id
  ON public.coach_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.coach_message_bilan_owned();

REVOKE ALL ON FUNCTION public.coach_message_bilan_owned() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.coach_messages.workout_id IS
  'UX27: séance dont parle le message. NULL = pas de lien.';
COMMENT ON COLUMN public.coach_messages.checkin_id IS
  'UX27: check-in dont parle le message. NULL = pas de lien.';
