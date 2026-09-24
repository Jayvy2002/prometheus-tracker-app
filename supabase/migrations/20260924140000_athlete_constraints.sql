-- Douleurs, blessures et contraintes (Vision §7.6).
--
-- L'athlète déclare une douleur, une blessure connue, une limitation ou une
-- contrainte temporaire, y compris pendant une séance (exercice concerné).
-- Temporaire → adaptation de séance ; persistante → proposition de programme.
-- Une contrainte résolue est clôturée, jamais effacée : son historique reste.
-- Prometheus ne diagnostique pas.
--
-- - athlete_constraints / athlete_constraint_events : lecture par l'athlète et
--   son Coach actif ; écriture uniquement par RPC.
-- - declare_constraint est idempotente sur client_op_id (rejeu hors ligne).
-- - Une déclaration de l'athlète prévient son Coach actif (notification
--   « action maintenant », catégorie coaching).
-- - Reprise : le texte libre `injuries_limitations` devient une limitation
--   persistante ouverte (le champ reste tel quel).

CREATE TABLE IF NOT EXISTS public.athlete_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('pain', 'injury', 'limitation', 'constraint')),
  body_area text NOT NULL DEFAULT 'other' CHECK (body_area IN (
    'neck', 'shoulder', 'elbow', 'wrist', 'upper_back', 'lower_back',
    'hip', 'knee', 'ankle', 'foot', 'other', 'none'
  )),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  severity smallint CHECK (severity IS NULL OR severity BETWEEN 1 AND 5),
  persistence text NOT NULL CHECK (persistence IN ('temporary', 'persistent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  exercise_name text CHECK (exercise_name IS NULL OR length(exercise_name) <= 120),
  workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  declared_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_op_id text CHECK (client_op_id IS NULL OR length(client_op_id) BETWEEN 1 AND 128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS athlete_constraints_op_uidx
  ON public.athlete_constraints (user_id, client_op_id) WHERE client_op_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS athlete_constraints_user_idx
  ON public.athlete_constraints (user_id, status, declared_at DESC);

CREATE TABLE IF NOT EXISTS public.athlete_constraint_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constraint_id uuid NOT NULL REFERENCES public.athlete_constraints(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change text NOT NULL CHECK (change IN ('declared', 'updated', 'resolved', 'reopened')),
  severity smallint,
  persistence text,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS athlete_constraint_events_idx
  ON public.athlete_constraint_events (constraint_id, occurred_at);

ALTER TABLE public.athlete_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_constraint_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athlete and active coach read constraints" ON public.athlete_constraints;
CREATE POLICY "Athlete and active coach read constraints" ON public.athlete_constraints
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_coach_of(user_id));
DROP POLICY IF EXISTS "Athlete and active coach read constraint events" ON public.athlete_constraint_events;
CREATE POLICY "Athlete and active coach read constraint events" ON public.athlete_constraint_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_coach_of(user_id));

REVOKE ALL ON TABLE public.athlete_constraints FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.athlete_constraint_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.athlete_constraints TO authenticated;
GRANT SELECT ON TABLE public.athlete_constraint_events TO authenticated;
GRANT ALL ON TABLE public.athlete_constraints TO service_role;
GRANT ALL ON TABLE public.athlete_constraint_events TO service_role;

-- ─── RPCs ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.declare_constraint(
  p_user uuid,
  p_kind text,
  p_body_area text,
  p_description text DEFAULT '',
  p_severity smallint DEFAULT NULL,
  p_persistence text DEFAULT 'temporary',
  p_exercise_name text DEFAULT NULL,
  p_workout_id uuid DEFAULT NULL,
  p_client_op_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_workout uuid := p_workout_id;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_user IS NULL OR NOT (p_user = v_actor OR public.is_coach_of(p_user)) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF p_client_op_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('constraint_op:' || p_user::text || ':' || p_client_op_id, 0));
    SELECT id INTO v_id FROM public.athlete_constraints WHERE user_id = p_user AND client_op_id = p_client_op_id;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;
  -- A session reference must be the athlete's own session.
  IF v_workout IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.workouts WHERE id = v_workout AND user_id = p_user) THEN
    v_workout := NULL;
  END IF;

  INSERT INTO public.athlete_constraints (
    user_id, kind, body_area, description, severity, persistence,
    exercise_name, workout_id, created_by, client_op_id
  ) VALUES (
    p_user, p_kind, COALESCE(p_body_area, 'other'), btrim(COALESCE(p_description, '')),
    p_severity, COALESCE(p_persistence, 'temporary'),
    NULLIF(btrim(COALESCE(p_exercise_name, '')), ''), v_workout, v_actor, p_client_op_id
  ) RETURNING id INTO v_id;
  INSERT INTO public.athlete_constraint_events (constraint_id, user_id, change, severity, persistence, actor_id)
  VALUES (v_id, p_user, 'declared', p_severity, COALESCE(p_persistence, 'temporary'), v_actor);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_constraint(
  p_id uuid,
  p_severity smallint DEFAULT NULL,
  p_persistence text DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.athlete_constraints%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_row FROM public.athlete_constraints WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_row.user_id = v_actor OR public.is_coach_of(v_row.user_id)) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_row.status <> 'open' THEN RAISE EXCEPTION 'constraint_resolved'; END IF;
  UPDATE public.athlete_constraints
     SET severity = COALESCE(p_severity, severity),
         persistence = COALESCE(p_persistence, persistence),
         updated_at = now()
   WHERE id = p_id;
  INSERT INTO public.athlete_constraint_events (constraint_id, user_id, change, severity, persistence, note, actor_id)
  VALUES (p_id, v_row.user_id, 'updated', COALESCE(p_severity, v_row.severity), COALESCE(p_persistence, v_row.persistence), COALESCE(p_note, ''), v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_constraint_status(
  p_id uuid,
  p_status text,
  p_note text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.athlete_constraints%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_status NOT IN ('open', 'resolved') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT * INTO v_row FROM public.athlete_constraints WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_row.user_id = v_actor OR public.is_coach_of(v_row.user_id)) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_row.status = p_status THEN RETURN; END IF;
  UPDATE public.athlete_constraints
     SET status = p_status,
         resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = p_id;
  INSERT INTO public.athlete_constraint_events (constraint_id, user_id, change, severity, persistence, note, actor_id)
  VALUES (p_id, v_row.user_id, CASE WHEN p_status = 'resolved' THEN 'resolved' ELSE 'reopened' END,
          v_row.severity, v_row.persistence, COALESCE(p_note, ''), v_actor);
END;
$$;

-- ─── The active coach is told (Vision §21 « action now ») ───────────────────

ALTER TABLE public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_kind_check CHECK (kind IN (
  'coach_message', 'client_message', 'coaching_request', 'coach_accepted',
  'athlete_confirmed', 'program_assigned', 'proposals_waiting', 'constraint_declared'
));

CREATE OR REPLACE FUNCTION public.notify_on_constraint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach uuid;
  v_name text;
BEGIN
  BEGIN
    -- Only what the athlete declares; a coach's own note is not news to them.
    IF NEW.created_by IS DISTINCT FROM NEW.user_id THEN RETURN NULL; END IF;
    SELECT coach_id INTO v_coach FROM public.coach_client_links
     WHERE client_id = NEW.user_id AND status = 'active' LIMIT 1;
    IF v_coach IS NULL THEN RETURN NULL; END IF;
    SELECT NULLIF(btrim(full_name), '') INTO v_name FROM public.user_profiles WHERE id = NEW.user_id;
    PERFORM public.enqueue_notification(
      v_coach, 'coaching', 'constraint_declared', 'constraint:' || NEW.user_id::text,
      jsonb_build_object('name', v_name, 'area', NEW.body_area, 'kind', NEW.kind),
      '/clients/' || NEW.user_id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_constraint skipped: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS athlete_constraints_notify ON public.athlete_constraints;
CREATE TRIGGER athlete_constraints_notify
  AFTER INSERT ON public.athlete_constraints
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_constraint();

-- ─── Backfill: the free text already declared at onboarding ─────────────────

WITH seeded AS (
  INSERT INTO public.athlete_constraints (user_id, kind, body_area, description, persistence, created_by, declared_at)
  SELECT p.id, 'limitation', 'other', left(btrim(p.injuries_limitations), 500), 'persistent', p.id, COALESCE(p.created_at, now())
    FROM public.user_profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE length(btrim(COALESCE(p.injuries_limitations, ''))) > 0
     AND NOT EXISTS (SELECT 1 FROM public.athlete_constraints c WHERE c.user_id = p.id)
  RETURNING id, user_id, declared_at
)
INSERT INTO public.athlete_constraint_events (constraint_id, user_id, change, persistence, note, occurred_at)
SELECT s.id, s.user_id, 'declared', 'persistent', 'migrated', s.declared_at FROM seeded s;

REVOKE ALL ON FUNCTION public.notify_on_constraint() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.declare_constraint(uuid, text, text, text, smallint, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_constraint(uuid, text, text, text, smallint, text, text, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_constraint(uuid, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_constraint(uuid, smallint, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_constraint_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_constraint_status(uuid, text, text) TO authenticated;
