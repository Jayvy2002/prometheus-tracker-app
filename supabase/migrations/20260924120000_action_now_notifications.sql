-- Notifications « action maintenant » (Vision §21).
--
-- Une notification sert à agir maintenant : message reçu, demande de coaching,
-- Coach qui accepte (l'athlète doit confirmer), athlète qui confirme, nouveau
-- programme reçu, propositions de Prometheus à décider. Pas de relance
-- d'engagement : les rappels à heure fixe restent facultatifs et éteints.
--
-- États distincts (CLAUDE.md) : mis en file ≠ envoyé ≠ lu. La file ne contient
-- aucun contenu de message (seulement le nom de l'expéditeur et un compteur).
--
-- 1. user_profiles.notification_categories : choix par catégorie. NULL = tout
--    activé. Lu au moment de l'envoi, donc un changement s'applique tout de suite.
-- 2. notification_outbox : file serveur (RLS sans policy, aucune lecture client).
--    Une ligne en attente par (destinataire, clé de regroupement) : plusieurs
--    messages du même expéditeur dans la fenêtre = une notification « 3 messages ».
-- 3. Déclencheurs sur les tables métier ; une erreur de mise en file ne bloque
--    jamais l'écriture métier.
-- 4. claim_notification_batch : réservée au service (cron send-daily-reminders),
--    réservation SKIP LOCKED, catégories coupées marquées « muted ».

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notification_categories jsonb;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_notification_categories_shape;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_notification_categories_shape CHECK (
    notification_categories IS NULL
    OR (
      jsonb_typeof(notification_categories) = 'object'
      AND (notification_categories - ARRAY['messages', 'coaching', 'program', 'decisions']) = '{}'::jsonb
      AND jsonb_typeof(COALESCE(notification_categories -> 'messages', 'true'::jsonb)) = 'boolean'
      AND jsonb_typeof(COALESCE(notification_categories -> 'coaching', 'true'::jsonb)) = 'boolean'
      AND jsonb_typeof(COALESCE(notification_categories -> 'program', 'true'::jsonb)) = 'boolean'
      AND jsonb_typeof(COALESCE(notification_categories -> 'decisions', 'true'::jsonb)) = 'boolean'
    )
  );

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('messages', 'coaching', 'program', 'decisions')),
  kind text NOT NULL CHECK (kind IN (
    'coach_message', 'client_message', 'coaching_request', 'coach_accepted',
    'athlete_confirmed', 'program_assigned', 'proposals_waiting'
  )),
  dedupe_key text NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 200),
  item_count integer NOT NULL DEFAULT 1 CHECK (item_count >= 1),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  url text NOT NULL CHECK (url LIKE '/%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  send_after timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  outcome text CHECK (outcome IN ('delivered', 'muted', 'no_device', 'failed')),
  CHECK ((sent_at IS NULL) = (outcome IS NULL))
);

