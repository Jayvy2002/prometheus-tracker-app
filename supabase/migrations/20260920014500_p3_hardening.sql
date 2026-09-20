-- P3 hardening after transversal audit. Same engine. No P4.
-- Candidate only until merge + live apply. Do not restamp 20260919233853.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS phase_anchor_on date,
  ADD COLUMN IF NOT EXISTS scheduled_activation_timezone text;

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workouts_program_id_idx
  ON public.workouts (program_id)
  WHERE program_id IS NOT NULL;

COMMENT ON COLUMN public.workouts.program_id IS
  'Durable historical program stamp. Survives assignment/day SET NULL. Written only by start_workout_from_template.';

COMMENT ON COLUMN public.programs.phase_anchor_on IS
  'Civil date the active version started for phase progression. NULL = use assignment.start_date.';
COMMENT ON COLUMN public.programs.scheduled_activation_timezone IS
  'IANA TZ frozen at schedule. Shared programs use the owner/Coach civil clock, never the first client.';

ALTER TABLE public.program_assignments
  ADD COLUMN IF NOT EXISTS frozen_revision_no integer;

COMMENT ON COLUMN public.program_assignments.frozen_revision_no IS
  'Revision stamped atomically when active → paused/completed. Archives read this snapshot, never the live graph.';

ALTER TABLE public.program_revisions
  ADD COLUMN IF NOT EXISTS version_start_on date;

COMMENT ON COLUMN public.program_revisions.version_start_on IS
  'Civil start of this revision when it became active. NULL = unprovable legacy; fallback assignment.start_date.';

ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS prescription_source text NOT NULL DEFAULT 'user';

ALTER TABLE public.workout_exercises
  DROP CONSTRAINT IF EXISTS workout_exercises_prescription_source_chk;
ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_prescription_source_chk
  CHECK (prescription_source IN ('program', 'user'));

COMMENT ON COLUMN public.workout_exercises.prescription_source IS
  'program = historical Coach/program prescription from start_workout_from_template. user = logger/solo target. Immutable.';

DROP INDEX IF EXISTS public.program_days_program_id_weekday_unique;

CREATE UNIQUE INDEX IF NOT EXISTS program_days_program_weekday_no_phase_unique
  ON public.program_days (program_id, weekday)
  WHERE weekday IS NOT NULL AND phase_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS program_days_program_phase_weekday_unique
  ON public.program_days (program_id, phase_id, weekday)
  WHERE weekday IS NOT NULL AND phase_id IS NOT NULL;

