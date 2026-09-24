-- « Check-in dû » suit la fréquence choisie (Vision §11.2, §21).
--
-- - checkin_last_due : la dernière échéance attendue à une date donnée, même
--   règle que features/checkins/domain/checkinSchedule.ts (un test SQL et un
--   test TS partagent les mêmes cas).
-- - Notification « check-in dû » : une seule fois, le jour de l'échéance, à
--   partir de 9 h locale, seulement pour un rythme explicitement choisi (pas de
--   relance quotidienne par défaut), si le module check-in est suivi et qu'aucun
--   check-in n'a été fait depuis l'échéance. Catégorie « checkins », réglable.
-- - Un check-in manquant n'est jamais une faute : on prévient, on ne compte pas.

CREATE OR REPLACE FUNCTION public.checkin_last_due(
  p_frequency text,
  p_weekday smallint,
  p_anchor date,
  p_today date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_first date;
  v_step integer;
  v_day integer;
  v_this date;
  v_prev date;
BEGIN
  IF p_today < p_anchor THEN RETURN NULL; END IF;
  IF p_frequency = 'daily' THEN RETURN p_today; END IF;
  IF p_frequency IN ('weekly', 'biweekly') THEN
    v_first := p_anchor + ((COALESCE(p_weekday, extract(dow FROM p_anchor)::int) - extract(dow FROM p_anchor)::int + 7) % 7);
    IF p_today < v_first THEN RETURN NULL; END IF;
    v_step := CASE WHEN p_frequency = 'weekly' THEN 7 ELSE 14 END;
    RETURN v_first + ((p_today - v_first) / v_step) * v_step;
  END IF;
  IF p_frequency = 'monthly' THEN
    v_day := extract(day FROM p_anchor)::int;
    v_this := make_date(extract(year FROM p_today)::int, extract(month FROM p_today)::int, 1);
    v_this := v_this + (LEAST(v_day, extract(day FROM (v_this + interval '1 month' - interval '1 day'))::int) - 1);
    IF p_today >= v_this THEN RETURN v_this; END IF;
    v_prev := (date_trunc('month', p_today) - interval '1 month')::date;
    v_prev := v_prev + (LEAST(v_day, extract(day FROM (v_prev + interval '1 month' - interval '1 day'))::int) - 1);
    RETURN CASE WHEN v_prev >= p_anchor THEN v_prev ELSE NULL END;
  END IF;
  RETURN NULL;
END;
$$;

-- ─── Notification category « checkins » ─────────────────────────────────────

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_notification_categories_shape;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_notification_categories_shape CHECK (
  notification_categories IS NULL
  OR (
    jsonb_typeof(notification_categories) = 'object'
    AND (notification_categories - ARRAY['messages', 'coaching', 'program', 'decisions', 'checkins']) = '{}'::jsonb
    AND jsonb_typeof(COALESCE(notification_categories -> 'messages', 'true'::jsonb)) = 'boolean'
    AND jsonb_typeof(COALESCE(notification_categories -> 'coaching', 'true'::jsonb)) = 'boolean'
    AND jsonb_typeof(COALESCE(notification_categories -> 'program', 'true'::jsonb)) = 'boolean'
    AND jsonb_typeof(COALESCE(notification_categories -> 'decisions', 'true'::jsonb)) = 'boolean'
    AND jsonb_typeof(COALESCE(notification_categories -> 'checkins', 'true'::jsonb)) = 'boolean'
  )
);

ALTER TABLE public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_category_check;
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_category_check
  CHECK (category IN ('messages', 'coaching', 'program', 'decisions', 'checkins'));
ALTER TABLE public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_kind_check CHECK (kind IN (
  'coach_message', 'client_message', 'coaching_request', 'coach_accepted',
  'athlete_confirmed', 'program_assigned', 'proposals_waiting', 'constraint_declared', 'checkin_due'
));

CREATE INDEX IF NOT EXISTS notification_outbox_user_key_idx
  ON public.notification_outbox (user_id, dedupe_key);

CREATE OR REPLACE FUNCTION public.enqueue_due_checkins(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT p.user_id,
           public.checkin_last_due(p.frequency, p.weekday, p.anchor_date,
             (p_now AT TIME ZONE COALESCE(NULLIF(pr.timezone, ''), 'UTC'))::date) AS due,
           (p_now AT TIME ZONE COALESCE(NULLIF(pr.timezone, ''), 'UTC')) AS local_now
      FROM public.checkin_plans p
      JOIN public.user_profiles pr ON pr.id = p.user_id
     -- The module is followed: by the coach's configuration, or by the Solo's choice.
     WHERE CASE
             WHEN EXISTS (SELECT 1 FROM public.coach_client_links l WHERE l.client_id = p.user_id AND l.status = 'active')
               THEN COALESCE((SELECT c.track_checkins FROM public.client_tracking_config c
                               JOIN public.coach_client_links l ON l.coach_id = c.coach_id AND l.client_id = c.client_id AND l.status = 'active'
                              WHERE c.client_id = p.user_id LIMIT 1), false)
             ELSE COALESCE((pr.personal_modules ->> 'checkins')::boolean, true)
           END
  LOOP
    -- The due day itself, from 9:00 local; never the day after (no chasing).
    IF r.due IS NULL OR r.due <> r.local_now::date OR extract(hour FROM r.local_now) < 9 THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.daily_checkins d WHERE d.user_id = r.user_id AND d.checked_at >= r.due) THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.notification_outbox o WHERE o.user_id = r.user_id AND o.dedupe_key = 'checkin:' || r.due::text) THEN
      CONTINUE;
    END IF;
    PERFORM public.enqueue_notification(r.user_id, 'checkins', 'checkin_due', 'checkin:' || r.due::text, '{}'::jsonb, '/checkin');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- The cron's claim first adds the check-ins due now, then claims as before.
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
  BEGIN
    PERFORM public.enqueue_due_checkins();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_due_checkins skipped: %', SQLERRM;
  END;

  DELETE FROM public.notification_outbox o WHERE o.sent_at < now() - interval '30 days';

  UPDATE public.notification_outbox o
     SET sent_at = now(), outcome = 'expired'
   WHERE o.sent_at IS NULL
     AND o.send_after < now() - interval '24 hours';

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

REVOKE ALL ON FUNCTION public.enqueue_due_checkins(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_checkins(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.claim_notification_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_batch(integer) TO service_role;
REVOKE ALL ON FUNCTION public.checkin_last_due(text, smallint, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_last_due(text, smallint, date, date) TO authenticated, service_role;
