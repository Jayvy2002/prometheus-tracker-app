-- Objectifs : un cycle vivant (Vision §6).
--
-- Un objectif n'est plus un champ de profil écrasé. Il a un état (active,
-- reached, maintenance, replaced, paused, abandoned), des dates, un objectif
-- précédent, et chaque transition garde sa raison, son auteur et les métriques
-- du moment (dernier poids connu). « paused » concerne l'objectif, jamais une
-- relation de coaching.
--
-- - athlete_goals / athlete_goal_events : lecture par l'athlète et par son
--   Coach actif ; écriture uniquement via RPC (aucune policy d'écriture).
-- - start_goal / transition_goal : l'athlète ou son Coach actif. L'IA peut
--   proposer ; elle n'appelle jamais ces RPC.
-- - user_profiles.goal reste le champ lu par les calculs existants : il est
--   synchronisé par start_goal, et un changement fait ailleurs (onboarding,
--   fiche Coach, formulaire historique) est enregistré dans l'historique.
-- - goal_at(user, instant) : l'objectif valable à une date, pour les analyses.

CREATE TABLE IF NOT EXISTS public.athlete_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cut', 'maintain', 'bulk', 'performance', 'health', 'other')),
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  target_weight_kg numeric CHECK (target_weight_kg IS NULL OR target_weight_kg BETWEEN 30 AND 300),
  target_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reached', 'maintenance', 'replaced', 'paused', 'abandoned')),
  predecessor_id uuid REFERENCES public.athlete_goals(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one current goal (pursued or maintained) per athlete.
CREATE UNIQUE INDEX IF NOT EXISTS athlete_goals_one_current_uidx
  ON public.athlete_goals (user_id)
  WHERE status IN ('active', 'maintenance');
CREATE INDEX IF NOT EXISTS athlete_goals_user_idx ON public.athlete_goals (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.athlete_goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.athlete_goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS athlete_goal_events_goal_idx ON public.athlete_goal_events (goal_id, occurred_at);

ALTER TABLE public.athlete_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_goal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athlete and active coach read goals" ON public.athlete_goals;
CREATE POLICY "Athlete and active coach read goals" ON public.athlete_goals
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_coach_of(user_id));

DROP POLICY IF EXISTS "Athlete and active coach read goal events" ON public.athlete_goal_events;
CREATE POLICY "Athlete and active coach read goal events" ON public.athlete_goal_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_coach_of(user_id));

REVOKE ALL ON TABLE public.athlete_goals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.athlete_goal_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.athlete_goals TO authenticated;
GRANT SELECT ON TABLE public.athlete_goal_events TO authenticated;
GRANT ALL ON TABLE public.athlete_goals TO service_role;
GRANT ALL ON TABLE public.athlete_goal_events TO service_role;

-- ─── Internals ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.goal_metrics_now(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('weight_kg', w.weight_kg, 'weight_measured_at', w.measured_at)
       FROM public.weight_measurements w
      WHERE w.user_id = p_user
      ORDER BY w.measured_at DESC, w.created_at DESC
      LIMIT 1),
    '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.goal_start_internal(
  p_user uuid,
  p_kind text,
  p_title text,
  p_target_weight_kg numeric,
  p_target_date date,
  p_reason text,
  p_actor uuid,
  p_sync_profile boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.athlete_goals%ROWTYPE;
  v_new uuid;
  v_metrics jsonb := public.goal_metrics_now(p_user);
BEGIN
  IF p_kind NOT IN ('cut', 'maintain', 'bulk', 'performance', 'health', 'other') THEN
    RAISE EXCEPTION 'invalid_goal_kind';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('athlete_goal:' || p_user::text, 0));

  SELECT * INTO v_current
    FROM public.athlete_goals
   WHERE user_id = p_user AND status IN ('active', 'maintenance')
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.athlete_goals
       SET status = 'replaced', ended_at = now(), updated_at = now()
     WHERE id = v_current.id;
    INSERT INTO public.athlete_goal_events (goal_id, user_id, from_status, to_status, reason, metrics, actor_id)
    VALUES (v_current.id, p_user, v_current.status, 'replaced', COALESCE(p_reason, ''), v_metrics, p_actor);
  END IF;

  INSERT INTO public.athlete_goals (user_id, kind, title, target_weight_kg, target_date, predecessor_id, created_by)
  VALUES (p_user, p_kind, btrim(COALESCE(p_title, '')), p_target_weight_kg, p_target_date, v_current.id, p_actor)
  RETURNING id INTO v_new;
  INSERT INTO public.athlete_goal_events (goal_id, user_id, from_status, to_status, reason, metrics, actor_id)
  VALUES (v_new, p_user, NULL, 'active', COALESCE(p_reason, ''), v_metrics, p_actor);

  -- The legacy profile field feeds the existing calculators; keep it in step.
  IF p_sync_profile AND p_kind IN ('cut', 'maintain', 'bulk') THEN
    PERFORM set_config('prometheus.goal_rpc', '1', true);
    UPDATE public.user_profiles
       SET goal = p_kind,
           target_weight_kg = COALESCE(p_target_weight_kg, target_weight_kg)
     WHERE id = p_user;
    PERFORM set_config('prometheus.goal_rpc', '', true);
  END IF;
  RETURN v_new;
END;
$$;

