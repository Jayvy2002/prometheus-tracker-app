-- P3 hardening after transversal audit. Same engine. No P4.
-- Candidate only until merge + live apply. Do not restamp 20260919233853.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS phase_anchor_on date,
  ADD COLUMN IF NOT EXISTS scheduled_activation_timezone text;

COMMENT ON COLUMN public.programs.phase_anchor_on IS
  'Civil date the active version started for phase progression. NULL = use assignment.start_date.';
COMMENT ON COLUMN public.programs.scheduled_activation_timezone IS
  'IANA TZ frozen at schedule. Shared programs use the owner/Coach civil clock, never the first client.';

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
DO $$
DECLARE
  v_con text;
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
END $$;

ALTER TABLE public.program_days
  ADD CONSTRAINT program_days_phase_id_fkey
  FOREIGN KEY (phase_id) REFERENCES public.program_phases(id) ON DELETE CASCADE;

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
    v_span := CASE
      WHEN v_phase.duration_weeks IS NOT NULL AND v_phase.duration_weeks > 0 THEN v_phase.duration_weeks
      ELSE 1
    END;
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
      IF v_sets < 1 OR v_sets > 100 THEN RAISE EXCEPTION 'Invalid sets for %', v_name; END IF;
      IF v_reps < 0 OR v_reps > 5000 THEN RAISE EXCEPTION 'Invalid reps for %', v_name; END IF;
      IF v_rest < 0 OR v_rest > 3600 THEN RAISE EXCEPTION 'Invalid rest for %', v_name; END IF;
    END LOOP;
  END LOOP;
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

  PERFORM public.validate_program_graph_payload(v_org, p_days, NULL);

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

REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_program_days(uuid, jsonb) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.apply_program_revision_snapshot(p_program_id uuid, p_revision_no int)
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

  IF v_sched_no IS NOT DISTINCT FROM p_revision_no AND v_sched_on IS NOT NULL THEN
    v_anchor := v_sched_on;
  ELSE
    v_anchor := public.program_civil_date(public.program_actor_timezone(v_owner), now());
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
  SET activated_at = COALESCE(activated_at, now())
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

  UPDATE public.programs
  SET
    scheduled_revision_no = p_revision_no,
    scheduled_activates_on = p_activates_on,
    scheduled_activation_timezone = v_tz,
    updated_at = now()
  WHERE id = p_program_id;

  v_today := public.program_civil_date(v_tz, now());
  IF p_activates_on <= v_today THEN
    RETURN public.apply_program_revision_snapshot(p_program_id, p_revision_no);
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
  IF NOT public.actor_can_read_program(p_program_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- A paused client must not apply a Coach change after the relationship ended.
  IF EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id AND pa.client_id = v_uid
  ) AND NOT EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id AND pa.client_id = v_uid AND pa.status = 'active'
  ) THEN
    RETURN 0;
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
  RETURN public.apply_program_revision_snapshot(p_program_id, v_sched);
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
BEGIN
  IF p_program_id IS NULL THEN RAISE EXCEPTION 'Program required'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  PERFORM 1 FROM public.programs WHERE id = p_program_id FOR UPDATE;
  SELECT public.normalize_session_organization(session_organization), active_revision_no,
         name, description, duration_weeks
    INTO v_org, v_prev, v_name, v_desc, v_weeks
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
  INSERT INTO public.program_revisions (program_id, revision_no, snapshot, created_by, activated_at)
  VALUES (p_program_id, v_no, v_snap, auth.uid(), now());
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
    SELECT pd.phase_id, ph.name, pd.program_id, p.phase_anchor_on, pa.start_date, p.active_revision_no
      INTO v_phase_id, v_phase_name, v_program_id, v_anchor, v_start, v_revision_no
    FROM public.program_days pd
    JOIN public.program_assignments pa ON pa.program_id = pd.program_id
    JOIN public.programs p ON p.id = pd.program_id
    LEFT JOIN public.program_phases ph ON ph.id = pd.phase_id
    WHERE pd.id = p_program_day_id
      AND pa.id = p_program_assignment_id;
    v_today := public.program_civil_date(public.program_actor_timezone(v_user_id), now());
    v_current_phase := public.program_current_phase_id(
      v_program_id,
      COALESCE(v_anchor, v_start),
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

  IF p_program_assignment_id IS NOT NULL AND v_revision_no IS NULL THEN
    SELECT p.active_revision_no
      INTO v_revision_no
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
    WHERE pa.id = p_program_assignment_id;
  END IF;

  INSERT INTO public.workouts (
    user_id, name, date, routine_id, program_assignment_id, program_day_id,
    program_phase_id, prescribed_phase_name, program_revision_no
  ) VALUES (
    v_user_id, btrim(p_name), COALESCE(p_date, now()), p_routine_id,
    p_program_assignment_id, p_program_day_id,
    v_phase_id, v_phase_name, v_revision_no
  )
  RETURNING id INTO v_workout_id;

  FOR v_item, v_position IN
    SELECT value, ordinality
    FROM jsonb_array_elements(COALESCE(v_exercises, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    IF NULLIF(btrim(v_item->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'exercise_name_required';
    END IF;
    v_set_count := COALESCE((v_item->>'default_sets')::integer, 0);
    IF v_set_count < 0 OR v_set_count > 20 THEN
      RAISE EXCEPTION 'invalid_set_count';
    END IF;
    v_set_type := COALESCE(NULLIF(v_item->>'set_type', ''), 'working');
    IF v_set_type = 'superset' THEN
      v_set_type := 'working';
    END IF;

    INSERT INTO public.workout_exercises (
      workout_id, name, order_index,
      prescribed_sets, prescribed_reps, prescribed_reps_min, prescribed_rir,
      prescribed_rest_seconds, prescribed_weight_kg, superset_group_id
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
      NULLIF(v_item->>'superset_group', '')
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
        IF v_sets < 1 OR v_sets > 100 THEN
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
REVOKE ALL ON FUNCTION public.apply_program_revision_snapshot(uuid, int) FROM PUBLIC, anon, authenticated;
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
REVOKE ALL ON FUNCTION public.snapshot_program_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_program_revision(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  TO authenticated;
REVOKE ALL ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) IS
  'D01 + P3.1 + P3.2 : programme + organisation + phases optionnelles + jours + exercices (+ routine) + assignation optionnelle, une transaction. Toute erreur annule tout.';
COMMENT ON FUNCTION public.ensure_due_program_version(uuid) IS
  'Apply a scheduled version when activates_on <= frozen scheduled_activation_timezone civil date (owner/Coach clock). Paused clients and orphan schedules do not apply.';
COMMENT ON FUNCTION public.validate_program_graph_payload(text, jsonb, jsonb) IS
  'Canonical graph validator shared by live save, future version, schedule and activation.';
COMMENT ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb) IS
  'Single logger. DEFINER so internal civil/phase helpers stay ungranted to authenticated.';

CREATE OR REPLACE FUNCTION public.program_has_history(p_program_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
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
  SELECT owner_id INTO v_owner FROM public.programs WHERE id = p_program_id;
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
  'Hard delete a never-assigned unused program. Active assignment refuses (program_has_active_assignment). Historical assignment/workouts refuse (program_has_history). Data API DELETE is closed.';

-- Graph writes are RPC-only (Hotfix A/B pattern). Keep SELECT. Delete via delete_program.
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

REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_days FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_day_exercises FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.program_phases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.programs FROM authenticated;
GRANT SELECT ON TABLE public.program_days TO authenticated;
GRANT SELECT ON TABLE public.program_day_exercises TO authenticated;
GRANT SELECT ON TABLE public.program_phases TO authenticated;
GRANT SELECT ON TABLE public.programs TO authenticated;
