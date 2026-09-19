-- P3.1: session identity is not a weekday.
-- One program engine: programs.session_organization = fixed_days | in_order.
-- Legacy rows stay fixed_days. in_order stores nullable weekday so the calendar
-- cannot invent a date the engine does not know. New version only.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS session_organization text NOT NULL DEFAULT 'fixed_days';

ALTER TABLE public.programs
  DROP CONSTRAINT IF EXISTS programs_session_organization_check;

ALTER TABLE public.programs
  ADD CONSTRAINT programs_session_organization_check
  CHECK (session_organization IN ('fixed_days', 'in_order'));

COMMENT ON COLUMN public.programs.session_organization IS
  'P3.1: fixed_days = séances liées à un jour de semaine ; in_order = prochaine séance selon order_index. Pas un second moteur.';

ALTER TABLE public.program_days
  ALTER COLUMN weekday DROP NOT NULL;

ALTER TABLE public.program_days
  DROP CONSTRAINT IF EXISTS program_days_weekday_check;

ALTER TABLE public.program_days
  ADD CONSTRAINT program_days_weekday_check
  CHECK (weekday IS NULL OR (weekday >= 0 AND weekday <= 6));

ALTER TABLE public.program_days
  DROP CONSTRAINT IF EXISTS program_days_program_id_weekday_key;

DROP INDEX IF EXISTS public.program_days_program_id_weekday_key;

CREATE UNIQUE INDEX IF NOT EXISTS program_days_program_id_weekday_unique
  ON public.program_days (program_id, weekday)
  WHERE weekday IS NOT NULL;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY program_id
      ORDER BY order_index, weekday NULLS LAST, created_at, id
    ) - 1 AS new_ord
  FROM public.program_days
)
UPDATE public.program_days d
SET order_index = ranked.new_ord
FROM ranked
WHERE d.id = ranked.id
  AND d.order_index IS DISTINCT FROM ranked.new_ord;

CREATE UNIQUE INDEX IF NOT EXISTS program_days_program_id_order_index_key
  ON public.program_days (program_id, order_index);