-- ─── Public RPCs ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_goal(
  p_user uuid,
  p_kind text,
  p_title text DEFAULT '',
  p_target_weight_kg numeric DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_reason text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_user IS NULL OR NOT (p_user = v_actor OR public.is_coach_of(p_user)) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF length(COALESCE(p_reason, '')) > 500 OR length(COALESCE(p_title, '')) > 120 THEN
    RAISE EXCEPTION 'too_long';
  END IF;
  RETURN public.goal_start_internal(p_user, p_kind, p_title, p_target_weight_kg, p_target_date, p_reason, v_actor, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_goal(
  p_goal uuid,
  p_to text,
  p_reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_goal public.athlete_goals%ROWTYPE;
  v_allowed boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_goal FROM public.athlete_goals WHERE id = p_goal;
  IF NOT FOUND OR NOT (v_goal.user_id = v_actor OR public.is_coach_of(v_goal.user_id)) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF length(COALESCE(p_reason, '')) > 500 THEN RAISE EXCEPTION 'too_long'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('athlete_goal:' || v_goal.user_id::text, 0));
  SELECT * INTO v_goal FROM public.athlete_goals WHERE id = p_goal FOR UPDATE;

  -- « replaced » only happens through start_goal; terminal states stay closed.
  v_allowed := CASE v_goal.status
    WHEN 'active' THEN p_to IN ('reached', 'maintenance', 'paused', 'abandoned')
    WHEN 'maintenance' THEN p_to IN ('active', 'paused', 'abandoned')
    WHEN 'paused' THEN p_to IN ('active', 'abandoned')
    WHEN 'reached' THEN p_to IN ('maintenance')
    ELSE false
  END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'invalid_transition'; END IF;

  IF p_to IN ('active', 'maintenance') AND EXISTS (
    SELECT 1 FROM public.athlete_goals
     WHERE user_id = v_goal.user_id AND id <> v_goal.id AND status IN ('active', 'maintenance')
  ) THEN
    RAISE EXCEPTION 'another_goal_current';
  END IF;

  UPDATE public.athlete_goals
     SET status = p_to,
         ended_at = CASE WHEN p_to IN ('reached', 'abandoned') THEN now()
                         WHEN p_to IN ('active', 'maintenance') THEN NULL
                         ELSE ended_at END,
         updated_at = now()
   WHERE id = v_goal.id;
  INSERT INTO public.athlete_goal_events (goal_id, user_id, from_status, to_status, reason, metrics, actor_id)
  VALUES (v_goal.id, v_goal.user_id, v_goal.status, p_to, COALESCE(p_reason, ''), public.goal_metrics_now(v_goal.user_id), v_actor);

  -- Reaching a weight goal and holding it means maintaining.
  IF p_to = 'maintenance' THEN
    PERFORM set_config('prometheus.goal_rpc', '1', true);
    UPDATE public.user_profiles SET goal = 'maintain' WHERE id = v_goal.user_id;
    PERFORM set_config('prometheus.goal_rpc', '', true);
  END IF;
END;
$$;

-- The goal that applied at a given instant (analyses read the past as it was).
CREATE OR REPLACE FUNCTION public.goal_at(p_user uuid, p_at timestamptz)
RETURNS TABLE (goal_id uuid, kind text, status text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT g.id, g.kind, g.status
    FROM public.athlete_goals g
   WHERE g.user_id = p_user
     AND g.started_at <= p_at
     AND (g.ended_at IS NULL OR g.ended_at > p_at)
     AND g.status <> 'paused'
   ORDER BY g.started_at DESC
   LIMIT 1;
$$;

-- ─── A goal changed elsewhere (onboarding, coach sheet) is recorded ─────────

CREATE OR REPLACE FUNCTION public.record_profile_goal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_kind text;
BEGIN
  IF COALESCE(current_setting('prometheus.goal_rpc', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  IF NEW.goal IS NULL OR NEW.goal NOT IN ('cut', 'maintain', 'bulk') THEN
    RETURN NULL;
  END IF;
  -- A profile that never finished onboarding has no chosen goal yet (default ≠ choice).
  IF NOT COALESCE(NEW.onboarding_completed, false) THEN
    RETURN NULL;
  END IF;
  SELECT kind INTO v_current_kind
    FROM public.athlete_goals
   WHERE user_id = NEW.id AND status IN ('active', 'maintenance');
  IF v_current_kind IS NOT DISTINCT FROM NEW.goal THEN
    RETURN NULL;
  END IF;
  PERFORM public.goal_start_internal(NEW.id, NEW.goal, '', NULL, NULL, 'profile', auth.uid(), false);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_goal_history ON public.user_profiles;
CREATE TRIGGER user_profiles_goal_history
  AFTER UPDATE OF goal, onboarding_completed ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.record_profile_goal_change();

-- ─── Backfill: the goal each onboarded athlete already has ──────────────────

WITH seeded AS (
  INSERT INTO public.athlete_goals (user_id, kind, status, started_at, created_by)
  SELECT p.id, p.goal, 'active', COALESCE(p.created_at, now()), p.id
    FROM public.user_profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE COALESCE(p.onboarding_completed, false)
     AND p.goal IN ('cut', 'maintain', 'bulk')
     AND NOT EXISTS (SELECT 1 FROM public.athlete_goals g WHERE g.user_id = p.id)
  RETURNING id, user_id, started_at
)
INSERT INTO public.athlete_goal_events (goal_id, user_id, from_status, to_status, reason, actor_id, occurred_at)
SELECT s.id, s.user_id, NULL, 'active', 'migrated', NULL, s.started_at FROM seeded s;

REVOKE ALL ON FUNCTION public.goal_metrics_now(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.goal_start_internal(uuid, text, text, numeric, date, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_profile_goal_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_goal(uuid, text, text, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_goal(uuid, text, text, numeric, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.transition_goal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_goal(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.goal_at(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.goal_at(uuid, timestamptz) TO authenticated, service_role;
