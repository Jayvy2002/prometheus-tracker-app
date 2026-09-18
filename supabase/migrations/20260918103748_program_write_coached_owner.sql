-- P1.2: close leftover Solo-owner writes once the athlete is coached.
-- save_program already refuses that path; sync_program_days, save_program_day_exercises,
-- owner RLS, and program_assignments Data API still trusted owner_id / self-assign.
-- New version only. Do not restamp history.

CREATE OR REPLACE FUNCTION public.actor_is_actively_coached()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_client_links l
    WHERE l.client_id = auth.uid()
      AND l.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.coached_client_cannot_edit_program(p_program_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.actor_is_actively_coached()
    AND EXISTS (
      SELECT 1
      FROM public.program_assignments a
      WHERE a.program_id = p_program_id
        AND a.client_id = auth.uid()
        AND a.status = 'active'
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.actor_is_actively_coached() IS
  'P1.2: true when the caller has an active coach_client_links row as client.';
COMMENT ON FUNCTION public.coached_client_cannot_edit_program(uuid) IS
  'P1.2: true when the caller is coached and this program is their active assignment.';

REVOKE ALL ON FUNCTION public.actor_is_actively_coached() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coached_client_cannot_edit_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actor_is_actively_coached() TO authenticated;
GRANT EXECUTE ON FUNCTION public.coached_client_cannot_edit_program(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_program(
  p_program_id uuid,
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
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
  v_name text;
  v_weeks int;
  v_days int;
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

  SELECT p.owner_id, p.updated_at
    INTO v_owner, v_seen
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

  UPDATE public.programs
  SET
    name = v_name,
    description = COALESCE(p_description, ''),
    duration_weeks = v_weeks
  WHERE id = p_program_id;

  v_days := public.sync_program_days(p_program_id, p_days);
  RETURN v_days;
END;
$$;

COMMENT ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) IS
  'UX20 + P1.2: metadata + days + revision. Owner write refused while the caller is coached on this active assignment.';

REVOKE ALL ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_program_day_exercises(p_day_id uuid, p_exercises jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_program_id uuid;
  v_ex jsonb;
  v_name text;
  v_sets int;
  v_reps int;
  v_rest int;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_day_id IS NULL OR p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_exercises) > 100 THEN RAISE EXCEPTION 'Too many exercises'; END IF;
  SELECT d.program_id INTO v_program_id FROM public.program_days d WHERE d.id = p_day_id;
  IF v_program_id IS NULL THEN RAISE EXCEPTION 'Day not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs p WHERE p.id = v_program_id AND p.owner_id = v_uid) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF public.coached_client_cannot_edit_program(v_program_id) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;
  FOR v_ex IN SELECT * FROM jsonb_array_elements(p_exercises) LOOP
    v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
    IF v_name IS NULL THEN RAISE EXCEPTION 'Exercise name required'; END IF;
    BEGIN
      v_sets := COALESCE((v_ex->>'default_sets')::int, 0);
      v_reps := COALESCE((v_ex->>'default_reps')::int, 0);
      v_rest := COALESCE((v_ex->>'default_rest_seconds')::int, 90);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid numbers for %', v_name;
    END;
    IF v_sets < 1 OR v_sets > 100 THEN RAISE EXCEPTION 'Invalid sets for %', v_name; END IF;
    IF v_reps < 0 OR v_reps > 5000 THEN RAISE EXCEPTION 'Invalid reps for %', v_name; END IF;
    IF v_rest < 0 OR v_rest > 3600 THEN RAISE EXCEPTION 'Invalid rest for %', v_name; END IF;
  END LOOP;
  DELETE FROM public.program_day_exercises WHERE program_day_id = p_day_id;
  FOR v_ex IN SELECT * FROM jsonb_array_elements(p_exercises) LOOP
    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min, default_rir,
      default_rest_seconds, default_weight_kg, order_index,
      set_type, superset_group, drop_count, tempo, isometric_seconds,
      cluster_rest_seconds, cluster_reps_per_burst, myo_activation
    ) VALUES (
      p_day_id,
      btrim(v_ex->>'name'),
      (v_ex->>'default_sets')::int,
      (v_ex->>'default_reps')::int,
      NULLIF(v_ex->>'default_reps_min', '')::int,
      NULLIF(v_ex->>'default_rir', '')::int,
      COALESCE((v_ex->>'default_rest_seconds')::int, 90),
      NULLIF(v_ex->>'default_weight_kg', '')::numeric,
      COALESCE((v_ex->>'order_index')::int, v_count),
      COALESCE(NULLIF(v_ex->>'set_type', ''), 'working'),
      NULLIF(v_ex->>'superset_group', ''),
      NULLIF(v_ex->>'drop_count', '')::int,
      NULLIF(v_ex->>'tempo', ''),
      NULLIF(v_ex->>'isometric_seconds', '')::int,
      NULLIF(v_ex->>'cluster_rest_seconds', '')::int,
      NULLIF(v_ex->>'cluster_reps_per_burst', '')::int,
      COALESCE((v_ex->>'myo_activation')::boolean, false)
    );
    v_count := v_count + 1;
  END LOOP;
  UPDATE public.programs SET updated_at = now() WHERE id = v_program_id;
  PERFORM public.snapshot_program_revision(v_program_id);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_program_day_exercises(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program_day_exercises(uuid, jsonb) TO authenticated;

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
  v_used uuid[] := '{}';
  v_order int := 0;
  v_ex_count int;
  v_day_total int := 0;
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
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    BEGIN
      v_weekday := (v_day->>'weekday')::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid weekday';
    END;
    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN RAISE EXCEPTION 'Invalid weekday'; END IF;
    IF v_day->'exercises' IS NULL OR jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day %', v_weekday;
    END IF;
    IF jsonb_array_length(v_day->'exercises') > 100 THEN RAISE EXCEPTION 'Too many exercises'; END IF;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
      v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
      IF v_name IS NULL THEN RAISE EXCEPTION 'Exercise name required'; END IF;
    END LOOP;
  END LOOP;
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    v_weekday := (v_day->>'weekday')::int;
    SELECT d.id INTO v_day_id
    FROM public.program_days d
    WHERE d.program_id = p_program_id AND d.weekday = v_weekday AND NOT (d.id = ANY (v_used))
    LIMIT 1;
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

DROP POLICY IF EXISTS "Owners manage programs" ON public.programs;
CREATE POLICY "Owners manage programs"
  ON public.programs FOR ALL TO authenticated
  USING (
    owner_id = (select auth.uid())
    AND NOT public.coached_client_cannot_edit_program(id)
  )
  WITH CHECK (
    owner_id = (select auth.uid())
    AND NOT public.coached_client_cannot_edit_program(id)
  );

DROP POLICY IF EXISTS "Owners manage program days" ON public.program_days;
CREATE POLICY "Owners manage program days"
  ON public.program_days FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_days.program_id AND p.owner_id = (select auth.uid())
    )
    AND NOT public.coached_client_cannot_edit_program(program_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_days.program_id AND p.owner_id = (select auth.uid())
    )
    AND NOT public.coached_client_cannot_edit_program(program_id)
  );

DROP POLICY IF EXISTS "Owners manage program day exercises" ON public.program_day_exercises;
CREATE POLICY "Owners manage program day exercises"
  ON public.program_day_exercises FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_days d
      JOIN public.programs p ON p.id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id
        AND p.owner_id = (select auth.uid())
        AND NOT public.coached_client_cannot_edit_program(d.program_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.program_days d
      JOIN public.programs p ON p.id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id
        AND p.owner_id = (select auth.uid())
        AND NOT public.coached_client_cannot_edit_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS "Assigner inserts assignments" ON public.program_assignments;
CREATE POLICY "Assigner inserts assignments" ON public.program_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND (
      (client_id = (select auth.uid()) AND NOT (select public.actor_is_actively_coached()))
      OR public.is_coach_of(client_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Assigner updates assignments" ON public.program_assignments;
CREATE POLICY "Assigner updates assignments" ON public.program_assignments
  FOR UPDATE TO authenticated
  USING (
    assigned_by = (select auth.uid())
    AND NOT (
      client_id = (select auth.uid())
      AND (select public.actor_is_actively_coached())
    )
  )
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND (
      (client_id = (select auth.uid()) AND NOT (select public.actor_is_actively_coached()))
      OR public.is_coach_of(client_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Assigner deletes assignments" ON public.program_assignments;
CREATE POLICY "Assigner deletes assignments" ON public.program_assignments
  FOR DELETE TO authenticated
  USING (
    assigned_by = (select auth.uid())
    AND NOT (
      client_id = (select auth.uid())
      AND (select public.actor_is_actively_coached())
    )
  );
