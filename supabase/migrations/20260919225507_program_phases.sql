-- P3.2 — optional program phases on the single program engine.
-- Simple programs stay phase-less. Periodized programs group the same
-- program_days / prescriptions. Deload/taper are phases, not a second engine.
-- Legacy programs: zero rows in program_phases, program_days.phase_id NULL.

CREATE TABLE public.program_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  order_index integer NOT NULL,
  duration_weeks integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_phases_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT program_phases_duration_weeks_check
    CHECK (duration_weeks IS NULL OR (duration_weeks >= 1 AND duration_weeks <= 52)),
  CONSTRAINT program_phases_program_id_order_index_key UNIQUE (program_id, order_index)
);

CREATE INDEX program_phases_program_id_idx ON public.program_phases (program_id);

COMMENT ON TABLE public.program_phases IS
  'P3.2: optional ordered blocks on a program. Empty = simple program. Same logger.';

ALTER TABLE public.program_days
  ADD COLUMN phase_id uuid REFERENCES public.program_phases(id) ON DELETE SET NULL;

CREATE INDEX program_days_phase_id_idx ON public.program_days (phase_id);

ALTER TABLE public.workouts
  ADD COLUMN program_phase_id uuid REFERENCES public.program_phases(id) ON DELETE SET NULL,
  ADD COLUMN prescribed_phase_name text;

CREATE INDEX workouts_program_phase_id_idx ON public.workouts (program_phase_id);

ALTER TABLE public.program_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_phases FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.program_phases FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_phases TO authenticated;

CREATE POLICY "Owners read own program phases"
  ON public.program_phases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_phases.program_id AND p.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "Owners insert program phases"
  ON public.program_phases FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_phases.program_id AND p.owner_id = (select auth.uid())
    )
    AND NOT public.coached_client_cannot_edit_program(program_id)
  );

CREATE POLICY "Owners update program phases"
  ON public.program_phases FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_phases.program_id AND p.owner_id = (select auth.uid())
    )
    AND NOT public.coached_client_cannot_edit_program(program_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_phases.program_id AND p.owner_id = (select auth.uid())
    )
    AND NOT public.coached_client_cannot_edit_program(program_id)
  );

CREATE POLICY "Owners delete program phases"
  ON public.program_phases FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_phases.program_id AND p.owner_id = (select auth.uid())
    )
    AND NOT public.coached_client_cannot_edit_program(program_id)
  );

CREATE POLICY "Assigned clients read program phases"
  ON public.program_phases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_phases.program_id
        AND pa.client_id = (select auth.uid())
        AND pa.status IN ('active', 'paused')
    )
  );

CREATE POLICY "Coaches read assigned program phases"
  ON public.program_phases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_phases.program_id
        AND public.is_coach_of(pa.client_id)
    )
  );

