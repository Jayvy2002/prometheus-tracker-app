-- P3.3 — program versions / activation on the existing revision system.
-- Live graph remains the active program. A future version is a revision
-- snapshot that does not mutate program_days until activation.
-- Legacy programs: active_revision_no = latest snapshot (or NULL if none).

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS active_revision_no int,
  ADD COLUMN IF NOT EXISTS scheduled_revision_no int,
  ADD COLUMN IF NOT EXISTS scheduled_activates_on date;

ALTER TABLE public.program_revisions
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS program_revision_no int;

CREATE INDEX IF NOT EXISTS workouts_program_revision_no_idx
  ON public.workouts (program_revision_no);

COMMENT ON COLUMN public.programs.active_revision_no IS
  'P3.3: revision currently applied to the live program graph.';
COMMENT ON COLUMN public.programs.scheduled_revision_no IS
  'P3.3: at most one future revision. NULL = none scheduled.';
COMMENT ON COLUMN public.workouts.program_revision_no IS
  'P3.3: revision that was active when the workout started. Never rewritten.';

UPDATE public.programs p
SET active_revision_no = s.mx
FROM (
  SELECT program_id, MAX(revision_no) AS mx
  FROM public.program_revisions
  GROUP BY program_id
) s
WHERE p.id = s.program_id AND p.active_revision_no IS NULL;

UPDATE public.program_revisions r
SET activated_at = r.created_at
FROM public.programs p
WHERE r.program_id = p.id
  AND p.active_revision_no = r.revision_no
  AND r.activated_at IS NULL;

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
     ) THEN
    RAISE EXCEPTION 'program version pointers are RPC-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programs_protect_version_pointers ON public.programs;
CREATE TRIGGER programs_protect_version_pointers
  BEFORE UPDATE ON public.programs
  FOR EACH ROW
  EXECUTE FUNCTION public.programs_protect_version_pointers();

