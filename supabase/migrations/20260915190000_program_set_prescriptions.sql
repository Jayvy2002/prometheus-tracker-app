-- Lot 14 (UX98–100): prescribe set types on program days and seed the logger.
-- New version only. Do not restamp history. Copy RPCs; do not apply via MCP.

ALTER TABLE public.program_day_exercises
  ADD COLUMN IF NOT EXISTS set_type text NOT NULL DEFAULT 'working',
  ADD COLUMN IF NOT EXISTS superset_group text,
  ADD COLUMN IF NOT EXISTS drop_count integer,
  ADD COLUMN IF NOT EXISTS tempo text,
  ADD COLUMN IF NOT EXISTS isometric_seconds integer,
  ADD COLUMN IF NOT EXISTS cluster_rest_seconds integer,
  ADD COLUMN IF NOT EXISTS cluster_reps_per_burst integer,
  ADD COLUMN IF NOT EXISTS myo_activation boolean NOT NULL DEFAULT false;

ALTER TABLE public.workout_sets
  ADD COLUMN IF NOT EXISTS drop_segments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.program_day_exercises.set_type IS
  'warmup / working / drop / myo / tempo / isometric / cluster. Superset is a group, not a type.';
COMMENT ON COLUMN public.program_day_exercises.superset_group IS
  'Same letter/key links 2+ exercises of the same day (A1/A2).';
COMMENT ON COLUMN public.workout_sets.drop_segments IS
  'Drop set: one checkbox, N successive loads. Empty array = not a multi-load drop.';


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

  INSERT INTO public.workouts (
    user_id, name, date, routine_id, program_assignment_id, program_day_id
  ) VALUES (
    v_user_id, btrim(p_name), COALESCE(p_date, now()), p_routine_id,
    p_program_assignment_id, p_program_day_id
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

CREATE OR REPLACE FUNCTION public.create_program_complete(
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
  p_assign_client_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL
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
    IF v_weekday = ANY (v_seen) THEN
      RAISE EXCEPTION 'Duplicate weekday %', v_weekday;
    END IF;
    v_seen := v_seen || v_weekday;

    v_routine_id := NULLIF(v_day->>'routine_id', '')::uuid;
    IF v_routine_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.routines r
      WHERE r.id = v_routine_id AND r.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Routine not found';
    END IF;

    IF v_day ? 'exercises' AND v_day->'exercises' IS NOT NULL
       AND jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day %', v_weekday;
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

  INSERT INTO public.programs (owner_id, name, description, duration_weeks)
  VALUES (v_uid, btrim(p_name), COALESCE(p_description, ''), p_duration_weeks)
  RETURNING id INTO v_program_id;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    v_weekday := (v_day->>'weekday')::int;
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

REVOKE ALL ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date) IS
  'D01 : programme + jours + exercices (+ routine) + assignation optionnelle, une transaction. Toute erreur annule tout.';