CREATE OR REPLACE FUNCTION public.sync_program_phases(p_program_id uuid, p_phases jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_phase jsonb;
  v_id uuid;
  v_payload_id uuid;
  v_name text;
  v_desc text;
  v_weeks int;
  v_used uuid[] := '{}';
  v_order int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_phases IS NULL OR jsonb_typeof(p_phases) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_phases) > 24 THEN RAISE EXCEPTION 'Too many phases'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = v_uid) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF public.coached_client_cannot_edit_program(p_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;

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
  END LOOP;

  UPDATE public.program_phases
  SET order_index = order_index - 10000
  WHERE program_id = p_program_id;

  FOR v_phase IN SELECT * FROM jsonb_array_elements(p_phases) LOOP
    v_id := NULL;
    v_payload_id := NULL;
    BEGIN
      v_payload_id := NULLIF(btrim(COALESCE(v_phase->>'id', '')), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid payload';
    END;
    v_name := btrim(v_phase->>'name');
    v_desc := COALESCE(v_phase->>'description', '');
    BEGIN
      v_weeks := NULLIF(btrim(COALESCE(v_phase->>'duration_weeks', '')), '')::int;
    EXCEPTION WHEN OTHERS THEN
      v_weeks := NULL;
    END;
    IF v_payload_id IS NOT NULL THEN
      SELECT ph.id INTO v_id
      FROM public.program_phases ph
      WHERE ph.program_id = p_program_id AND ph.id = v_payload_id AND NOT (ph.id = ANY (v_used))
      LIMIT 1;
      IF v_id IS NULL AND EXISTS (SELECT 1 FROM public.program_phases ph WHERE ph.id = v_payload_id) THEN
        RAISE EXCEPTION 'Invalid phase';
      END IF;
    END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.program_phases (id, program_id, name, description, order_index, duration_weeks)
      VALUES (
        COALESCE(v_payload_id, gen_random_uuid()),
        p_program_id,
        v_name,
        v_desc,
        v_order,
        v_weeks
      )
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.program_phases
      SET name = v_name, description = v_desc, order_index = v_order, duration_weeks = v_weeks
      WHERE id = v_id;
    END IF;
    v_used := v_used || v_id;
    v_order := v_order + 1;
  END LOOP;

  DELETE FROM public.program_phases ph
  WHERE ph.program_id = p_program_id AND NOT (ph.id = ANY (v_used));
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_program_phases(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_program_phases(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.sync_program_phases(uuid, jsonb) IS
  'P3.2: replace optional phases for a program. Owner write; leftover Coaché refused.';

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
  v_phase_id uuid;
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

  -- Validation complète AVANT toute mutation.
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

CREATE OR REPLACE FUNCTION public.save_program(
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

  IF p_phases IS NOT NULL THEN
    IF jsonb_typeof(p_phases) <> 'array' THEN
      RAISE EXCEPTION 'Invalid payload';
    END IF;
    PERFORM public.sync_program_phases(p_program_id, p_phases);
  END IF;

  v_days := public.sync_program_days(p_program_id, p_days);
  RETURN v_days;
END;
$$;

DROP FUNCTION IF EXISTS public.save_program(uuid, text, text, int, jsonb, timestamptz, text);

REVOKE ALL ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz, text, jsonb) IS
  'UX20 + P1.2 + P3.1 + P3.2: metadata + organisation + optional phases + days + revision. Owner write refused while the caller is coached on this active assignment.';

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

DROP FUNCTION IF EXISTS public.create_program_complete(text, text, int, jsonb, uuid, date, text);

REVOKE ALL ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date, text, jsonb) IS
  'D01 + P3.1 + P3.2 : programme + organisation + phases optionnelles + jours + exercices (+ routine) + assignation optionnelle, une transaction. Toute erreur annule tout.';

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
  v_phase record;
  v_new_day_id uuid;
  v_new_phase_id uuid;
  v_map jsonb := '{}'::jsonb;
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
  FOR v_phase IN
    SELECT * FROM public.program_phases WHERE program_id = p_program_id ORDER BY order_index
  LOOP
    INSERT INTO public.program_phases (program_id, name, description, order_index, duration_weeks)
    VALUES (v_new_id, v_phase.name, v_phase.description, v_phase.order_index, v_phase.duration_weeks)
    RETURNING id INTO v_new_phase_id;
    v_map := v_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
  END LOOP;
  FOR v_day IN SELECT * FROM public.program_days WHERE program_id = p_program_id ORDER BY order_index LOOP
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index, phase_id)
    VALUES (
      v_new_id,
      v_day.weekday,
      v_day.name,
      v_day.routine_id,
      v_day.order_index,
      NULLIF(v_map->>v_day.phase_id::text, '')::uuid
    )
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
  v_phase record;
  v_new_day_id uuid;
  v_new_phase_id uuid;
  v_map jsonb := '{}'::jsonb;
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
  FOR v_phase IN
    SELECT * FROM public.program_phases WHERE program_id = p_program_id ORDER BY order_index
  LOOP
    INSERT INTO public.program_phases (program_id, name, description, order_index, duration_weeks)
    VALUES (v_fork_id, v_phase.name, v_phase.description, v_phase.order_index, v_phase.duration_weeks)
    RETURNING id INTO v_new_phase_id;
    v_map := v_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
  END LOOP;
  FOR v_day IN SELECT * FROM public.program_days WHERE program_id = p_program_id ORDER BY order_index LOOP
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index, phase_id)
    VALUES (
      v_fork_id,
      v_day.weekday,
      v_day.name,
      v_day.routine_id,
      v_day.order_index,
      NULLIF(v_map->>v_day.phase_id::text, '')::uuid
    )
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
SECURITY INVOKER
SET search_path = public, pg_temp
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'workout_name_required';
  END IF;
  IF jsonb_typeof(COALESCE(p_exercises, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_exercises, '[]'::jsonb)) > 100 THEN
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
    SELECT pd.phase_id, ph.name
      INTO v_phase_id, v_phase_name
    FROM public.program_days pd
    LEFT JOIN public.program_phases ph ON ph.id = pd.phase_id
    WHERE pd.id = p_program_day_id;
  END IF;

  INSERT INTO public.workouts (
    user_id, name, date, routine_id, program_assignment_id, program_day_id,
    program_phase_id, prescribed_phase_name
  ) VALUES (
    v_user_id, btrim(p_name), COALESCE(p_date, now()), p_routine_id,
    p_program_assignment_id, p_program_day_id,
    v_phase_id, v_phase_name
  )
  RETURNING id INTO v_workout_id;

  FOR v_item, v_position IN
    SELECT value, ordinality
    FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb)) WITH ORDINALITY
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

REVOKE ALL ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  TO authenticated;