REVOKE ALL ON FUNCTION public.programs_protect_version_pointers() FROM PUBLIC, anon, authenticated;

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
      AND pa.status IN ('active', 'paused')
  )
  OR EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id
      AND public.is_coach_of(pa.client_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.actor_can_read_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actor_can_read_program(uuid) TO authenticated;

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
  -- Former Coach of a paused assignment cannot activate/schedule that plan.
  IF EXISTS (
    SELECT 1
    FROM public.program_assignments pa
    WHERE pa.program_id = p_program_id
      AND pa.client_id IS DISTINCT FROM auth.uid()
      AND pa.status IN ('active', 'paused')
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
BEGIN
  IF p_program_id IS NULL THEN RAISE EXCEPTION 'Program required'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  PERFORM 1 FROM public.programs WHERE id = p_program_id FOR UPDATE;
  SELECT public.normalize_session_organization(session_organization), active_revision_no
    INTO v_org, v_prev
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

REVOKE ALL ON FUNCTION public.snapshot_program_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_program_revision(uuid) TO authenticated, service_role;

CREATE FUNCTION public.sync_program_phases(p_program_id uuid, p_phases jsonb, p_trusted boolean)
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
  IF NOT COALESCE(p_trusted, false) THEN
    IF NOT EXISTS (SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = v_uid) THEN
      RAISE EXCEPTION 'Not program owner';
    END IF;
    IF public.coached_client_cannot_edit_program(p_program_id) THEN
      RAISE EXCEPTION 'Coached client cannot edit assigned program';
    END IF;
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

REVOKE ALL ON FUNCTION public.sync_program_phases(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sync_program_days(
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
  v_seen int[] := '{}';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 14 THEN RAISE EXCEPTION 'Too many days'; END IF;
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

REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.apply_program_revision_snapshot(p_program_id uuid, p_revision_no int)
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
BEGIN
  IF p_program_id IS NULL OR p_revision_no IS NULL THEN
    RAISE EXCEPTION 'revision not found';
  END IF;
  SELECT active_revision_no INTO v_prev
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
  ELSE
    v_days := COALESCE(v_snap->'days', '[]'::jsonb);
    v_phases := COALESCE(v_snap->'phases', '[]'::jsonb);
    v_org := NULLIF(btrim(COALESCE(v_snap->>'session_organization', '')), '');
    BEGIN
      v_weeks := NULLIF(btrim(COALESCE(v_snap->>'duration_weeks', '')), '')::int;
    EXCEPTION WHEN OTHERS THEN
      v_weeks := NULL;
    END;
  END IF;
  IF jsonb_typeof(v_days) <> 'array' THEN RAISE EXCEPTION 'Invalid payload'; END IF;
  IF jsonb_typeof(v_phases) <> 'array' THEN RAISE EXCEPTION 'Invalid payload'; END IF;

  UPDATE public.programs
  SET
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
    active_revision_no = p_revision_no
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

REVOKE ALL ON FUNCTION public.apply_program_revision_snapshot(uuid, int) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_program_version(
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
  v_day jsonb;
  v_ex jsonb;
  v_weekday int;
  v_ex_name text;
  v_seen_days int[] := '{}';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 14 THEN RAISE EXCEPTION 'Too many days'; END IF;

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

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    IF v_org = 'fixed_days' THEN
      BEGIN
        v_weekday := (v_day->>'weekday')::int;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid weekday';
      END;
      IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN RAISE EXCEPTION 'Invalid weekday'; END IF;
      IF v_weekday = ANY (v_seen_days) THEN RAISE EXCEPTION 'Duplicate weekday %', v_weekday; END IF;
      v_seen_days := v_seen_days || v_weekday;
    END IF;
    IF v_day->'exercises' IS NULL OR jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day';
    END IF;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
      v_ex_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
      IF v_ex_name IS NULL THEN RAISE EXCEPTION 'Exercise name required'; END IF;
    END LOOP;
  END LOOP;

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

REVOKE ALL ON FUNCTION public.save_program_version(uuid, text, text, int, jsonb, timestamptz, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program_version(uuid, text, text, int, jsonb, timestamptz, text, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.save_program_version(uuid, text, text, int, jsonb, timestamptz, text, jsonb) IS
  'P3.3: persist a saved revision without mutating the live program graph.';

CREATE FUNCTION public.schedule_program_version(
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

  SELECT activated_at INTO v_activated
  FROM public.program_revisions
  WHERE program_id = p_program_id AND revision_no = p_revision_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found'; END IF;

  IF v_active IS NOT DISTINCT FROM p_revision_no THEN
    RETURN p_revision_no;
  END IF;
  IF v_activated IS NOT NULL THEN
    RAISE EXCEPTION 'historical';
  END IF;

  IF v_sched IS NOT NULL AND v_sched IS DISTINCT FROM p_revision_no AND NOT COALESCE(p_replace, false) THEN
    RAISE EXCEPTION 'already_scheduled';
  END IF;

  UPDATE public.programs
  SET
    scheduled_revision_no = p_revision_no,
    scheduled_activates_on = p_activates_on,
    updated_at = now()
  WHERE id = p_program_id;

  IF p_activates_on <= CURRENT_DATE THEN
    RETURN public.apply_program_revision_snapshot(p_program_id, p_revision_no);
  END IF;
  RETURN p_revision_no;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_program_version(uuid, int, date, boolean, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_program_version(uuid, int, date, boolean, timestamptz)
  TO authenticated;

CREATE FUNCTION public.activate_program_version(
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
  RETURN public.apply_program_revision_snapshot(p_program_id, p_revision_no);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_program_version(uuid, int, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_program_version(uuid, int, timestamptz)
  TO authenticated;

CREATE FUNCTION public.ensure_due_program_version(p_program_id uuid)
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_program_id IS NULL THEN RAISE EXCEPTION 'Invalid payload'; END IF;
  IF NOT public.actor_can_read_program(p_program_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT active_revision_no, scheduled_revision_no, scheduled_activates_on
    INTO v_active, v_sched, v_on
  FROM public.programs
  WHERE id = p_program_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_sched IS NULL OR v_on IS NULL OR v_on > CURRENT_DATE THEN
    RETURN 0;
  END IF;
  IF v_active IS NOT DISTINCT FROM v_sched THEN
    UPDATE public.programs
    SET scheduled_revision_no = NULL, scheduled_activates_on = NULL
    WHERE id = p_program_id;
    RETURN v_sched;
  END IF;
  RETURN public.apply_program_revision_snapshot(p_program_id, v_sched);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_due_program_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_due_program_version(uuid) TO authenticated;

COMMENT ON FUNCTION public.ensure_due_program_version(uuid) IS
  'P3.3: apply a scheduled version when activates_on <= current_date. Readable by owner, assigned client, or active coach.';

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
  v_revision_no int;
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

  IF p_program_assignment_id IS NOT NULL THEN
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