-- One waiting (unclaimed) notification per recipient and grouping key.
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_waiting_uidx
  ON public.notification_outbox (user_id, dedupe_key)
  WHERE sent_at IS NULL AND claimed_at IS NULL;
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox (send_after)
  WHERE sent_at IS NULL;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.notification_category_enabled(p_prefs jsonb, p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((p_prefs ->> p_category)::boolean, true);
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user uuid,
  p_category text,
  p_kind text,
  p_dedupe text,
  p_payload jsonb,
  p_url text,
  p_delay interval DEFAULT interval '0'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.notification_outbox (user_id, category, kind, dedupe_key, payload, url, send_after)
  VALUES (p_user, p_category, p_kind, p_dedupe, COALESCE(p_payload, '{}'::jsonb), p_url, now() + p_delay)
  ON CONFLICT (user_id, dedupe_key) WHERE sent_at IS NULL AND claimed_at IS NULL
  DO UPDATE SET
    item_count = public.notification_outbox.item_count + 1,
    payload = EXCLUDED.payload;
END;
$$;

-- ─── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_coach_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid := COALESCE(NEW.sender_id, NEW.coach_id);
  v_to_client boolean := v_sender = NEW.coach_id;
  v_name text;
BEGIN
  BEGIN
    SELECT NULLIF(btrim(full_name), '') INTO v_name FROM public.user_profiles WHERE id = v_sender;
    PERFORM public.enqueue_notification(
      CASE WHEN v_to_client THEN NEW.client_id ELSE NEW.coach_id END,
      'messages',
      CASE WHEN v_to_client THEN 'coach_message' ELSE 'client_message' END,
      'message:' || v_sender::text,
      jsonb_build_object('name', v_name),
      CASE WHEN v_to_client THEN '/messages' ELSE '/messages/' || NEW.client_id::text END,
      -- A short window groups a burst of messages into one notification.
      interval '2 minutes'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_coach_message skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS coach_messages_notify ON public.coach_messages;
CREATE TRIGGER coach_messages_notify
  AFTER INSERT ON public.coach_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_coach_message();

CREATE OR REPLACE FUNCTION public.notify_on_coach_join_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_name text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      PERFORM public.enqueue_notification(
        NEW.coach_id, 'coaching', 'coaching_request', 'request:' || NEW.id::text,
        jsonb_build_object('name', NEW.public_name), '/coaching-requests');
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'coach_accepted' THEN
        SELECT NULLIF(btrim(full_name), '') INTO v_coach_name FROM public.user_profiles WHERE id = NEW.coach_id;
        -- The athlete still has to confirm before anything is active.
        PERFORM public.enqueue_notification(
          NEW.client_id, 'coaching', 'coach_accepted', 'request:' || NEW.id::text || ':accepted',
          jsonb_build_object('name', v_coach_name), '/coaching-requests');
      ELSIF NEW.status = 'athlete_confirmed' THEN
        PERFORM public.enqueue_notification(
          NEW.coach_id, 'coaching', 'athlete_confirmed', 'request:' || NEW.id::text || ':confirmed',
          jsonb_build_object('name', NEW.public_name), '/clients');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_coach_join_request skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS coach_join_requests_notify ON public.coach_join_requests;
CREATE TRIGGER coach_join_requests_notify
  AFTER INSERT OR UPDATE OF status ON public.coach_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_coach_join_request();

CREATE OR REPLACE FUNCTION public.notify_on_program_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program text;
BEGIN
  BEGIN
    -- A plan the athlete gives themself is not news; a coach's plan is.
    IF NEW.status = 'active' AND NEW.assigned_by IS DISTINCT FROM NEW.client_id THEN
      SELECT NULLIF(btrim(name), '') INTO v_program FROM public.programs WHERE id = NEW.program_id;
      PERFORM public.enqueue_notification(
        NEW.client_id, 'program', 'program_assigned', 'program:' || NEW.id::text,
        jsonb_build_object('program', v_program), '/programs');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_program_assignment skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS program_assignments_notify ON public.program_assignments;
CREATE TRIGGER program_assignments_notify
  AFTER INSERT ON public.program_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_program_assignment();

CREATE OR REPLACE FUNCTION public.notify_on_fleet_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    -- Prometheus prepared something: the coach decides (grouped over 10 minutes).
    IF NEW.status = 'pending' AND NEW.source = 'fleet' THEN
      PERFORM public.enqueue_notification(
        NEW.coach_id, 'decisions', 'proposals_waiting', 'proposals', '{}'::jsonb, '/dashboard',
        interval '10 minutes');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_fleet_proposal skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS coach_interventions_notify ON public.coach_interventions;
CREATE TRIGGER coach_interventions_notify
  AFTER INSERT ON public.coach_interventions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_fleet_proposal();

-- ─── Delivery (service only) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_notification_batch(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  kind text,
  item_count integer,
  payload jsonb,
  url text,
  language text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- History is not kept forever.
  DELETE FROM public.notification_outbox o WHERE o.sent_at < now() - interval '30 days';

  -- A category the user turned off is closed as « muted », never sent.
  UPDATE public.notification_outbox o
     SET sent_at = now(), outcome = 'muted'
    FROM public.user_profiles p
   WHERE p.id = o.user_id
     AND o.sent_at IS NULL
     AND o.send_after <= now()
     AND NOT public.notification_category_enabled(p.notification_categories, o.category);

  RETURN QUERY
  WITH due AS (
    SELECT o.id
      FROM public.notification_outbox o
     WHERE o.sent_at IS NULL
       AND o.send_after <= now()
       -- A claim older than 5 minutes is a crashed run: take it again.
       AND (o.claimed_at IS NULL OR o.claimed_at < now() - interval '5 minutes')
     ORDER BY o.send_after
     LIMIT GREATEST(1, LEAST(p_limit, 500))
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.notification_outbox o
       SET claimed_at = now()
      FROM due
     WHERE o.id = due.id
    RETURNING o.id, o.user_id, o.kind, o.item_count, o.payload, o.url
  )
  SELECT c.id, c.user_id, c.kind, c.item_count, c.payload, c.url, COALESCE(p.language, 'fr')
    FROM claimed c
    LEFT JOIN public.user_profiles p ON p.id = c.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_category_enabled(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_category_enabled(jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, jsonb, text, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_coach_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_coach_join_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_program_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_fleet_proposal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_batch(integer) TO service_role;