-- SET NULL on phase delete made two Mondays share phase_id NULL and broke
-- the legacy unique. Removing a phase removes its days; save_program then
-- rebuilds the payload. Workout stamps stay ON DELETE SET NULL.
-- Those workout FKs must be DEFERRABLE INITIALLY IMMEDIATE: CASCADE-deleting
-- a phase then SET NULL of program_phase_id otherwise rechecks program_day_id
-- after the day row is already gone. save_program is not replaced.
DO $$
DECLARE
  v_con text;
  v_col text;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'program_days'
    AND c.contype = 'f'
    AND a.attname = 'phase_id'
  LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.program_days DROP CONSTRAINT %I', v_con);
  END IF;

  FOREACH v_col IN ARRAY ARRAY['program_day_id', 'program_phase_id'] LOOP
    LOOP
      v_con := NULL;
      SELECT c.conname INTO v_con
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'workouts'
        AND c.contype = 'f'
        AND a.attname = v_col
      LIMIT 1;
      EXIT WHEN v_con IS NULL;
      EXECUTE format('ALTER TABLE public.workouts DROP CONSTRAINT %I', v_con);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.program_days
  ADD CONSTRAINT program_days_phase_id_fkey
  FOREIGN KEY (phase_id) REFERENCES public.program_phases(id) ON DELETE CASCADE;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_program_day_id_fkey
  FOREIGN KEY (program_day_id) REFERENCES public.program_days(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_program_phase_id_fkey
  FOREIGN KEY (program_phase_id) REFERENCES public.program_phases(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE OR REPLACE FUNCTION public.program_actor_timezone(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT NULLIF(btrim(COALESCE(up.timezone, '')), '')
    INTO v_tz
  FROM public.user_profiles up
  WHERE up.id = p_user_id;
  RETURN COALESCE(v_tz, 'America/Toronto');
END;
$$;

REVOKE ALL ON FUNCTION public.program_actor_timezone(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_actor_timezone(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.program_civil_date(p_tz text, p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  v_tz := NULLIF(btrim(COALESCE(p_tz, '')), '');
  IF v_tz IS NULL THEN
    v_tz := 'America/Toronto';
  END IF;
  BEGIN
    RETURN (p_at AT TIME ZONE v_tz)::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN (p_at AT TIME ZONE 'America/Toronto')::date;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.program_civil_date(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_civil_date(text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.program_version_is_due(p_on date, p_tz text, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_on IS NOT NULL AND p_on <= public.program_civil_date(p_tz, p_at);
$$;

REVOKE ALL ON FUNCTION public.program_version_is_due(date, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_version_is_due(date, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.program_activation_timezone(p_program_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.programs WHERE id = p_program_id;
  RETURN public.program_actor_timezone(v_owner);
END;
$$;

REVOKE ALL ON FUNCTION public.program_activation_timezone(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_activation_timezone(uuid) TO service_role;
COMMENT ON FUNCTION public.program_activation_timezone(uuid) IS
  'Owner/Coach civil TZ used to freeze scheduled_activation_timezone. Not a live client lookup.';

CREATE OR REPLACE FUNCTION public.program_current_phase_id(p_program_id uuid, p_anchor date, p_today date)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase record;
  v_week int;
  v_cursor int := 0;
  v_span int;
  v_timed int := 0;
  v_first uuid;
  v_last uuid;
BEGIN
  IF p_program_id IS NULL OR p_anchor IS NULL OR p_today IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COUNT(*) INTO v_timed
  FROM public.program_phases
  WHERE program_id = p_program_id
    AND duration_weeks IS NOT NULL
    AND duration_weeks > 0;
  IF v_timed = 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.program_phases
    WHERE program_id = p_program_id
      AND (duration_weeks IS NULL OR duration_weeks < 1)
  ) THEN
    -- Mixed timed/untimed is invalid; do not invent a 1-week span.
    RETURN NULL;
  END IF;
  IF p_today < p_anchor THEN
    v_week := 0;
  ELSE
    v_week := (p_today - p_anchor) / 7;
  END IF;
  FOR v_phase IN
    SELECT id, duration_weeks
    FROM public.program_phases
    WHERE program_id = p_program_id
    ORDER BY order_index
  LOOP
    IF v_first IS NULL THEN v_first := v_phase.id; END IF;
    v_last := v_phase.id;
    v_span := v_phase.duration_weeks;
    IF v_week < v_cursor + v_span THEN
      RETURN v_phase.id;
    END IF;
    v_cursor := v_cursor + v_span;
  END LOOP;
  RETURN COALESCE(v_last, v_first);
END;
$$;

REVOKE ALL ON FUNCTION public.program_current_phase_id(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_current_phase_id(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.program_effective_version_start(p_assignment_start date, p_version_start date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_assignment_start IS NULL THEN p_version_start
    WHEN p_version_start IS NULL THEN p_assignment_start
    WHEN p_assignment_start >= p_version_start THEN p_assignment_start
    ELSE p_version_start
  END;
$$;

REVOKE ALL ON FUNCTION public.program_effective_version_start(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_effective_version_start(date, date) TO service_role;
COMMENT ON FUNCTION public.program_effective_version_start(date, date) IS
  'laterOf(assignment.start_date, revision version_start_on / phase_anchor_on). New clients start week 1 on their start_date.';

CREATE OR REPLACE FUNCTION public.actor_can_activate_program_version(p_program_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = p_program_id AND p.owner_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;
  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RETURN false;
  END IF;
  -- Only ACTIVE assignments impose Coach authority. Frozen paused/completed
  -- archives of a former client must not block the owner for remaining clients.
  IF EXISTS (
    SELECT 1
    FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id
      AND pa.client_id IS DISTINCT FROM auth.uid()
      AND pa.status = 'active'
      AND pa.assigned_by = auth.uid()
      AND NOT public.is_coach_of(pa.client_id)
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.actor_can_activate_program_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actor_can_activate_program_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.actor_can_read_program(p_program_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = p_program_id AND p.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id
      AND pa.client_id = auth.uid()
      AND pa.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id
      AND public.is_coach_of(pa.client_id)
      AND pa.status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.actor_can_read_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actor_can_read_program(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_program_graph_payload(p_org text, p_days jsonb, p_phases jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org text;
  v_day jsonb;
  v_ex jsonb;
  v_phase jsonb;
  v_weekday int;
  v_name text;
  v_sets int;
  v_reps int;
  v_rest int;
  v_weeks int;
  v_id uuid;
  v_phase_ids uuid[] := '{}';
  v_seen_ids uuid[] := '{}';
  v_seen text[] := '{}';
  v_wd_key text;
  v_phase_key text;
  v_wd_phases jsonb := '{}'::jsonb;
  v_share boolean := false;
  v_phase_count int;
  v_timed int := 0;
  v_untimed int := 0;
BEGIN
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 42 THEN RAISE EXCEPTION 'Too many days'; END IF;
  v_org := public.normalize_session_organization(p_org);

  IF p_phases IS NOT NULL THEN
    IF jsonb_typeof(p_phases) <> 'array' THEN RAISE EXCEPTION 'Invalid payload'; END IF;
    IF jsonb_array_length(p_phases) > 24 THEN RAISE EXCEPTION 'Too many phases'; END IF;
    FOR v_phase IN SELECT * FROM jsonb_array_elements(p_phases) LOOP
      v_name := NULLIF(btrim(COALESCE(v_phase->>'name', '')), '');
      IF v_name IS NULL THEN RAISE EXCEPTION 'Phase name required'; END IF;
      IF char_length(v_name) > 80 THEN RAISE EXCEPTION 'Phase name too long'; END IF;
      BEGIN
        v_weeks := NULLIF(btrim(COALESCE(v_phase->>'duration_weeks', '')), '')::int;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid phase duration';
      END;
      IF v_weeks IS NOT NULL AND (v_weeks < 1 OR v_weeks > 52) THEN
        RAISE EXCEPTION 'Invalid phase duration';
      END IF;
      IF v_weeks IS NULL THEN
        v_untimed := v_untimed + 1;
      ELSE
        v_timed := v_timed + 1;
      END IF;
      v_id := NULL;
      BEGIN
        v_id := NULLIF(btrim(COALESCE(v_phase->>'id', '')), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid payload';
      END;
      IF v_id IS NOT NULL THEN
        IF v_id = ANY (v_seen_ids) THEN RAISE EXCEPTION 'Invalid phase'; END IF;
        v_seen_ids := v_seen_ids || v_id;
        v_phase_ids := v_phase_ids || v_id;
      END IF;
    END LOOP;
  END IF;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    IF v_org = 'fixed_days' THEN
      BEGIN
        v_weekday := (v_day->>'weekday')::int;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid weekday';
      END;
      IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
        RAISE EXCEPTION 'Invalid weekday';
      END IF;
      v_phase_key := COALESCE(NULLIF(btrim(COALESCE(v_day->>'phase_id', '')), ''), '-');
      v_wd_key := v_phase_key || ':' || v_weekday::text;
      IF v_wd_key = ANY (v_seen) THEN
        RAISE EXCEPTION 'Duplicate weekday %', v_weekday;
      END IF;
      v_seen := v_seen || v_wd_key;
      v_wd_phases := jsonb_set(
        v_wd_phases,
        ARRAY[v_weekday::text],
        COALESCE(v_wd_phases -> v_weekday::text, '[]'::jsonb) || jsonb_build_array(v_phase_key)
      );
    END IF;
    IF p_phases IS NOT NULL THEN
      v_id := NULL;
      BEGIN
        v_id := NULLIF(btrim(COALESCE(v_day->>'phase_id', '')), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid payload';
      END;
      IF v_id IS NOT NULL AND NOT (v_id = ANY (v_phase_ids)) THEN
        RAISE EXCEPTION 'Invalid phase';
      END IF;
    END IF;
    IF v_day->'exercises' IS NOT NULL AND jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day';
    END IF;
    IF jsonb_typeof(v_day->'exercises') <> 'array' THEN
      CONTINUE;
    END IF;
    IF jsonb_array_length(v_day->'exercises') > 100 THEN RAISE EXCEPTION 'Too many exercises'; END IF;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
      v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
      IF v_name IS NULL THEN RAISE EXCEPTION 'Exercise name required'; END IF;
      BEGIN
        v_sets := COALESCE((v_ex->>'default_sets')::int, 3);
        v_reps := COALESCE((v_ex->>'default_reps')::int, 10);
        v_rest := COALESCE((v_ex->>'default_rest_seconds')::int, 90);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid numbers for %', v_name;
      END;
      IF v_sets < 1 OR v_sets > 20 THEN RAISE EXCEPTION 'Invalid sets for %', v_name; END IF;
      IF v_reps < 0 OR v_reps > 5000 THEN RAISE EXCEPTION 'Invalid reps for %', v_name; END IF;
      IF v_rest < 0 OR v_rest > 3600 THEN RAISE EXCEPTION 'Invalid rest for %', v_name; END IF;
    END LOOP;
  END LOOP;

  -- Timed programs: every phase has a duration. Descriptive programs: none do.
  -- Mixed timed/untimed is rejected so the engine never invents a 1-week span.
  IF v_timed > 0 AND v_untimed > 0 THEN
    RAISE EXCEPTION 'mixed phase durations';
  END IF;

  -- Multi-phase sharing the same weekday must have explicit durations so the
  -- timed engine can pick one active phase. Untimed labels stay allowed when
  -- weekdays do not collide. No-phase programs are unchanged.
  IF v_org = 'fixed_days'
     AND p_phases IS NOT NULL
     AND jsonb_typeof(p_phases) = 'array'
     AND jsonb_array_length(p_phases) >= 2 THEN
    FOR v_weekday IN 0..6 LOOP
      SELECT count(DISTINCT x) INTO v_phase_count
      FROM jsonb_array_elements_text(COALESCE(v_wd_phases -> v_weekday::text, '[]'::jsonb)) AS x;
      IF COALESCE(v_phase_count, 0) >= 2 THEN
        v_share := true;
      END IF;
    END LOOP;
    IF v_share THEN
      FOR v_phase IN SELECT * FROM jsonb_array_elements(p_phases) LOOP
        BEGIN
          v_weeks := NULLIF(btrim(COALESCE(v_phase->>'duration_weeks', '')), '')::int;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'phase duration required';
        END;
        IF v_weeks IS NULL OR v_weeks < 1 THEN
          RAISE EXCEPTION 'phase duration required';
        END IF;
      END LOOP;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_program_graph_payload(text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_program_graph_payload(text, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_program_version(p_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_program_id IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.program_assignments
    WHERE program_id = p_program_id AND status = 'active'
  ) THEN
    RETURN;
  END IF;
  UPDATE public.programs
  SET
    scheduled_revision_no = NULL,
    scheduled_activates_on = NULL,
    scheduled_activation_timezone = NULL
  WHERE id = p_program_id
    AND scheduled_revision_no IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_scheduled_program_version(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.program_assignments_cancel_orphan_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cancel_scheduled_program_version(COALESCE(NEW.program_id, OLD.program_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.program_assignments_cancel_orphan_schedule() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS program_assignments_cancel_orphan_schedule ON public.program_assignments;
CREATE TRIGGER program_assignments_cancel_orphan_schedule
  AFTER UPDATE OF status ON public.program_assignments
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active')
  EXECUTE FUNCTION public.program_assignments_cancel_orphan_schedule();

CREATE OR REPLACE FUNCTION public.sync_program_days(
  p_program_id uuid,
  p_days jsonb,
  p_skip_snapshot boolean,
  p_trusted boolean
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day jsonb;
  v_ex jsonb;
  v_ex_arr jsonb;
  v_weekday int;
  v_name text;
  v_day_id uuid;
  v_payload_id uuid;
  v_phase_id uuid;
  v_used uuid[] := '{}';
  v_order int := 0;
  v_ex_count int;
  v_day_total int := 0;
  v_org text;
  v_seen text[] := '{}';
  v_wd_key text;
  v_phases jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 42 THEN RAISE EXCEPTION 'Too many days'; END IF;
  IF NOT COALESCE(p_trusted, false) THEN
    IF NOT EXISTS (SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = v_uid) THEN
      RAISE EXCEPTION 'Not program owner';
    END IF;
    IF public.coached_client_cannot_edit_program(p_program_id) THEN
      RAISE EXCEPTION 'Coached client cannot edit assigned program';
    END IF;
  END IF;

  SELECT public.normalize_session_organization(p.session_organization)
    INTO v_org
  FROM public.programs p
  WHERE p.id = p_program_id;

  -- save_program is not replaced. It syncs phases first, then calls this
  -- wrapper. Load the live phase rows so shared-weekday duration rules apply.
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ph.id,
      'name', ph.name,
      'duration_weeks', ph.duration_weeks
    ) ORDER BY ph.order_index)
    FROM public.program_phases ph
    WHERE ph.program_id = p_program_id
  ), '[]'::jsonb)
    INTO v_phases;

  PERFORM public.validate_program_graph_payload(v_org, p_days, v_phases);

  -- Validation complète AVANT toute mutation.
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    IF v_org = 'fixed_days' THEN
      BEGIN
        v_weekday := (v_day->>'weekday')::int;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid weekday';
      END;
      IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN RAISE EXCEPTION 'Invalid weekday'; END IF;
      v_wd_key := COALESCE(NULLIF(btrim(COALESCE(v_day->>'phase_id', '')), ''), '-') || ':' || v_weekday::text;
      IF v_wd_key = ANY (v_seen) THEN RAISE EXCEPTION 'Duplicate weekday %', v_weekday; END IF;
      v_seen := v_seen || v_wd_key;
    END IF;
    v_ex_arr := v_day->'exercises';
    IF v_ex_arr IS NULL OR jsonb_typeof(v_ex_arr) <> 'array' THEN
      IF COALESCE(p_trusted, false) THEN
        v_ex_arr := '[]'::jsonb;
      ELSE
        RAISE EXCEPTION 'Invalid exercises for day';
      END IF;
    END IF;
    IF jsonb_array_length(v_ex_arr) > 100 THEN RAISE EXCEPTION 'Too many exercises'; END IF;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_ex_arr) LOOP
      v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
      IF v_name IS NULL THEN RAISE EXCEPTION 'Exercise name required'; END IF;
    END LOOP;
  END LOOP;

  UPDATE public.program_days
  SET order_index = order_index - 10000
  WHERE program_id = p_program_id;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    v_day_id := NULL;
    v_payload_id := NULL;
    v_phase_id := NULL;
    IF v_org = 'fixed_days' THEN
      v_weekday := (v_day->>'weekday')::int;
    ELSE
      v_weekday := NULL;
    END IF;
    BEGIN
      v_payload_id := NULLIF(btrim(COALESCE(v_day->>'id', '')), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid payload';
    END;
    BEGIN
      v_phase_id := NULLIF(btrim(COALESCE(v_day->>'phase_id', '')), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid payload';
    END;
    IF v_phase_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.program_phases ph
      WHERE ph.id = v_phase_id AND ph.program_id = p_program_id
    ) THEN
      RAISE EXCEPTION 'Invalid phase';
    END IF;
    IF v_payload_id IS NOT NULL THEN
      SELECT d.id INTO v_day_id
      FROM public.program_days d
      WHERE d.program_id = p_program_id AND d.id = v_payload_id AND NOT (d.id = ANY (v_used))
      LIMIT 1;
    END IF;
    IF v_day_id IS NULL AND v_org = 'fixed_days' THEN
      SELECT d.id INTO v_day_id
      FROM public.program_days d
      WHERE d.program_id = p_program_id
        AND d.weekday = v_weekday
        AND d.phase_id IS NOT DISTINCT FROM v_phase_id
        AND NOT (d.id = ANY (v_used))
      LIMIT 1;
    END IF;
    IF v_day_id IS NULL THEN
      SELECT d.id INTO v_day_id
      FROM public.program_days d
      WHERE d.program_id = p_program_id AND d.order_index = v_order - 10000 AND NOT (d.id = ANY (v_used))
      LIMIT 1;
    END IF;
    IF v_day_id IS NULL THEN
      INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index, phase_id)
      VALUES (p_program_id, v_weekday, COALESCE(v_day->>'name', ''), NULL, v_order, v_phase_id)
      RETURNING id INTO v_day_id;
    ELSE
      UPDATE public.program_days
      SET name = COALESCE(v_day->>'name', name), weekday = v_weekday, order_index = v_order, phase_id = v_phase_id
      WHERE id = v_day_id;
    END IF;
    v_used := v_used || v_day_id;
    v_order := v_order + 1;
    DELETE FROM public.program_day_exercises WHERE program_day_id = v_day_id;
    v_ex_arr := v_day->'exercises';
    IF v_ex_arr IS NULL OR jsonb_typeof(v_ex_arr) <> 'array' THEN
      v_ex_arr := '[]'::jsonb;
    END IF;
    v_ex_count := 0;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_ex_arr) LOOP
      INSERT INTO public.program_day_exercises (
        program_day_id, name, default_sets, default_reps, default_reps_min, default_rir,
        default_rest_seconds, default_weight_kg, order_index,
        set_type, superset_group, drop_count, tempo, isometric_seconds,
        cluster_rest_seconds, cluster_reps_per_burst, myo_activation
      ) VALUES (
        v_day_id,
        btrim(v_ex->>'name'),
        COALESCE((v_ex->>'default_sets')::int, 3),
        COALESCE((v_ex->>'default_reps')::int, 10),
        NULLIF(v_ex->>'default_reps_min', '')::int,
        NULLIF(v_ex->>'default_rir', '')::int,
        COALESCE((v_ex->>'default_rest_seconds')::int, 90),
        NULLIF(v_ex->>'default_weight_kg', '')::numeric,
        COALESCE((v_ex->>'order_index')::int, v_ex_count),
        COALESCE(NULLIF(v_ex->>'set_type', ''), 'working'),
        NULLIF(v_ex->>'superset_group', ''),
        NULLIF(v_ex->>'drop_count', '')::int,
        NULLIF(v_ex->>'tempo', ''),
        NULLIF(v_ex->>'isometric_seconds', '')::int,
        NULLIF(v_ex->>'cluster_rest_seconds', '')::int,
        NULLIF(v_ex->>'cluster_reps_per_burst', '')::int,
        COALESCE((v_ex->>'myo_activation')::boolean, false)
      );
      v_ex_count := v_ex_count + 1;
    END LOOP;
    v_day_total := v_day_total + 1;
  END LOOP;
  DELETE FROM public.program_days d WHERE d.program_id = p_program_id AND NOT (d.id = ANY (v_used));
  UPDATE public.programs SET updated_at = now() WHERE id = p_program_id;
  IF NOT COALESCE(p_skip_snapshot, false) THEN
    PERFORM public.snapshot_program_revision(p_program_id);
  END IF;
  RETURN v_day_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_program_days(p_program_id uuid, p_days jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validation complète AVANT toute mutation.
  RETURN public.sync_program_days(p_program_id, p_days, false, false);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.programs_protect_version_pointers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND (
       NEW.active_revision_no IS DISTINCT FROM OLD.active_revision_no
       OR NEW.scheduled_revision_no IS DISTINCT FROM OLD.scheduled_revision_no
       OR NEW.scheduled_activates_on IS DISTINCT FROM OLD.scheduled_activates_on
       OR NEW.scheduled_activation_timezone IS DISTINCT FROM OLD.scheduled_activation_timezone
       OR NEW.phase_anchor_on IS DISTINCT FROM OLD.phase_anchor_on
     ) THEN
    RAISE EXCEPTION 'program version pointers are RPC-only';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.programs_protect_version_pointers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_program_revision_snapshot(
  p_program_id uuid,
  p_revision_no int,
  p_anchor_mode text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap jsonb;
  v_days jsonb;
  v_phases jsonb;
  v_org text;
  v_weeks int;
  v_prev int;
  v_activated timestamptz;
  v_name text;
  v_desc text;
  v_owner uuid;
  v_anchor date;
  v_sched_on date;
  v_sched_no int;
BEGIN
  IF p_program_id IS NULL OR p_revision_no IS NULL THEN
    RAISE EXCEPTION 'revision not found';
  END IF;
  SELECT active_revision_no, owner_id, scheduled_activates_on, scheduled_revision_no
    INTO v_prev, v_owner, v_sched_on, v_sched_no
  FROM public.programs
  WHERE id = p_program_id
  FOR UPDATE;
  IF v_prev IS NULL AND NOT EXISTS (SELECT 1 FROM public.programs WHERE id = p_program_id) THEN
    RAISE EXCEPTION 'revision not found';
  END IF;
  IF v_prev IS NOT DISTINCT FROM p_revision_no THEN
    RETURN p_revision_no;
  END IF;

  SELECT snapshot, activated_at
    INTO v_snap, v_activated
  FROM public.program_revisions
  WHERE program_id = p_program_id AND revision_no = p_revision_no;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'revision not found'; END IF;
  IF v_activated IS NOT NULL THEN
    RAISE EXCEPTION 'historical';
  END IF;

  IF jsonb_typeof(v_snap) = 'array' THEN
    v_days := v_snap;
    v_phases := '[]'::jsonb;
    v_org := NULL;
    v_weeks := NULL;
    v_name := NULL;
    v_desc := NULL;
  ELSE
    v_days := COALESCE(v_snap->'days', '[]'::jsonb);
    v_phases := COALESCE(v_snap->'phases', '[]'::jsonb);
    v_org := NULLIF(btrim(COALESCE(v_snap->>'session_organization', '')), '');
    v_name := NULLIF(btrim(COALESCE(v_snap->>'name', '')), '');
    v_desc := CASE WHEN v_snap ? 'description' THEN COALESCE(v_snap->>'description', '') ELSE NULL END;
    BEGIN
      v_weeks := NULLIF(btrim(COALESCE(v_snap->>'duration_weeks', '')), '')::int;
    EXCEPTION WHEN OTHERS THEN
      v_weeks := NULL;
    END;
  END IF;
  IF jsonb_typeof(v_days) <> 'array' THEN RAISE EXCEPTION 'Invalid payload'; END IF;
  IF jsonb_typeof(v_phases) <> 'array' THEN RAISE EXCEPTION 'Invalid payload'; END IF;

  PERFORM public.validate_program_graph_payload(
    COALESCE(public.normalize_session_organization(v_org), (
      SELECT public.normalize_session_organization(session_organization)
      FROM public.programs WHERE id = p_program_id
    )),
    v_days,
    v_phases
  );

  -- Anchor mode is explicit: scheduled/due keeps the planned civil date;
  -- Activer maintenant uses the owner civil clock even if a future date was scheduled.
  IF p_anchor_mode = 'scheduled' THEN
    IF v_sched_on IS NULL THEN
      RAISE EXCEPTION 'scheduled_anchor_required';
    END IF;
    v_anchor := v_sched_on;
  ELSIF p_anchor_mode = 'now' THEN
    v_anchor := public.program_civil_date(public.program_actor_timezone(v_owner), now());
  ELSE
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  UPDATE public.programs
  SET
    name = COALESCE(v_name, name),
    description = COALESCE(v_desc, description),
    session_organization = COALESCE(
      public.normalize_session_organization(v_org),
      session_organization
    ),
    duration_weeks = CASE
      WHEN v_weeks IS NOT NULL AND v_weeks BETWEEN 1 AND 52 THEN v_weeks
      ELSE duration_weeks
    END,
    scheduled_revision_no = NULL,
    scheduled_activates_on = NULL,
    scheduled_activation_timezone = NULL,
    active_revision_no = p_revision_no,
    phase_anchor_on = v_anchor
  WHERE id = p_program_id;

  PERFORM public.sync_program_phases(p_program_id, v_phases, true);
  PERFORM public.sync_program_days(p_program_id, v_days, true, true);

  IF v_prev IS NOT NULL AND v_prev IS DISTINCT FROM p_revision_no THEN
    UPDATE public.program_revisions
    SET superseded_at = COALESCE(superseded_at, now())
    WHERE program_id = p_program_id AND revision_no = v_prev AND superseded_at IS NULL;
  END IF;
  UPDATE public.program_revisions
  SET
    activated_at = COALESCE(activated_at, now()),
    version_start_on = COALESCE(version_start_on, v_anchor)
  WHERE program_id = p_program_id AND revision_no = p_revision_no;
  RETURN p_revision_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_program_version(
  p_program_id uuid,
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_session_organization text DEFAULT NULL,
  p_phases jsonb DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_seen timestamptz;
  v_name text;
  v_weeks int;
  v_org text;
  v_live_org text;
  v_phases jsonb;
  v_no int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN RAISE EXCEPTION 'Invalid payload'; END IF;
  v_weeks := GREATEST(1, LEAST(52, COALESCE(p_duration_weeks, 8)));
  v_phases := COALESCE(p_phases, '[]'::jsonb);
  IF jsonb_typeof(v_phases) <> 'array' THEN RAISE EXCEPTION 'Invalid payload'; END IF;
  IF jsonb_array_length(v_phases) > 24 THEN RAISE EXCEPTION 'Too many phases'; END IF;

  SELECT p.owner_id, p.updated_at, p.session_organization
    INTO v_owner, v_seen, v_live_org
  FROM public.programs p
  WHERE p.id = p_program_id
  FOR UPDATE;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_seen IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stale';
  END IF;

  IF p_session_organization IS NULL OR btrim(p_session_organization) = '' THEN
    v_org := public.normalize_session_organization(v_live_org);
  ELSE
    v_org := public.normalize_session_organization(p_session_organization);
  END IF;

  PERFORM public.validate_program_graph_payload(v_org, p_days, v_phases);

  SELECT COALESCE(MAX(revision_no), 0) + 1 INTO v_no
  FROM public.program_revisions
  WHERE program_id = p_program_id;

  INSERT INTO public.program_revisions (program_id, revision_no, snapshot, created_by)
  VALUES (
    p_program_id,
    v_no,
    jsonb_build_object(
      'session_organization', v_org,
      'name', v_name,
      'description', COALESCE(p_description, ''),
      'duration_weeks', v_weeks,
      'phases', v_phases,
      'days', p_days
    ),
    v_uid
  );

  UPDATE public.programs SET updated_at = now() WHERE id = p_program_id;
  RETURN v_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_program_version(
  p_program_id uuid,
  p_revision_no int,
  p_activates_on date,
  p_replace boolean DEFAULT false,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_seen timestamptz;
  v_active int;
  v_sched int;
  v_activated timestamptz;
  v_snap jsonb;
  v_days jsonb;
  v_phases jsonb;
  v_org text;
  v_today date;
  v_tz text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_revision_no IS NULL OR p_activates_on IS NULL THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  SELECT owner_id, updated_at, active_revision_no, scheduled_revision_no
    INTO v_owner, v_seen, v_active, v_sched
  FROM public.programs
  WHERE id = p_program_id
  FOR UPDATE;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;
  IF NOT public.actor_can_activate_program_version(p_program_id) THEN
    RAISE EXCEPTION 'Not an active coach of this assignment';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_seen IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stale';
  END IF;

  SELECT activated_at, snapshot INTO v_activated, v_snap
  FROM public.program_revisions
  WHERE program_id = p_program_id AND revision_no = p_revision_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found'; END IF;

  IF v_active IS NOT DISTINCT FROM p_revision_no THEN
    RETURN p_revision_no;
  END IF;
  IF v_activated IS NOT NULL THEN
    RAISE EXCEPTION 'historical';
  END IF;

  IF jsonb_typeof(v_snap) = 'array' THEN
    v_days := v_snap;
    v_phases := '[]'::jsonb;
    v_org := NULL;
  ELSE
    v_days := COALESCE(v_snap->'days', '[]'::jsonb);
    v_phases := COALESCE(v_snap->'phases', '[]'::jsonb);
    v_org := NULLIF(btrim(COALESCE(v_snap->>'session_organization', '')), '');
  END IF;
  PERFORM public.validate_program_graph_payload(
    COALESCE(public.normalize_session_organization(v_org), (
      SELECT public.normalize_session_organization(session_organization)
      FROM public.programs WHERE id = p_program_id
    )),
    v_days,
    v_phases
  );

  IF v_sched IS NOT NULL AND v_sched IS DISTINCT FROM p_revision_no AND NOT COALESCE(p_replace, false) THEN
    RAISE EXCEPTION 'already_scheduled';
  END IF;

  v_tz := public.program_activation_timezone(p_program_id);
  v_today := public.program_civil_date(v_tz, now());
  IF p_activates_on < v_today THEN
    RAISE EXCEPTION 'activation_date_in_past';
  END IF;

  UPDATE public.programs
  SET
    scheduled_revision_no = p_revision_no,
    scheduled_activates_on = p_activates_on,
    scheduled_activation_timezone = v_tz,
    updated_at = now()
  WHERE id = p_program_id;

  IF p_activates_on = v_today THEN
    RETURN public.apply_program_revision_snapshot(p_program_id, p_revision_no, 'scheduled');
  END IF;
  RETURN p_revision_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_due_program_version(p_program_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sched int;
  v_on date;
  v_active int;
  v_today date;
  v_tz text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL THEN RAISE EXCEPTION 'Invalid payload'; END IF;

  -- Paused/completed archives cannot read the live graph, so this no-op
  -- must run before actor_can_read_program (active-only).
  IF EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id AND pa.client_id = v_uid
  ) AND NOT EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id AND pa.client_id = v_uid AND pa.status = 'active'
  ) THEN
    RETURN 0;
  END IF;

  IF NOT public.actor_can_read_program(p_program_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT active_revision_no, scheduled_revision_no, scheduled_activates_on, scheduled_activation_timezone
    INTO v_active, v_sched, v_on, v_tz
  FROM public.programs
  WHERE id = p_program_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_sched IS NULL OR v_on IS NULL OR NULLIF(btrim(COALESCE(v_tz, '')), '') IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id AND pa.status = 'active'
  ) THEN
    PERFORM public.cancel_scheduled_program_version(p_program_id);
    RETURN 0;
  END IF;

  v_today := public.program_civil_date(v_tz, now());
  IF v_on > v_today THEN
    RETURN 0;
  END IF;
  IF v_active IS NOT DISTINCT FROM v_sched THEN
    UPDATE public.programs
    SET
      scheduled_revision_no = NULL,
      scheduled_activates_on = NULL,
      scheduled_activation_timezone = NULL
    WHERE id = p_program_id;
    RETURN v_sched;
  END IF;
  RETURN public.apply_program_revision_snapshot(p_program_id, v_sched, 'scheduled');
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_program_revision(p_program_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no int;
  v_snap jsonb;
  v_org text;
  v_prev int;
  v_name text;
  v_desc text;
  v_weeks int;
  v_anchor date;
BEGIN
  IF p_program_id IS NULL THEN RAISE EXCEPTION 'Program required'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF auth.uid() IS NOT NULL AND public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;
  PERFORM 1 FROM public.programs WHERE id = p_program_id FOR UPDATE;
  SELECT public.normalize_session_organization(session_organization), active_revision_no,
         name, description, duration_weeks, phase_anchor_on
    INTO v_org, v_prev, v_name, v_desc, v_weeks, v_anchor
  FROM public.programs
  WHERE id = p_program_id;
  SELECT COALESCE(MAX(revision_no), 0) + 1 INTO v_no
  FROM public.program_revisions
  WHERE program_id = p_program_id;
  SELECT jsonb_build_object(
    'session_organization', v_org,
    'name', COALESCE(v_name, ''),
    'description', COALESCE(v_desc, ''),
    'duration_weeks', v_weeks,
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'name', ph.name,
        'description', ph.description,
        'order_index', ph.order_index,
        'duration_weeks', ph.duration_weeks
      ) ORDER BY ph.order_index)
      FROM public.program_phases ph
      WHERE ph.program_id = p_program_id
    ), '[]'::jsonb),
    'days', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'weekday', d.weekday,
        'name', d.name,
        'order_index', d.order_index,
        'phase_id', d.phase_id,
        'exercises', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', e.id,
            'name', e.name,
            'default_sets', e.default_sets,
            'default_reps', e.default_reps,
            'default_reps_min', e.default_reps_min,
            'default_rir', e.default_rir,
            'default_rest_seconds', e.default_rest_seconds,
            'default_weight_kg', e.default_weight_kg,
            'order_index', e.order_index,
            'set_type', e.set_type,
            'superset_group', e.superset_group,
            'drop_count', e.drop_count,
            'tempo', e.tempo,
            'isometric_seconds', e.isometric_seconds,
            'cluster_rest_seconds', e.cluster_rest_seconds,
            'cluster_reps_per_burst', e.cluster_reps_per_burst,
            'myo_activation', e.myo_activation
          ) ORDER BY e.order_index)
          FROM public.program_day_exercises e
          WHERE e.program_day_id = d.id
        ), '[]'::jsonb)
      ) ORDER BY d.order_index)
      FROM public.program_days d
      WHERE d.program_id = p_program_id
    ), '[]'::jsonb)
  ) INTO v_snap;
  INSERT INTO public.program_revisions (program_id, revision_no, snapshot, created_by, activated_at, version_start_on)
  VALUES (p_program_id, v_no, v_snap, auth.uid(), now(), v_anchor);
  IF v_prev IS NOT NULL AND v_prev IS DISTINCT FROM v_no THEN
    UPDATE public.program_revisions
    SET superseded_at = COALESCE(superseded_at, now())
    WHERE program_id = p_program_id AND revision_no = v_prev AND superseded_at IS NULL;
  END IF;
  UPDATE public.programs SET active_revision_no = v_no WHERE id = p_program_id;
  RETURN v_no;
END;
$$;
CREATE OR REPLACE FUNCTION public.start_workout_from_template(
  p_name text,
  p_date timestamptz,
  p_routine_id uuid DEFAULT NULL,
  p_program_assignment_id uuid DEFAULT NULL,
  p_program_day_id uuid DEFAULT NULL,
  p_exercises jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_workout_id uuid;
  v_exercise_id uuid;
  v_item jsonb;
  v_position bigint;
  v_set_count integer;
  v_set_type text;
  v_phase_id uuid;
  v_phase_name text;
  v_revision_no int;
  v_exercises jsonb;
  v_program_id uuid;
  v_anchor date;
  v_today date;
  v_current_phase uuid;
  v_start date;
  v_version_start date;
  v_effective date;
  v_source text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'workout_name_required';
  END IF;
  IF p_program_day_id IS NULL AND (
       jsonb_typeof(COALESCE(p_exercises, '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(p_exercises, '[]'::jsonb)) > 100
     ) THEN
    RAISE EXCEPTION 'invalid_workout_template';
  END IF;
  IF p_routine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.routines r WHERE r.id = p_routine_id AND r.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'invalid_routine';
  END IF;
  IF p_program_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.id = p_program_assignment_id AND pa.client_id = v_user_id AND pa.status = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid_program_assignment';
  END IF;
  IF p_program_assignment_id IS NOT NULL THEN
    SELECT pa.start_date, p.phase_anchor_on, r.version_start_on
      INTO v_start, v_anchor, v_version_start
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
    LEFT JOIN public.program_revisions r
      ON r.program_id = p.id AND r.revision_no = p.active_revision_no
    WHERE pa.id = p_program_assignment_id;
    v_today := public.program_civil_date(public.program_actor_timezone(v_user_id), now());
    v_effective := public.program_effective_version_start(
      v_start,
      COALESCE(v_version_start, v_anchor)
    );
    IF v_today < v_effective THEN
      RAISE EXCEPTION 'program_not_started';
    END IF;
  END IF;
  IF p_program_day_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.program_days pd
    JOIN public.program_assignments pa ON pa.program_id = pd.program_id
    WHERE pd.id = p_program_day_id
      AND pa.id = p_program_assignment_id
      AND pa.client_id = v_user_id
      AND pa.status = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid_program_day';
  END IF;

  IF p_program_day_id IS NOT NULL THEN
    SELECT pd.phase_id, ph.name, pd.program_id, p.phase_anchor_on, pa.start_date, p.active_revision_no,
           r.version_start_on
      INTO v_phase_id, v_phase_name, v_program_id, v_anchor, v_start, v_revision_no, v_version_start
    FROM public.program_days pd
    JOIN public.program_assignments pa ON pa.program_id = pd.program_id
    JOIN public.programs p ON p.id = pd.program_id
    LEFT JOIN public.program_phases ph ON ph.id = pd.phase_id
    LEFT JOIN public.program_revisions r
      ON r.program_id = p.id AND r.revision_no = p.active_revision_no
    WHERE pd.id = p_program_day_id
      AND pa.id = p_program_assignment_id;
    v_today := public.program_civil_date(public.program_actor_timezone(v_user_id), now());
    v_effective := public.program_effective_version_start(
      v_start,
      COALESCE(v_version_start, v_anchor)
    );
    v_current_phase := public.program_current_phase_id(
      v_program_id,
      v_effective,
      v_today
    );
    IF v_phase_id IS NOT NULL
       AND v_current_phase IS NOT NULL
       AND v_phase_id IS DISTINCT FROM v_current_phase THEN
      RAISE EXCEPTION 'program_day_not_current_phase';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', e.name,
      'default_sets', e.default_sets,
      'default_reps', e.default_reps,
      'default_reps_min', e.default_reps_min,
      'default_rir', e.default_rir,
      'default_rest_seconds', e.default_rest_seconds,
      'default_weight_kg', e.default_weight_kg,
      'order_index', e.order_index,
      'set_type', e.set_type,
      'superset_group', e.superset_group,
      'drop_count', e.drop_count,
      'tempo', e.tempo,
      'isometric_seconds', e.isometric_seconds,
      'cluster_rest_seconds', e.cluster_rest_seconds,
      'cluster_reps_per_burst', e.cluster_reps_per_burst,
      'myo_activation', e.myo_activation
    ) ORDER BY e.order_index), '[]'::jsonb)
      INTO v_exercises
    FROM public.program_day_exercises e
    WHERE e.program_day_id = p_program_day_id;
  ELSE
    v_exercises := COALESCE(p_exercises, '[]'::jsonb);
  END IF;

  IF p_program_assignment_id IS NOT NULL THEN
    IF v_program_id IS NULL OR v_revision_no IS NULL THEN
      SELECT pa.program_id, COALESCE(v_revision_no, p.active_revision_no)
        INTO v_program_id, v_revision_no
      FROM public.program_assignments pa
      JOIN public.programs p ON p.id = pa.program_id
      WHERE pa.id = p_program_assignment_id;
    END IF;
    IF v_program_id IS NULL OR v_revision_no IS NULL THEN
      RAISE EXCEPTION 'program_revision_required';
    END IF;
  END IF;

  INSERT INTO public.workouts (
    user_id, name, date, routine_id, program_assignment_id, program_day_id,
    program_phase_id, prescribed_phase_name, program_revision_no, program_id
  ) VALUES (
    v_user_id, btrim(p_name), COALESCE(p_date, now()), p_routine_id,
    p_program_assignment_id, p_program_day_id,
    v_phase_id, v_phase_name, v_revision_no, v_program_id
  )
  RETURNING id INTO v_workout_id;

  FOR v_item, v_position IN
    SELECT value, ordinality
    FROM jsonb_array_elements(COALESCE(v_exercises, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    IF NULLIF(btrim(v_item->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'exercise_name_required';
    END IF;
    v_set_count := COALESCE((v_item->>'default_sets')::integer, 3);
    IF v_set_count < 1 OR v_set_count > 20 THEN
      RAISE EXCEPTION 'invalid_set_count';
    END IF;
    v_set_type := COALESCE(NULLIF(v_item->>'set_type', ''), 'working');
    IF v_set_type = 'superset' THEN
      v_set_type := 'working';
    END IF;

    v_source := CASE WHEN p_program_day_id IS NOT NULL THEN 'program' ELSE 'user' END;

    INSERT INTO public.workout_exercises (
      workout_id, name, order_index,
      prescribed_sets, prescribed_reps, prescribed_reps_min, prescribed_rir,
      prescribed_rest_seconds, prescribed_weight_kg, superset_group_id,
      prescription_source
    ) VALUES (
      v_workout_id,
      btrim(v_item->>'name'),
      COALESCE((v_item->>'order_index')::integer, (v_position - 1)::integer),
      v_set_count,
      COALESCE((v_item->>'default_reps')::integer, 0),
      NULLIF(v_item->>'default_reps_min', '')::integer,
      NULLIF(v_item->>'default_rir', '')::integer,
      NULLIF(v_item->>'default_rest_seconds', '')::integer,
      NULLIF(v_item->>'default_weight_kg', '')::numeric,
      NULLIF(v_item->>'superset_group', ''),
      v_source
    )
    RETURNING id INTO v_exercise_id;

    INSERT INTO public.workout_sets (
      exercise_id, order_index, set_type, tempo, duration_seconds,
      cluster_rest_seconds, cluster_reps_per_burst, myo_is_activation, drop_segments
    )
    SELECT
      v_exercise_id,
      set_index,
      v_set_type,
      NULLIF(v_item->>'tempo', ''),
      NULLIF(v_item->>'isometric_seconds', '')::integer,
      NULLIF(v_item->>'cluster_rest_seconds', '')::integer,
      NULLIF(v_item->>'cluster_reps_per_burst', '')::integer,
      (COALESCE((v_item->>'myo_activation')::boolean, false) AND set_index = 0),
      CASE
        WHEN v_set_type = 'drop' THEN COALESCE(v_item->'drop_segments', '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    FROM generate_series(0, GREATEST(v_set_count, 0) - 1) AS set_index;
  END LOOP;

  RETURN v_workout_id;
END;
$$;
-- Client-scoped transaction mutex for assignment mutations. Taken BEFORE any
-- programs FOR UPDATE so a waiter cannot snapshot a stale active lock-set,
-- then acquire programs in UUID order. Two-key advisory (class 20014500)
-- so it does not share the bigint advisory namespace used by decision drain
-- and concurrency harness holds. Reentrant in the same transaction.
CREATE OR REPLACE FUNCTION public.lock_client_assignment_mutex(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_client_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(
    20014500,
    ('x' || substr(md5('prometheus.assignment.mutex:' || p_client_id::text), 1, 8))::bit(32)::int
  );
END;
$$;

-- Internal lock order for assignment mutations:
-- client mutex → programs (active of client plus optional target)
-- ORDER BY id FOR UPDATE, then the caller mutates assignments.
CREATE OR REPLACE FUNCTION public.lock_programs_for_assignment_mutation(p_program_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_program_ids IS NULL OR cardinality(p_program_ids) IS NULL OR cardinality(p_program_ids) = 0 THEN
    RETURN;
  END IF;
  PERFORM 1
  FROM public.programs p
  WHERE p.id = ANY (p_program_ids)
  ORDER BY p.id
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_client_assignment_programs(
  p_client_id uuid,
  p_target_program_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_client_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.lock_client_assignment_mutex(p_client_id);
  PERFORM public.lock_programs_for_assignment_mutation(
    ARRAY(
      SELECT DISTINCT x.id
      FROM (
        SELECT pa.program_id AS id
        FROM public.program_assignments pa
        WHERE pa.client_id = p_client_id
          AND pa.status = 'active'
        UNION
        SELECT p_target_program_id
        WHERE p_target_program_id IS NOT NULL
      ) x
      WHERE x.id IS NOT NULL
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_client_assignment_mutex(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_programs_for_assignment_mutation(uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_client_assignment_programs(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.lock_client_assignment_mutex(uuid) IS
  'Internal. Transaction mutex per client_id for assignment mutations. Must run before programs FOR UPDATE.';
COMMENT ON FUNCTION public.lock_client_assignment_programs(uuid, uuid) IS
  'Internal. Client assignment mutex, then lock client active-assignment programs plus optional target ORDER BY id FOR UPDATE before any active→paused assignment write.';

CREATE OR REPLACE FUNCTION public.assign_program_secure(
  p_program_id uuid,
  p_client_id uuid,
  p_start_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_assignment_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_client_id IS NULL OR p_start_date IS NULL THEN
    RAISE EXCEPTION 'Missing assignment fields';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = p_program_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF p_client_id <> v_uid AND NOT public.is_coach_of(p_client_id) THEN
    RAISE EXCEPTION 'Not authorized for this client';
  END IF;
  IF p_client_id = v_uid AND EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Coached client cannot self-assign';
  END IF;

  PERFORM public.lock_client_assignment_programs(p_client_id, p_program_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = p_program_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF p_client_id <> v_uid AND NOT public.is_coach_of(p_client_id) THEN
    RAISE EXCEPTION 'Not authorized for this client';
  END IF;

  UPDATE public.program_assignments
  SET status = 'paused', updated_at = now()
  WHERE client_id = p_client_id AND status = 'active';

  INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
  VALUES (p_program_id, p_client_id, v_uid, p_start_date, 'active')
  RETURNING id INTO v_assignment_id;
  RETURN v_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_program_secure(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_program_secure(uuid, uuid, date) TO authenticated;
COMMENT ON FUNCTION public.assign_program_secure(uuid, uuid, date) IS
  'Assign a program to a client. Client assignment mutex, then parent programs ORDER BY id FOR UPDATE, then pause the current active assignment so freeze cannot invert lock order with adopt.';

CREATE OR REPLACE FUNCTION public.create_program_complete(
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
  p_assign_client_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_session_organization text DEFAULT 'fixed_days',
  p_phases jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_program_id uuid;
  v_day jsonb;
  v_ex jsonb;
  v_weekday int;
  v_name text;
  v_sets int;
  v_reps int;
  v_rest int;
  v_day_id uuid;
  v_phase_id uuid;
  v_order int := 0;
  v_ex_count int;
  v_routine_id uuid;
  v_seen text[] := '{}';
  v_org text;
  v_wd_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Program name required';
  END IF;
  IF p_duration_weeks IS NULL OR p_duration_weeks < 1 OR p_duration_weeks > 52 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) > 42 THEN
    RAISE EXCEPTION 'Invalid days';
  END IF;
  IF p_phases IS NOT NULL AND jsonb_typeof(p_phases) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  v_org := public.normalize_session_organization(p_session_organization);
  PERFORM public.validate_program_graph_payload(v_org, p_days, COALESCE(p_phases, '[]'::jsonb));

  -- Validation complète AVANT toute mutation.
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    IF v_org = 'fixed_days' THEN
      BEGIN
        v_weekday := (v_day->>'weekday')::int;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid weekday';
      END;
      IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
        RAISE EXCEPTION 'Invalid weekday';
      END IF;
      v_wd_key := COALESCE(NULLIF(btrim(COALESCE(v_day->>'phase_id', '')), ''), '-') || ':' || v_weekday::text;
      IF v_wd_key = ANY (v_seen) THEN
        RAISE EXCEPTION 'Duplicate weekday %', v_weekday;
      END IF;
      v_seen := v_seen || v_wd_key;
    END IF;

    v_routine_id := NULLIF(v_day->>'routine_id', '')::uuid;
    IF v_routine_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.routines r
      WHERE r.id = v_routine_id AND r.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Routine not found';
    END IF;

    IF v_day ? 'exercises' AND v_day->'exercises' IS NOT NULL
       AND jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day';
    END IF;
    IF v_day ? 'exercises' AND jsonb_typeof(v_day->'exercises') = 'array'
       AND jsonb_array_length(v_day->'exercises') > 100 THEN
      RAISE EXCEPTION 'Too many exercises';
    END IF;
    IF v_day ? 'exercises' AND jsonb_typeof(v_day->'exercises') = 'array' THEN
      FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
        v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
        IF v_name IS NULL THEN
          RAISE EXCEPTION 'Exercise name required';
        END IF;
        BEGIN
          v_sets := COALESCE((v_ex->>'default_sets')::int, 3);
          v_reps := COALESCE((v_ex->>'default_reps')::int, 10);
          v_rest := COALESCE((v_ex->>'default_rest_seconds')::int, 90);
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Invalid numbers for %', v_name;
        END;
        IF v_sets < 1 OR v_sets > 20 THEN
          RAISE EXCEPTION 'Invalid sets for %', v_name;
        END IF;
        IF v_reps < 0 OR v_reps > 5000 THEN
          RAISE EXCEPTION 'Invalid reps for %', v_name;
        END IF;
        IF v_rest < 0 OR v_rest > 3600 THEN
          RAISE EXCEPTION 'Invalid rest for %', v_name;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF p_assign_client_id IS NOT NULL THEN
    IF p_start_date IS NULL THEN
      RAISE EXCEPTION 'Start date required for assignment';
    END IF;
    IF p_assign_client_id <> v_uid AND NOT public.is_coach_of(p_assign_client_id) THEN
      RAISE EXCEPTION 'Not authorized for this client';
    END IF;
    IF p_assign_client_id = v_uid AND EXISTS (
      SELECT 1 FROM public.coach_client_links
      WHERE client_id = v_uid AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Coached client cannot self-assign';
    END IF;
    -- Lock current active-assignment programs before INSERT/pause. The new
    -- program does not exist yet; freeze will re-lock those same parents.
    PERFORM public.lock_client_assignment_programs(p_assign_client_id, NULL);
    IF p_assign_client_id <> v_uid AND NOT public.is_coach_of(p_assign_client_id) THEN
      RAISE EXCEPTION 'Not authorized for this client';
    END IF;
    IF p_assign_client_id = v_uid AND EXISTS (
      SELECT 1 FROM public.coach_client_links
      WHERE client_id = v_uid AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Coached client cannot self-assign';
    END IF;
  END IF;

  INSERT INTO public.programs (owner_id, name, description, duration_weeks, session_organization)
  VALUES (v_uid, btrim(p_name), COALESCE(p_description, ''), p_duration_weeks, v_org)
  RETURNING id INTO v_program_id;

  PERFORM public.sync_program_phases(v_program_id, COALESCE(p_phases, '[]'::jsonb));

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    IF v_org = 'fixed_days' THEN
      v_weekday := (v_day->>'weekday')::int;
    ELSE
      v_weekday := NULL;
    END IF;
    v_routine_id := NULLIF(v_day->>'routine_id', '')::uuid;
    BEGIN
      v_phase_id := NULLIF(btrim(COALESCE(v_day->>'phase_id', '')), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid payload';
    END;
    IF v_phase_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.program_phases ph
      WHERE ph.id = v_phase_id AND ph.program_id = v_program_id
    ) THEN
      RAISE EXCEPTION 'Invalid phase';
    END IF;
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index, phase_id)
    VALUES (
      v_program_id,
      v_weekday,
      COALESCE(v_day->>'name', ''),
      v_routine_id,
      COALESCE((v_day->>'order_index')::int, v_order),
      v_phase_id
    )
    RETURNING id INTO v_day_id;
    v_order := v_order + 1;
    v_ex_count := 0;

    IF v_day ? 'exercises' AND jsonb_typeof(v_day->'exercises') = 'array'
       AND jsonb_array_length(v_day->'exercises') > 0 THEN
      FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
        INSERT INTO public.program_day_exercises (
          program_day_id, name, default_sets, default_reps, default_reps_min,
          default_rir, default_rest_seconds, default_weight_kg, order_index,
          set_type, superset_group, drop_count, tempo, isometric_seconds,
          cluster_rest_seconds, cluster_reps_per_burst, myo_activation
        ) VALUES (
          v_day_id,
          btrim(v_ex->>'name'),
          COALESCE((v_ex->>'default_sets')::int, 3),
          COALESCE((v_ex->>'default_reps')::int, 10),
          NULLIF(v_ex->>'default_reps_min', '')::int,
          NULLIF(v_ex->>'default_rir', '')::int,
          COALESCE((v_ex->>'default_rest_seconds')::int, 90),
          NULLIF(v_ex->>'default_weight_kg', '')::numeric,
          COALESCE((v_ex->>'order_index')::int, v_ex_count),
          COALESCE(NULLIF(v_ex->>'set_type', ''), 'working'),
          NULLIF(v_ex->>'superset_group', ''),
          NULLIF(v_ex->>'drop_count', '')::int,
          NULLIF(v_ex->>'tempo', ''),
          NULLIF(v_ex->>'isometric_seconds', '')::int,
          NULLIF(v_ex->>'cluster_rest_seconds', '')::int,
          NULLIF(v_ex->>'cluster_reps_per_burst', '')::int,
          COALESCE((v_ex->>'myo_activation')::boolean, false)
        );
        v_ex_count := v_ex_count + 1;
      END LOOP;
    ELSIF v_routine_id IS NOT NULL THEN
      INSERT INTO public.program_day_exercises (
        program_day_id, name, default_sets, default_reps, default_reps_min,
        default_rir, default_rest_seconds, default_weight_kg, order_index,
        set_type, superset_group, drop_count, tempo, isometric_seconds,
        cluster_rest_seconds, cluster_reps_per_burst, myo_activation
      )
      SELECT
        v_day_id, re.name, re.default_sets, re.default_reps, NULL, NULL,
        re.default_rest_seconds, NULL, re.order_index,
        'working', NULL, NULL, NULL, NULL, NULL, NULL, false
      FROM public.routine_exercises re
      WHERE re.routine_id = v_routine_id
      ORDER BY re.order_index;
    END IF;
  END LOOP;

  IF p_assign_client_id IS NOT NULL THEN
    UPDATE public.program_assignments
    SET status = 'paused', updated_at = now()
    WHERE client_id = p_assign_client_id AND status = 'active';

    INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
    VALUES (v_program_id, p_assign_client_id, v_uid, p_start_date, 'active');
  END IF;

  PERFORM public.snapshot_program_revision(v_program_id);
  RETURN v_program_id;
END;
$$;


REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.apply_program_revision_snapshot(uuid, int);
REVOKE ALL ON FUNCTION public.apply_program_revision_snapshot(uuid, int, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_program_version(uuid, text, text, int, jsonb, timestamptz, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program_version(uuid, text, text, int, jsonb, timestamptz, text, jsonb)
  TO authenticated;
REVOKE ALL ON FUNCTION public.schedule_program_version(uuid, int, date, boolean, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_program_version(uuid, int, date, boolean, timestamptz)
  TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_due_program_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_due_program_version(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.snapshot_program_revision(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_program_revision(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  TO authenticated;
REVOKE ALL ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) IS
  'D01 + P3.1 + P3.2 : programme + organisation + phases optionnelles + jours + exercices (+ routine) + assignation optionnelle, une transaction. Toute erreur annule tout. Optional assign takes the client assignment mutex, locks current active-assignment programs ORDER BY id FOR UPDATE, then revalidates the Coach/client link, before any active→paused write.';
COMMENT ON FUNCTION public.ensure_due_program_version(uuid) IS
  'Apply a scheduled version when activates_on <= frozen scheduled_activation_timezone civil date (owner/Coach clock). Paused clients and orphan schedules do not apply.';
COMMENT ON FUNCTION public.validate_program_graph_payload(text, jsonb, jsonb) IS
  'Canonical graph validator shared by live save, future version, schedule and activation.';
COMMENT ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb) IS
  'Single logger. DEFINER so internal civil/phase helpers stay ungranted to authenticated.';

CREATE OR REPLACE FUNCTION public.activate_program_version(
  p_program_id uuid,
  p_revision_no int,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_seen timestamptz;
  v_active int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_revision_no IS NULL THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  SELECT owner_id, updated_at, active_revision_no
    INTO v_owner, v_seen, v_active
  FROM public.programs
  WHERE id = p_program_id
  FOR UPDATE;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;
  IF NOT public.actor_can_activate_program_version(p_program_id) THEN
    RAISE EXCEPTION 'Not an active coach of this assignment';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_seen IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stale';
  END IF;
  IF v_active IS NOT DISTINCT FROM p_revision_no THEN
    RETURN p_revision_no;
  END IF;
  RETURN public.apply_program_revision_snapshot(p_program_id, p_revision_no, 'now');
END;
$$;

REVOKE ALL ON FUNCTION public.activate_program_version(uuid, int, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_program_version(uuid, int, timestamptz)
  TO authenticated;
COMMENT ON FUNCTION public.activate_program_version(uuid, int, timestamptz) IS
  'Manual Activer maintenant. Anchors phase/week 1 on the owner civil date, not a future scheduled_activates_on.';

CREATE OR REPLACE FUNCTION public.program_has_history(p_program_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.program_id = p_program_id
    )
    OR EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = p_program_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workouts w
      JOIN public.program_days d ON d.id = w.program_day_id
      WHERE d.program_id = p_program_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workouts w
      JOIN public.program_assignments pa ON pa.id = w.program_assignment_id
      WHERE pa.program_id = p_program_id
    );
$$;

REVOKE ALL ON FUNCTION public.program_has_history(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_has_history(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_program(p_program_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL THEN RAISE EXCEPTION 'Invalid payload'; END IF;
  -- Hold the parent row until COMMIT so a concurrent program_assignments INSERT
  -- (FK FOR KEY SHARE) cannot commit between the guards and DELETE CASCADE.
  SELECT owner_id
    INTO v_owner
    FROM public.programs
   WHERE id = p_program_id
     FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_owner IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Not program owner'; END IF;
  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.program_assignments
    WHERE program_id = p_program_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'program_has_active_assignment';
  END IF;
  IF public.program_has_history(p_program_id) THEN
    RAISE EXCEPTION 'program_has_history';
  END IF;
  DELETE FROM public.programs WHERE id = p_program_id;
  RETURN p_program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_program(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.delete_program(uuid) IS
  'Hard delete a never-assigned unused program. Locks programs FOR UPDATE before ownership, leftover, active-assignment and history checks so a concurrent assignment cannot sneak in and be CASCADE-deleted. Active assignment refuses (program_has_active_assignment). Historical assignment/workouts refuse (program_has_history). Data API DELETE is closed.';

-- Graph writes are RPC-only (Hotfix A/B allowlist). SELECT per RLS only.
DROP POLICY IF EXISTS "Owners insert programs" ON public.programs;
DROP POLICY IF EXISTS "Owners update programs" ON public.programs;
DROP POLICY IF EXISTS "Owners delete programs" ON public.programs;
DROP POLICY IF EXISTS "Owners insert program days" ON public.program_days;
DROP POLICY IF EXISTS "Owners update program days" ON public.program_days;
DROP POLICY IF EXISTS "Owners delete program days" ON public.program_days;
DROP POLICY IF EXISTS "Owners insert program day exercises" ON public.program_day_exercises;
DROP POLICY IF EXISTS "Owners update program day exercises" ON public.program_day_exercises;
DROP POLICY IF EXISTS "Owners delete program day exercises" ON public.program_day_exercises;
DROP POLICY IF EXISTS "Owners insert program phases" ON public.program_phases;
DROP POLICY IF EXISTS "Owners update program phases" ON public.program_phases;
DROP POLICY IF EXISTS "Owners delete program phases" ON public.program_phases;

REVOKE ALL ON TABLE public.program_days FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.program_day_exercises FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.program_phases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.programs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.program_days TO authenticated;
GRANT SELECT ON TABLE public.program_day_exercises TO authenticated;
GRANT SELECT ON TABLE public.program_phases TO authenticated;
GRANT SELECT ON TABLE public.programs TO authenticated;

DROP POLICY IF EXISTS "Assigner inserts assignments" ON public.program_assignments;
DROP POLICY IF EXISTS "Assigner updates assignments" ON public.program_assignments;
DROP POLICY IF EXISTS "Assigner deletes assignments" ON public.program_assignments;

REVOKE ALL ON TABLE public.program_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.program_assignments TO authenticated;

REVOKE ALL ON TABLE public.workouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_exercises FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_sets TO authenticated;

-- Public métier commands only. Primitives stay DEFINER-internal.
REVOKE ALL ON FUNCTION public.sync_program_phases(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_program_phases(uuid, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_program_with_days(text, text, int, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_program_day_exercises(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_program_with_days(text, text, int, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_program_phases(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_program_day_exercises(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_program_days(uuid, jsonb) TO service_role;

-- program_revisions: SELECT per RLS; writes via server commands only (Hotfix A/B).
REVOKE ALL ON TABLE public.program_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.program_revisions TO authenticated;

CREATE OR REPLACE FUNCTION public.workouts_protect_program_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.program_assignment_id IS NOT NULL
         OR NEW.program_day_id IS NOT NULL
         OR NEW.program_phase_id IS NOT NULL
         OR NEW.prescribed_phase_name IS NOT NULL
         OR NEW.program_revision_no IS NOT NULL
         OR NEW.program_id IS NOT NULL THEN
        RAISE EXCEPTION 'program provenance is RPC-only';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.program_assignment_id IS DISTINCT FROM OLD.program_assignment_id
         OR NEW.program_day_id IS DISTINCT FROM OLD.program_day_id
         OR NEW.program_phase_id IS DISTINCT FROM OLD.program_phase_id
         OR NEW.prescribed_phase_name IS DISTINCT FROM OLD.prescribed_phase_name
         OR NEW.program_revision_no IS DISTINCT FROM OLD.program_revision_no
         OR NEW.program_id IS DISTINCT FROM OLD.program_id THEN
        RAISE EXCEPTION 'program provenance is immutable';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.workouts_protect_program_provenance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workouts_protect_program_provenance ON public.workouts;
CREATE TRIGGER workouts_protect_program_provenance
  BEFORE INSERT OR UPDATE ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.workouts_protect_program_provenance();

CREATE OR REPLACE FUNCTION public.workout_exercises_protect_prescribed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.prescription_source IS DISTINCT FROM 'user' THEN
        RAISE EXCEPTION 'prescription_source is RPC-only';
      END IF;
      NEW.prescription_source := 'user';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.prescription_source IS DISTINCT FROM OLD.prescription_source THEN
        RAISE EXCEPTION 'prescription_source is immutable';
      END IF;
      IF OLD.prescription_source = 'program'
         AND (
           NEW.prescribed_sets IS DISTINCT FROM OLD.prescribed_sets
           OR NEW.prescribed_reps IS DISTINCT FROM OLD.prescribed_reps
           OR NEW.prescribed_reps_min IS DISTINCT FROM OLD.prescribed_reps_min
           OR NEW.prescribed_rir IS DISTINCT FROM OLD.prescribed_rir
           OR NEW.prescribed_rest_seconds IS DISTINCT FROM OLD.prescribed_rest_seconds
           OR NEW.prescribed_weight_kg IS DISTINCT FROM OLD.prescribed_weight_kg
         ) THEN
        RAISE EXCEPTION 'workout prescription is immutable';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.workout_exercises_protect_prescribed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workout_exercises_protect_prescribed ON public.workout_exercises;
CREATE TRIGGER workout_exercises_protect_prescribed
  BEFORE INSERT OR UPDATE ON public.workout_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.workout_exercises_protect_prescribed();

CREATE OR REPLACE FUNCTION public.program_assignments_freeze_on_pause()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active'
     AND NEW.status IN ('paused', 'completed')
     AND NEW.frozen_revision_no IS NULL THEN
    SELECT p.active_revision_no
      INTO NEW.frozen_revision_no
    FROM public.programs p
    WHERE p.id = NEW.program_id
    FOR UPDATE;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.frozen_revision_no IS NOT NULL
     AND NEW.frozen_revision_no IS DISTINCT FROM OLD.frozen_revision_no THEN
    RAISE EXCEPTION 'frozen_revision_no is immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.program_assignments_freeze_on_pause() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS program_assignments_freeze_on_pause ON public.program_assignments;
CREATE TRIGGER program_assignments_freeze_on_pause
  BEFORE UPDATE ON public.program_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.program_assignments_freeze_on_pause();

CREATE OR REPLACE FUNCTION public.program_assignments_protect_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'program assignment writes are RPC-only';
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'program assignment writes are RPC-only';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.program_id IS DISTINCT FROM OLD.program_id
         OR NEW.client_id IS DISTINCT FROM OLD.client_id
         OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
         OR NEW.start_date IS DISTINCT FROM OLD.start_date
         OR NEW.status IS DISTINCT FROM OLD.status
         OR NEW.frozen_revision_no IS DISTINCT FROM OLD.frozen_revision_no THEN
        RAISE EXCEPTION 'program assignment identity is immutable';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.program_assignments_protect_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS program_assignments_protect_identity ON public.program_assignments;
CREATE TRIGGER program_assignments_protect_identity
  BEFORE INSERT OR UPDATE OR DELETE ON public.program_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.program_assignments_protect_identity();

-- Backfill durable workout→program stamp when assignment or day still exists.
-- Do not guess when neither FK can name the program. Do not rewrite program_revision_no.
UPDATE public.workouts w
SET program_id = pa.program_id
FROM public.program_assignments pa
WHERE w.program_assignment_id = pa.id
  AND w.program_id IS NULL
  AND pa.program_id IS NOT NULL;

UPDATE public.workouts w
SET program_id = d.program_id
FROM public.program_days d
WHERE w.program_day_id = d.id
  AND w.program_id IS NULL
  AND d.program_id IS NOT NULL;

-- Legacy programs with no interpretable active version: freeze the LIVE graph.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT p.id
    FROM public.programs p
    WHERE p.active_revision_no IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.program_revisions r
         WHERE r.program_id = p.id
           AND r.revision_no = p.active_revision_no
       )
  LOOP
    PERFORM public.snapshot_program_revision(v_id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.programs p
    JOIN public.program_assignments pa
      ON pa.program_id = p.id AND pa.status = 'active'
    WHERE p.active_revision_no IS NULL
  ) THEN
    RAISE EXCEPTION 'active assignment without active_revision_no after backfill';
  END IF;
END $$;

-- Historical program prescriptions: stamp source=program when the workout has program provenance.
UPDATE public.workout_exercises we
SET prescription_source = 'program'
FROM public.workouts w
WHERE we.workout_id = w.id
  AND we.prescription_source IS DISTINCT FROM 'program'
  AND (
    w.program_id IS NOT NULL
    OR w.program_assignment_id IS NOT NULL
    OR w.program_day_id IS NOT NULL
  );

-- Reconstruct frozen_revision_no for paused/completed archives when the
-- overlapping activated/superseded window is unambiguous. Do not guess.
UPDATE public.program_assignments pa
SET frozen_revision_no = sub.revision_no
FROM (
  SELECT DISTINCT ON (pa2.id)
    pa2.id,
    r.revision_no
  FROM public.program_assignments pa2
  JOIN public.program_revisions r ON r.program_id = pa2.program_id
  WHERE pa2.status IN ('paused', 'completed')
    AND pa2.frozen_revision_no IS NULL
    AND r.activated_at IS NOT NULL
    AND r.activated_at <= pa2.updated_at
    AND (r.superseded_at IS NULL OR r.superseded_at > pa2.updated_at)
  ORDER BY pa2.id, r.revision_no DESC
) sub
WHERE pa.id = sub.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.program_assignments pa
    JOIN public.program_revisions r ON r.program_id = pa.program_id
    WHERE pa.status IN ('paused', 'completed')
      AND pa.frozen_revision_no IS NULL
      AND r.activated_at IS NOT NULL
      AND r.activated_at <= pa.updated_at
      AND (r.superseded_at IS NULL OR r.superseded_at > pa.updated_at)
  ) THEN
    RAISE EXCEPTION 'paused assignment without frozen_revision_no after backfill';
  END IF;
END $$;

-- Live graph is for ACTIVE assignments only. Paused/completed archives use
-- frozen_revision_no + get_frozen_program_archive, never programs/days/phases.
-- Non-owner Coach: live SELECT only via an active assignment to an active client.
-- Owner policies are unchanged (library remains readable after a client leaves).
DROP POLICY IF EXISTS "Assigned clients read programs" ON public.programs;
CREATE POLICY "Assigned clients read programs" ON public.programs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = programs.id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Assigned clients read program days" ON public.program_days;
CREATE POLICY "Assigned clients read program days" ON public.program_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_days.program_id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Assigned clients read program day exercises" ON public.program_day_exercises;
CREATE POLICY "Assigned clients read program day exercises" ON public.program_day_exercises
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_days d
      JOIN public.program_assignments pa ON pa.program_id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Assigned clients read program phases" ON public.program_phases;
CREATE POLICY "Assigned clients read program phases" ON public.program_phases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_phases.program_id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Assigned clients read program revisions" ON public.program_revisions;
CREATE POLICY "Assigned clients read program revisions" ON public.program_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_assignments pa
      JOIN public.programs p ON p.id = pa.program_id
      WHERE pa.program_id = program_revisions.program_id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
        AND (
          program_revisions.revision_no IS NOT DISTINCT FROM p.active_revision_no
          OR program_revisions.revision_no IS NOT DISTINCT FROM p.scheduled_revision_no
          OR EXISTS (
            SELECT 1 FROM public.workouts w
            WHERE w.user_id = (select auth.uid())
              AND w.program_id = program_revisions.program_id
              AND w.program_revision_no = program_revisions.revision_no
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.program_assignments pa
      WHERE pa.program_id = program_revisions.program_id
        AND pa.client_id = (select auth.uid())
        AND pa.status IN ('paused', 'completed')
        AND pa.frozen_revision_no IS NOT NULL
        AND (
          program_revisions.revision_no = pa.frozen_revision_no
          OR EXISTS (
            SELECT 1 FROM public.workouts w
            WHERE w.user_id = (select auth.uid())
              AND w.program_id = program_revisions.program_id
              AND w.program_revision_no = program_revisions.revision_no
          )
        )
        AND program_revisions.created_at <= pa.updated_at
    )
  );

DROP POLICY IF EXISTS "Coaches read assigned programs" ON public.programs;
CREATE POLICY "Coaches read assigned programs" ON public.programs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = programs.id
        AND public.is_coach_of(pa.client_id)
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Coaches read assigned program days" ON public.program_days;
CREATE POLICY "Coaches read assigned program days" ON public.program_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_days.program_id
        AND public.is_coach_of(pa.client_id)
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Coaches read assigned program day exercises" ON public.program_day_exercises;
CREATE POLICY "Coaches read assigned program day exercises" ON public.program_day_exercises
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_days d
      JOIN public.program_assignments pa ON pa.program_id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id
        AND public.is_coach_of(pa.client_id)
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Coaches read assigned program phases" ON public.program_phases;
CREATE POLICY "Coaches read assigned program phases" ON public.program_phases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_phases.program_id
        AND public.is_coach_of(pa.client_id)
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Coaches read client program revisions" ON public.program_revisions;
CREATE POLICY "Coaches read client program revisions" ON public.program_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_assignments pa
      JOIN public.programs p ON p.id = pa.program_id
      WHERE pa.program_id = program_revisions.program_id
        AND public.is_coach_of(pa.client_id)
        AND pa.status = 'active'
        AND (
          program_revisions.revision_no IS NOT DISTINCT FROM p.active_revision_no
          OR program_revisions.revision_no IS NOT DISTINCT FROM p.scheduled_revision_no
          OR EXISTS (
            SELECT 1 FROM public.workouts w
            WHERE w.user_id = pa.client_id
              AND w.program_id = program_revisions.program_id
              AND w.program_revision_no = program_revisions.revision_no
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.program_assignments pa
      WHERE pa.program_id = program_revisions.program_id
        AND public.is_coach_of(pa.client_id)
        AND pa.status IN ('paused', 'completed')
        AND pa.frozen_revision_no IS NOT NULL
        AND (
          program_revisions.revision_no = pa.frozen_revision_no
          OR EXISTS (
            SELECT 1 FROM public.workouts w
            WHERE w.user_id = pa.client_id
              AND w.program_id = program_revisions.program_id
              AND w.program_revision_no = program_revisions.revision_no
          )
        )
        AND program_revisions.created_at <= pa.updated_at
    )
  );

CREATE OR REPLACE FUNCTION public.get_frozen_program_archive(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_asg public.program_assignments%ROWTYPE;
  v_owner uuid;
  v_created timestamptz;
  v_start date;
  v_snap jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_assignment_id IS NULL THEN RAISE EXCEPTION 'Invalid payload'; END IF;

  SELECT * INTO v_asg FROM public.program_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_asg.status NOT IN ('paused', 'completed') OR v_asg.frozen_revision_no IS NULL THEN
    RAISE EXCEPTION 'archive_not_frozen';
  END IF;

  SELECT owner_id, created_at INTO v_owner, v_created
  FROM public.programs
  WHERE id = v_asg.program_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_asg.client_id IS DISTINCT FROM v_uid
     AND v_asg.assigned_by IS DISTINCT FROM v_uid
     AND v_owner IS DISTINCT FROM v_uid
     AND NOT public.is_coach_of(v_asg.client_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT snapshot, version_start_on
    INTO v_snap, v_start
  FROM public.program_revisions
  WHERE program_id = v_asg.program_id
    AND revision_no = v_asg.frozen_revision_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  RETURN jsonb_build_object(
    'assignment_id', v_asg.id,
    'program_id', v_asg.program_id,
    'frozen_revision_no', v_asg.frozen_revision_no,
    'owner_id', v_owner,
    'created_at', v_created,
    'updated_at', v_asg.updated_at,
    'version_start_on', v_start,
    'snapshot', v_snap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_frozen_program_archive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_frozen_program_archive(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_frozen_program_archive(uuid) IS
  'Read-only frozen assignment archive. Caller = client, assigner, owner, or the client''s current active Coach (is_coach_of). Only frozen_revision_no is returned; live graph and later drafts are never exposed.';

-- Internal. Fresh phase/day UUIDs so apply_program_revision_snapshot can
-- insert into a new program without colliding with the source graph. Strips
-- exercise ids and routine_id. Fail-closed on array/legacy snapshots.
CREATE OR REPLACE FUNCTION public.remap_program_revision_snapshot(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org text;
  v_name text;
  v_desc text;
  v_weeks int;
  v_phases jsonb;
  v_days jsonb;
  v_phase jsonb;
  v_day jsonb;
  v_ex jsonb;
  v_new_phases jsonb := '[]'::jsonb;
  v_new_days jsonb := '[]'::jsonb;
  v_new_ex jsonb;
  v_map jsonb := '{}'::jsonb;
  v_old_id text;
  v_new_id uuid;
  v_phase_id uuid;
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'archive_not_frozen';
  END IF;

  v_name := NULLIF(btrim(COALESCE(p_snapshot->>'name', '')), '');
  v_desc := COALESCE(p_snapshot->>'description', '');
  BEGIN
    v_weeks := GREATEST(1, LEAST(52, COALESCE(NULLIF(btrim(COALESCE(p_snapshot->>'duration_weeks', '')), '')::int, 8)));
  EXCEPTION WHEN OTHERS THEN
    v_weeks := 8;
  END;
  v_org := public.normalize_session_organization(p_snapshot->>'session_organization');

  v_phases := COALESCE(p_snapshot->'phases', '[]'::jsonb);
  v_days := COALESCE(p_snapshot->'days', '[]'::jsonb);
  IF jsonb_typeof(v_phases) <> 'array' THEN v_phases := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_days) <> 'array' THEN RAISE EXCEPTION 'Invalid payload'; END IF;

  FOR v_phase IN SELECT * FROM jsonb_array_elements(v_phases) LOOP
    v_new_id := gen_random_uuid();
    v_old_id := NULLIF(btrim(COALESCE(v_phase->>'id', '')), '');
    IF v_old_id IS NOT NULL THEN
      v_map := v_map || jsonb_build_object(v_old_id, v_new_id::text);
    END IF;
    v_new_phases := v_new_phases || jsonb_build_array(
      (v_phase - 'id') || jsonb_build_object('id', v_new_id)
    );
  END LOOP;

  FOR v_day IN SELECT * FROM jsonb_array_elements(v_days) LOOP
    v_phase_id := NULL;
    v_old_id := NULLIF(btrim(COALESCE(v_day->>'phase_id', '')), '');
    IF v_old_id IS NOT NULL AND v_map ? v_old_id THEN
      v_phase_id := (v_map->>v_old_id)::uuid;
    END IF;
    v_new_ex := '[]'::jsonb;
    IF jsonb_typeof(v_day->'exercises') = 'array' THEN
      FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
        v_new_ex := v_new_ex || jsonb_build_array(v_ex - 'id');
      END LOOP;
    END IF;
    v_new_days := v_new_days || jsonb_build_array(
      (v_day - 'id' - 'phase_id' - 'exercises' - 'routine_id')
      || jsonb_build_object(
        'phase_id', to_jsonb(v_phase_id),
        'exercises', v_new_ex
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'session_organization', v_org,
    'name', COALESCE(v_name, ''),
    'description', v_desc,
    'duration_weeks', v_weeks,
    'phases', v_new_phases,
    'days', v_new_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remap_program_revision_snapshot(jsonb)
  FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.remap_program_revision_snapshot(jsonb) IS
  'Internal. Remap a P3 revision snapshot onto fresh phase/day ids for apply_program_revision_snapshot on a new program.';

-- Adopt is addressed by assignment_id. Copy that exact row's snapshot through
-- the existing P3 apply engine. Never copies live programs/days/phases/
-- exercises. Never picks "active first / latest paused". Active assignment →
-- programs.active_revision_no. Paused/completed → assignment.frozen_revision_no
-- (fail closed). Lock order: client assignment mutex, program FOR UPDATE,
-- assignment FOR UPDATE, then the current coach_client_links row FOR SHARE,
-- then revalidate is_coach_of before copy.
CREATE OR REPLACE FUNCTION public.adopt_client_assignment(p_assignment_id uuid, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_program_id uuid;
  v_client_id uuid;
  v_asg public.program_assignments%ROWTYPE;
  v_snap jsonb;
  v_rev int;
  v_fork_id uuid;
  v_name text;
  v_desc text;
  v_weeks int;
  v_org text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_assignment_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT pa.program_id, pa.client_id
    INTO v_program_id, v_client_id
  FROM public.program_assignments pa
  WHERE pa.id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Fail closed before locks when the caller is already not the current Coach.
  IF NOT public.is_coach_of(v_client_id) THEN RAISE EXCEPTION 'Not your client'; END IF;

  PERFORM public.lock_client_assignment_mutex(v_client_id);

  -- programs FOR UPDATE, then the exact assignment FOR UPDATE (same order as
  -- freeze / end_coach). Re-read status/frozen under the assignment lock.
  PERFORM 1
  FROM public.programs p
  WHERE p.id = v_program_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT * INTO v_asg
  FROM public.program_assignments pa
  WHERE pa.id = p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- Serialize against a concurrent revoke of this Coach-client relation.
  PERFORM 1
  FROM public.coach_client_links l
  WHERE l.coach_id = v_uid
    AND l.client_id = v_asg.client_id
    AND l.status = 'active'
  FOR SHARE;

  IF NOT public.is_coach_of(v_asg.client_id) THEN RAISE EXCEPTION 'Not your client'; END IF;

  IF v_asg.status = 'active' THEN
    SELECT p.active_revision_no INTO v_rev
    FROM public.programs p
    WHERE p.id = v_asg.program_id;
    IF v_rev IS NULL THEN
      RAISE EXCEPTION 'archive_not_frozen';
    END IF;
  ELSIF v_asg.status IN ('paused', 'completed') THEN
    -- Exact historical row: frozen snapshot only. Do not read live graph tables.
    IF v_asg.frozen_revision_no IS NULL THEN
      RAISE EXCEPTION 'archive_not_frozen';
    END IF;
    v_rev := v_asg.frozen_revision_no;
  ELSE
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT r.snapshot INTO v_snap
  FROM public.program_revisions r
  WHERE r.program_id = v_asg.program_id
    AND r.revision_no = v_rev;
  IF v_snap IS NULL THEN
    RAISE EXCEPTION 'archive_not_frozen';
  END IF;

  v_snap := public.remap_program_revision_snapshot(v_snap);
  v_name := COALESCE(
    NULLIF(btrim(COALESCE(p_name, '')), ''),
    NULLIF(btrim(COALESCE(v_snap->>'name', '')), '') || ' (repris)',
    'Programme (repris)'
  );
  v_snap := v_snap || jsonb_build_object('name', v_name);
  v_desc := COALESCE(v_snap->>'description', '');
  BEGIN
    v_weeks := GREATEST(1, LEAST(52, COALESCE(NULLIF(btrim(COALESCE(v_snap->>'duration_weeks', '')), '')::int, 8)));
  EXCEPTION WHEN OTHERS THEN
    v_weeks := 8;
  END;
  v_org := public.normalize_session_organization(v_snap->>'session_organization');

  INSERT INTO public.programs (owner_id, name, description, duration_weeks, session_organization)
  VALUES (v_uid, v_name, v_desc, v_weeks, v_org)
  RETURNING id INTO v_fork_id;

  INSERT INTO public.program_revisions (program_id, revision_no, snapshot, created_by)
  VALUES (v_fork_id, 1, v_snap, v_uid);

  PERFORM public.apply_program_revision_snapshot(v_fork_id, 1, 'now');
  RETURN v_fork_id;
END;
$$;

REVOKE ALL ON FUNCTION public.adopt_client_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adopt_client_assignment(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.adopt_client_assignment(uuid, text) IS
  'Copy the exact client assignment into the current Coach library via apply_program_revision_snapshot. Addressed by assignment_id only. Active uses programs.active_revision_no. Paused/completed uses that row''s frozen_revision_no (never live graph, never another row of the same program). Missing frozen → archive_not_frozen. Client assignment mutex, then program, then assignment, then the active coach_client_links row, then revalidates is_coach_of.';

DROP FUNCTION IF EXISTS public.adopt_client_program(uuid, uuid, text);

-- Lock assigned programs before pausing so freeze/activation share one lock order.
CREATE OR REPLACE FUNCTION public.end_coach_client_link(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_client_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_end_self');
  END IF;
  PERFORM public.lock_client_assignment_programs(p_client_id, NULL);
  RETURN public.transition_client_to_solo(v_uid, p_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.end_coach_client_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_coach_client_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_end_coach_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_coach_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT coach_id INTO v_coach_id
  FROM public.coach_client_links
  WHERE client_id = v_uid
    AND status = 'active';

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  PERFORM public.lock_client_assignment_programs(v_uid, NULL);

  v_result := public.transition_client_to_solo(v_coach_id, v_uid);
  IF v_result->>'ok' = 'true' THEN
    RETURN v_result || jsonb_build_object(
      'former_coach_id', v_coach_id,
      'ended_at', (SELECT coach_link_ended_at FROM public.user_profiles WHERE id = v_uid)
    );
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.client_end_coach_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_end_coach_link() TO authenticated;

-- P3 close_coach_account: snapshot-engine transfer of each assignment, keep
-- the same revision_no values, retarget workouts, then freeze paused with a
-- non-null frozen_revision_no. service_role only; one transaction; retry after
-- success is a no-op (no active links).
CREATE OR REPLACE FUNCTION public.close_coach_account(p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_asg record;
  v_fork_id uuid;
  v_transitioned int := 0;
  v_forked int := 0;
  v_rev int;
  v_rev_no int;
  v_rev_nos int[];
  v_snap jsonb;
  v_meta jsonb;
  v_name text;
  v_desc text;
  v_weeks int;
  v_org text;
  v_clients uuid[];
  v_locked uuid[] := '{}';
  v_cid uuid;
  v_guard int := 0;
BEGIN
  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'Coach required';
  END IF;

  -- Serialize every linked client before reading the program lock-set so an
  -- assign/create that commits during our wait cannot introduce a new active
  -- Coach program that we never lock.
  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 32 THEN
      RAISE EXCEPTION 'close_coach_account mutex did not stabilize';
    END IF;
    SELECT COALESCE(array_agg(l.client_id ORDER BY l.client_id), '{}')
      INTO v_clients
    FROM public.coach_client_links l
    WHERE l.coach_id = p_coach_id
      AND l.status = 'active';
    IF cardinality(v_clients) IS NULL OR cardinality(v_clients) = 0 THEN
      RETURN jsonb_build_object('ok', true, 'transitioned', 0, 'forked', 0);
    END IF;
    FOREACH v_cid IN ARRAY v_clients LOOP
      PERFORM public.lock_client_assignment_mutex(v_cid);
    END LOOP;
    v_locked := v_locked || v_clients;
    SELECT COALESCE(array_agg(l.client_id ORDER BY l.client_id), '{}')
      INTO v_clients
    FROM public.coach_client_links l
    WHERE l.coach_id = p_coach_id
      AND l.status = 'active';
    EXIT WHEN v_clients <@ v_locked;
  END LOOP;

  PERFORM public.lock_programs_for_assignment_mutation(
    ARRAY(
      SELECT DISTINCT pa.program_id
      FROM public.coach_client_links l
      JOIN public.program_assignments pa
        ON pa.client_id = l.client_id
       AND pa.assigned_by = p_coach_id
       AND pa.status IN ('active', 'paused', 'completed')
      JOIN public.programs p
        ON p.id = pa.program_id
       AND p.owner_id = p_coach_id
      WHERE l.coach_id = p_coach_id
        AND l.status = 'active'
    )
  );

  FOR v_link IN
    SELECT client_id
    FROM public.coach_client_links
    WHERE coach_id = p_coach_id
      AND status = 'active'
    ORDER BY client_id
  LOOP
    FOR v_asg IN
      SELECT pa.id AS assignment_id,
             pa.program_id,
             pa.client_id,
             pa.status,
             pa.frozen_revision_no
      FROM public.program_assignments pa
      JOIN public.programs p ON p.id = pa.program_id
      WHERE pa.client_id = v_link.client_id
        AND pa.assigned_by = p_coach_id
        AND pa.status IN ('active', 'paused', 'completed')
        AND p.owner_id = p_coach_id
      ORDER BY pa.id
      FOR UPDATE OF pa
    LOOP
      IF v_asg.status = 'active' THEN
        SELECT p.active_revision_no INTO v_rev
        FROM public.programs p
        WHERE p.id = v_asg.program_id;
        IF v_rev IS NULL THEN
          RAISE EXCEPTION 'archive_not_frozen';
        END IF;
      ELSIF v_asg.status IN ('paused', 'completed') THEN
        IF v_asg.frozen_revision_no IS NULL THEN
          RAISE EXCEPTION 'archive_not_frozen';
        END IF;
        v_rev := v_asg.frozen_revision_no;
      ELSE
        CONTINUE;
      END IF;

      SELECT ARRAY(
        SELECT DISTINCT x.n
        FROM (
          SELECT v_rev AS n
          UNION
          SELECT w.program_revision_no
          FROM public.workouts w
          WHERE w.program_assignment_id = v_asg.assignment_id
            AND w.program_revision_no IS NOT NULL
        ) x
        ORDER BY 1
      ) INTO v_rev_nos;

      SELECT r.snapshot INTO v_snap
      FROM public.program_revisions r
      WHERE r.program_id = v_asg.program_id
        AND r.revision_no = v_rev;
      IF v_snap IS NULL THEN
        RAISE EXCEPTION 'archive_not_frozen';
      END IF;
      v_meta := public.remap_program_revision_snapshot(v_snap);
      v_name := COALESCE(NULLIF(btrim(COALESCE(v_meta->>'name', '')), ''), 'Programme');
      v_desc := COALESCE(v_meta->>'description', '');
      BEGIN
        v_weeks := GREATEST(1, LEAST(52, COALESCE(NULLIF(btrim(COALESCE(v_meta->>'duration_weeks', '')), '')::int, 8)));
      EXCEPTION WHEN OTHERS THEN
        v_weeks := 8;
      END;
      v_org := public.normalize_session_organization(v_meta->>'session_organization');

      INSERT INTO public.programs (owner_id, name, description, duration_weeks, session_organization)
      VALUES (v_link.client_id, v_name, v_desc, v_weeks, v_org)
      RETURNING id INTO v_fork_id;

      FOREACH v_rev_no IN ARRAY v_rev_nos LOOP
        SELECT r.snapshot INTO v_snap
        FROM public.program_revisions r
        WHERE r.program_id = v_asg.program_id
          AND r.revision_no = v_rev_no;
        IF v_snap IS NULL THEN
          RAISE EXCEPTION 'archive_not_frozen';
        END IF;
        INSERT INTO public.program_revisions (program_id, revision_no, snapshot, created_by)
        VALUES (
          v_fork_id,
          v_rev_no,
          public.remap_program_revision_snapshot(v_snap),
          v_link.client_id
        );
      END LOOP;

      PERFORM public.apply_program_revision_snapshot(v_fork_id, v_rev, 'now');

      UPDATE public.workouts
      SET
        program_id = v_fork_id,
        program_day_id = NULL,
        program_phase_id = NULL
      WHERE program_assignment_id = v_asg.assignment_id;

      UPDATE public.program_assignments
      SET
        program_id = v_fork_id,
        assigned_by = v_link.client_id,
        status = 'paused',
        frozen_revision_no = v_rev,
        updated_at = now()
      WHERE id = v_asg.assignment_id;

      v_forked := v_forked + 1;
    END LOOP;

    PERFORM public.transition_client_to_solo(p_coach_id, v_link.client_id);
    v_transitioned := v_transitioned + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'transitioned', v_transitioned, 'forked', v_forked);
END;
$$;

REVOKE ALL ON FUNCTION public.close_coach_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_coach_account(uuid) TO service_role;
COMMENT ON FUNCTION public.close_coach_account(uuid) IS
  'P3 coach-account close. Client assignment mutex for every linked client (ORDER BY client_id) before the program lock-set, so a concurrent assign cannot leave a new Coach-owned active program outside the fork. For each assignment of each active client, copy the exact source revision (active → programs.active_revision_no, paused/completed → frozen_revision_no) plus workout-referenced revisions onto a client-owned program via remapped snapshots, keep the same revision_no, apply the source revision, retarget workouts.program_id, then pause with frozen_revision_no set. Unused private drafts are not copied. service_role only; one transaction; retry after success is a no-op.';