CREATE OR REPLACE FUNCTION public.normalize_session_organization(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN 'fixed_days';
  END IF;
  IF p_value IN ('fixed_days', 'in_order') THEN
    RETURN p_value;
  END IF;
  RAISE EXCEPTION 'Invalid session organization';
END;
$$;

COMMENT ON FUNCTION public.normalize_session_organization(text) IS
  'P3.1: valeur inconnue refusée. NULL/vide = fixed_days (legacy).';

REVOKE ALL ON FUNCTION public.normalize_session_organization(text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.save_program(uuid, text, text, int, jsonb, timestamptz);
DROP FUNCTION IF EXISTS public.create_program_complete(text, text, int, jsonb, uuid, date);

CREATE OR REPLACE FUNCTION public.save_program(
  p_program_id uuid,
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_session_organization text DEFAULT NULL
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
  v_days int;
  v_org text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  v_weeks := GREATEST(1, LEAST(52, COALESCE(p_duration_weeks, 8)));

  SELECT p.owner_id, p.updated_at, p.session_organization
    INTO v_owner, v_seen, v_org
  FROM public.programs p
  WHERE p.id = p_program_id
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;

  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_seen IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stale';
  END IF;

  IF p_session_organization IS NULL OR btrim(p_session_organization) = '' THEN
    v_org := public.normalize_session_organization(v_org);
  ELSE
    v_org := public.normalize_session_organization(p_session_organization);
  END IF;

  UPDATE public.programs
  SET
    name = v_name,
    description = COALESCE(p_description, ''),
    duration_weeks = v_weeks,
    session_organization = v_org
  WHERE id = p_program_id;

  v_days := public.sync_program_days(p_program_id, p_days);
  RETURN v_days;
END;
$$;

COMMENT ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz, text) IS
  'UX20 + P1.2 + P3.1: metadata + organisation + days + revision. Owner write refused while the caller is coached on this active assignment.';

REVOKE ALL ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_program_days(p_program_id uuid, p_days jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day jsonb;
  v_ex jsonb;
  v_weekday int;
  v_name text;
  v_day_id uuid;
  v_payload_id uuid;
  v_used uuid[] := '{}';
  v_order int := 0;
  v_ex_count int;
  v_day_total int := 0;
  v_org text;
  v_seen int[] := '{}';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 14 THEN RAISE EXCEPTION 'Too many days'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = v_uid) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;

  SELECT public.normalize_session_organization(p.session_organization)
    INTO v_org
  FROM public.programs p
  WHERE p.id = p_program_id;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    IF v_org = 'fixed_days' THEN
      BEGIN
        v_weekday := (v_day->>'weekday')::int;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid weekday';
      END;
      IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN RAISE EXCEPTION 'Invalid weekday'; END IF;
      IF v_weekday = ANY (v_seen) THEN RAISE EXCEPTION 'Duplicate weekday %', v_weekday; END IF;
      v_seen := v_seen || v_weekday;
    END IF;
    IF v_day->'exercises' IS NULL OR jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day';
    END IF;
    IF jsonb_array_length(v_day->'exercises') > 100 THEN RAISE EXCEPTION 'Too many exercises'; END IF;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
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
    IF v_payload_id IS NOT NULL THEN
      SELECT d.id INTO v_day_id
      FROM public.program_days d
      WHERE d.program_id = p_program_id AND d.id = v_payload_id AND NOT (d.id = ANY (v_used))
      LIMIT 1;
    END IF;
    IF v_day_id IS NULL AND v_org = 'fixed_days' THEN
      SELECT d.id INTO v_day_id
      FROM public.program_days d
      WHERE d.program_id = p_program_id AND d.weekday = v_weekday AND NOT (d.id = ANY (v_used))
      LIMIT 1;
    END IF;
    IF v_day_id IS NULL THEN
      SELECT d.id INTO v_day_id
      FROM public.program_days d
      WHERE d.program_id = p_program_id AND d.order_index = v_order - 10000 AND NOT (d.id = ANY (v_used))
      LIMIT 1;
    END IF;
    IF v_day_id IS NULL THEN
      INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
      VALUES (p_program_id, v_weekday, COALESCE(v_day->>'name', ''), NULL, v_order)
      RETURNING id INTO v_day_id;
    ELSE
      UPDATE public.program_days
      SET name = COALESCE(v_day->>'name', name), weekday = v_weekday, order_index = v_order
      WHERE id = v_day_id;
    END IF;
    v_used := v_used || v_day_id;
    v_order := v_order + 1;
    DELETE FROM public.program_day_exercises WHERE program_day_id = v_day_id;
    v_ex_count := 0;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
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
  PERFORM public.snapshot_program_revision(p_program_id);
  RETURN v_day_total;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_program_days(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_program_complete(
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
  p_assign_client_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_session_organization text DEFAULT 'fixed_days'
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
  v_order int := 0;
  v_ex_count int;
  v_routine_id uuid;
  v_seen int[] := '{}';
  v_org text;
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
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) > 14 THEN
    RAISE EXCEPTION 'Invalid days';
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
      IF v_weekday = ANY (v_seen) THEN
        RAISE EXCEPTION 'Duplicate weekday %', v_weekday;
      END IF;
      v_seen := v_seen || v_weekday;
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

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    IF v_org = 'fixed_days' THEN
      v_weekday := (v_day->>'weekday')::int;
    ELSE
      v_weekday := NULL;
    END IF;
    v_routine_id := NULLIF(v_day->>'routine_id', '')::uuid;
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
    VALUES (
      v_program_id,
      v_weekday,
      COALESCE(v_day->>'name', ''),
      v_routine_id,
      COALESCE((v_day->>'order_index')::int, v_order)
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

REVOKE ALL ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text) IS
  'D01 + P3.1 : programme + organisation + jours + exercices (+ routine) + assignation optionnelle, une transaction. Toute erreur annule tout.';

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
BEGIN
  IF p_program_id IS NULL THEN RAISE EXCEPTION 'Program required'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  PERFORM 1 FROM public.programs WHERE id = p_program_id FOR UPDATE;
  SELECT public.normalize_session_organization(session_organization)
    INTO v_org
  FROM public.programs
  WHERE id = p_program_id;
  SELECT COALESCE(MAX(revision_no), 0) + 1 INTO v_no
  FROM public.program_revisions
  WHERE program_id = p_program_id;
  SELECT jsonb_build_object(
    'session_organization', v_org,
    'days', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'weekday', d.weekday,
        'name', d.name,
        'order_index', d.order_index,
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
  INSERT INTO public.program_revisions (program_id, revision_no, snapshot, created_by)
  VALUES (p_program_id, v_no, v_snap, auth.uid());
  RETURN v_no;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_program_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_program_revision(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fork_program(p_program_id uuid, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_src public.programs%ROWTYPE;
  v_new_id uuid;
  v_day record;
  v_new_day_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_src FROM public.programs WHERE id = p_program_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Program not found'; END IF;
  IF v_src.owner_id <> v_uid THEN RAISE EXCEPTION 'Not program owner'; END IF;
  INSERT INTO public.programs (owner_id, name, description, duration_weeks, session_organization)
  VALUES (
    v_uid,
    COALESCE(NULLIF(btrim(p_name), ''), v_src.name || ' (adapté)'),
    COALESCE(v_src.description, ''),
    v_src.duration_weeks,
    public.normalize_session_organization(v_src.session_organization)
  )
  RETURNING id INTO v_new_id;
  FOR v_day IN SELECT * FROM public.program_days WHERE program_id = p_program_id ORDER BY order_index LOOP
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
    VALUES (v_new_id, v_day.weekday, v_day.name, v_day.routine_id, v_day.order_index)
    RETURNING id INTO v_new_day_id;
    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min, default_rir,
      default_rest_seconds, default_weight_kg, order_index,
      set_type, superset_group, drop_count, tempo, isometric_seconds,
      cluster_rest_seconds, cluster_reps_per_burst, myo_activation
    )
    SELECT
      v_new_day_id, name, default_sets, default_reps, default_reps_min, default_rir,
      default_rest_seconds, default_weight_kg, order_index,
      set_type, superset_group, drop_count, tempo, isometric_seconds,
      cluster_rest_seconds, cluster_reps_per_burst, myo_activation
    FROM public.program_day_exercises
    WHERE program_day_id = v_day.id
    ORDER BY order_index;
  END LOOP;
  PERFORM public.snapshot_program_revision(v_new_id);
  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fork_program(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fork_program(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.adopt_client_program(p_program_id uuid, p_client_id uuid, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fork_id uuid;
  v_day record;
  v_new_day_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_coach_of(p_client_id) THEN RAISE EXCEPTION 'Not your client'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.programs p
    JOIN public.program_assignments pa ON pa.program_id = p.id
    WHERE p.id = p_program_id AND pa.client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Program not assigned to this client';
  END IF;
  INSERT INTO public.programs (owner_id, name, description, duration_weeks, session_organization)
  SELECT
    v_uid,
    COALESCE(NULLIF(btrim(p_name), ''), p.name || ' (repris)'),
    COALESCE(p.description, ''),
    p.duration_weeks,
    public.normalize_session_organization(p.session_organization)
  FROM public.programs p
  WHERE p.id = p_program_id
  RETURNING id INTO v_fork_id;
  FOR v_day IN SELECT * FROM public.program_days WHERE program_id = p_program_id ORDER BY order_index LOOP
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
    VALUES (v_fork_id, v_day.weekday, v_day.name, v_day.routine_id, v_day.order_index)
    RETURNING id INTO v_new_day_id;
    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min, default_rir,
      default_rest_seconds, default_weight_kg, order_index,
      set_type, superset_group, drop_count, tempo, isometric_seconds,
      cluster_rest_seconds, cluster_reps_per_burst, myo_activation
    )
    SELECT
      v_new_day_id, name, default_sets, default_reps, default_reps_min, default_rir,
      default_rest_seconds, default_weight_kg, order_index,
      set_type, superset_group, drop_count, tempo, isometric_seconds,
      cluster_rest_seconds, cluster_reps_per_burst, myo_activation
    FROM public.program_day_exercises
    WHERE program_day_id = v_day.id
    ORDER BY order_index;
  END LOOP;
  PERFORM public.snapshot_program_revision(v_fork_id);
  RETURN v_fork_id;
END;
$$;

REVOKE ALL ON FUNCTION public.adopt_client_program(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adopt_client_program(uuid, uuid, text) TO authenticated;
