-- Audit lot 7 (E01) : les RPC structurelles figent une révision après mutation.
-- (Postgres exclut triggers différés + tables de transition : snapshots explicites.)

CREATE OR REPLACE FUNCTION public.save_program_day_exercises(
  p_day_id uuid,
  p_exercises jsonb
)
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_day_id IS NULL OR p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_exercises) > 100 THEN
    RAISE EXCEPTION 'Too many exercises';
  END IF;
  SELECT d.program_id INTO v_program_id
  FROM public.program_days d WHERE d.id = p_day_id;
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Day not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = v_program_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;

  -- Validation complète AVANT toute mutation (jamais de journée perdue).
  FOR v_ex IN SELECT * FROM jsonb_array_elements(p_exercises) LOOP
    v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Exercise name required';
    END IF;
    BEGIN
      v_sets := COALESCE((v_ex->>'default_sets')::int, 0);
      v_reps := COALESCE((v_ex->>'default_reps')::int, 0);
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

  DELETE FROM public.program_day_exercises WHERE program_day_id = p_day_id;

  FOR v_ex IN SELECT * FROM jsonb_array_elements(p_exercises) LOOP
    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
    ) VALUES (
      p_day_id,
      btrim(v_ex->>'name'),
      (v_ex->>'default_sets')::int,
      (v_ex->>'default_reps')::int,
      NULLIF(v_ex->>'default_reps_min', '')::int,
      NULLIF(v_ex->>'default_rir', '')::int,
      COALESCE((v_ex->>'default_rest_seconds')::int, 90),
      NULLIF(v_ex->>'default_weight_kg', '')::numeric,
      COALESCE((v_ex->>'order_index')::int, v_count)
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

CREATE OR REPLACE FUNCTION public.sync_program_days(
  p_program_id uuid,
  p_days jsonb
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
  v_weekday int;
  v_name text;
  v_day_id uuid;
  v_used uuid[] := '{}';
  v_order int := 0;
  v_ex_count int;
  v_day_total int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 14 THEN
    RAISE EXCEPTION 'Too many days';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = p_program_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;

  -- Validation complète AVANT toute mutation.
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    BEGIN
      v_weekday := (v_day->>'weekday')::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid weekday';
    END;
    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'Invalid weekday';
    END IF;
    IF v_day->'exercises' IS NULL OR jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day %', v_weekday;
    END IF;
    IF jsonb_array_length(v_day->'exercises') > 100 THEN
      RAISE EXCEPTION 'Too many exercises';
    END IF;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
      v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'Exercise name required';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    v_weekday := (v_day->>'weekday')::int;
    SELECT d.id INTO v_day_id
    FROM public.program_days d
    WHERE d.program_id = p_program_id
      AND d.weekday = v_weekday
      AND NOT (d.id = ANY (v_used))
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
        program_day_id, name, default_sets, default_reps, default_reps_min,
        default_rir, default_rest_seconds, default_weight_kg, order_index
      ) VALUES (
        v_day_id,
        btrim(v_ex->>'name'),
        COALESCE((v_ex->>'default_sets')::int, 3),
        COALESCE((v_ex->>'default_reps')::int, 10),
        NULLIF(v_ex->>'default_reps_min', '')::int,
        NULLIF(v_ex->>'default_rir', '')::int,
        COALESCE((v_ex->>'default_rest_seconds')::int, 90),
        NULLIF(v_ex->>'default_weight_kg', '')::numeric,
        COALESCE((v_ex->>'order_index')::int, v_ex_count)
      );
      v_ex_count := v_ex_count + 1;
    END LOOP;
    v_day_total := v_day_total + 1;
  END LOOP;

  DELETE FROM public.program_days d
  WHERE d.program_id = p_program_id AND NOT (d.id = ANY (v_used));

  UPDATE public.programs SET updated_at = now() WHERE id = p_program_id;
  PERFORM public.snapshot_program_revision(p_program_id);
  RETURN v_day_total;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_program_days(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fork_program(
  p_program_id uuid,
  p_name text DEFAULT NULL
)
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO v_src FROM public.programs WHERE id = p_program_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found';
  END IF;
  IF v_src.owner_id <> v_uid THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;

  INSERT INTO public.programs (owner_id, name, description, duration_weeks)
  VALUES (
    v_uid,
    COALESCE(NULLIF(btrim(p_name), ''), v_src.name || ' (adapté)'),
    COALESCE(v_src.description, ''),
    v_src.duration_weeks
  )
  RETURNING id INTO v_new_id;

  FOR v_day IN
    SELECT * FROM public.program_days
    WHERE program_id = p_program_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
    VALUES (v_new_id, v_day.weekday, v_day.name, v_day.routine_id, v_day.order_index)
    RETURNING id INTO v_new_day_id;

    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
    )
    SELECT
      v_new_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
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

CREATE OR REPLACE FUNCTION public.adopt_client_program(
  p_program_id uuid,
  p_client_id uuid,
  p_name text DEFAULT NULL
)
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_coach_of(p_client_id) THEN
    RAISE EXCEPTION 'Not your client';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    JOIN public.program_assignments pa ON pa.program_id = p.id
    WHERE p.id = p_program_id
      AND pa.client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Program not assigned to this client';
  END IF;

  INSERT INTO public.programs (owner_id, name, description, duration_weeks)
  SELECT v_uid, COALESCE(NULLIF(btrim(p_name), ''), p.name || ' (repris)'),
    COALESCE(p.description, ''), p.duration_weeks
  FROM public.programs p WHERE p.id = p_program_id
  RETURNING id INTO v_fork_id;

  FOR v_day IN
    SELECT * FROM public.program_days
    WHERE program_id = p_program_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
    VALUES (v_fork_id, v_day.weekday, v_day.name, v_day.routine_id, v_day.order_index)
    RETURNING id INTO v_new_day_id;

    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
    )
    SELECT v_new_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
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
