-- Audit 3 — a session started from a routine or a program keeps the catalog link.
--
-- start_workout_from_template copied the name of each exercise but not its
-- catalog_exercise_id: the session lost the link its routine or program day
-- had (history by catalog, name in the app language, timed exercises). This
-- version is the one of 20260920014500_p3_hardening, unchanged except that it
-- carries the link:
--   * program day: program_day_exercises.catalog_exercise_id (trusted row);
--   * routine / free template: the id sent by the client, kept only when it is
--     a catalog row this athlete can read (verified or their own); a merged row
--     points to the row it was merged into. Anything else is dropped silently.
-- Same signature, same grants; start_workout_from_template_op still calls it.

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
  v_catalog_id uuid;
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
      'myo_activation', e.myo_activation,
      'catalog_exercise_id', e.catalog_exercise_id
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

    -- Catalog link: the program row's own link, or the one the client sent for a
    -- routine / free template when it names a catalog row this athlete can read.
    -- A malformed or unknown id is dropped, never an error: the start must not fail.
    v_catalog_id := NULL;
    IF COALESCE(v_item->>'catalog_exercise_id', '')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT COALESCE(x.merged_into_id, x.id)
        INTO v_catalog_id
      FROM public.exercises x
      WHERE x.id = (v_item->>'catalog_exercise_id')::uuid
        AND (p_program_day_id IS NOT NULL OR x.verified OR x.created_by = v_user_id);
    END IF;

    INSERT INTO public.workout_exercises (
      workout_id, name, order_index,
      prescribed_sets, prescribed_reps, prescribed_reps_min, prescribed_rir,
      prescribed_rest_seconds, prescribed_weight_kg, superset_group_id,
      prescription_source, catalog_exercise_id
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
      v_source,
      v_catalog_id
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
COMMENT ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb) IS
  'Single logger. DEFINER so internal civil/phase helpers stay ungranted to authenticated. Carries catalog_exercise_id (program row, or a readable catalog row sent by the client).';
