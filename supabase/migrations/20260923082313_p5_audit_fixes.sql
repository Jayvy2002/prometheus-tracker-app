-- P5 audit fixes. Append-only. Does not restate applied history.
-- Closes consent/revision, lock order, provenance, catalog visibility,
-- operator recheck, quotas, and claim/delete preflight.

-- ---------------------------------------------------------------------------
-- Provenance and deletion preflight
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coach_import_claim_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid REFERENCES public.coach_provisional_claims(id) ON DELETE SET NULL,
  coach_ref text NOT NULL CHECK (coach_ref ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  dossier_id uuid,
  import_id uuid,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  mapping_hash text NOT NULL CHECK (char_length(mapping_hash) = 64),
  kind text NOT NULL CHECK (kind IN ('workout', 'body_weight')),
  row_lineage jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS coach_import_claim_sources_hash_idx
  ON public.coach_import_claim_sources (file_sha256, created_at DESC);

ALTER TABLE public.coach_import_claim_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_import_claim_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.coach_import_claim_sources TO service_role;

CREATE TABLE IF NOT EXISTS public.coach_import_subject_sources (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('workout', 'body_weight')),
  import_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, file_sha256)
);

ALTER TABLE public.coach_import_subject_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_import_subject_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.coach_import_subject_sources TO service_role;

CREATE TABLE IF NOT EXISTS public.coach_import_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid,
  coach_ref text NOT NULL CHECK (coach_ref ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  kind text CHECK (kind IS NULL OR kind IN ('workout', 'body_weight')),
  error_code text NOT NULL CHECK (char_length(error_code) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.coach_import_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_import_incidents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.coach_import_incidents TO service_role;

CREATE TABLE IF NOT EXISTS public.platform_operator_departures (
  user_id uuid PRIMARY KEY,
  departed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 80)
);

ALTER TABLE public.platform_operator_departures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_operator_departures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_operator_departures TO service_role;

CREATE TABLE IF NOT EXISTS public.exercise_duplicate_dismissals (
  left_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  right_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (left_id, right_id),
  CHECK (left_id < right_id)
);

ALTER TABLE public.exercise_duplicate_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exercise_duplicate_dismissals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.exercise_duplicate_dismissals TO service_role;

ALTER TABLE public.platform_admin_audit
  ADD COLUMN IF NOT EXISTS object_name text;

ALTER TABLE public.platform_operators
  DROP CONSTRAINT IF EXISTS platform_operators_user_id_fkey;
ALTER TABLE public.platform_operators
  ADD CONSTRAINT platform_operators_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.coach_imports
  DROP CONSTRAINT IF EXISTS coach_imports_provisional_dossier_id_fkey;
ALTER TABLE public.coach_imports
  ADD CONSTRAINT coach_imports_provisional_dossier_id_fkey
  FOREIGN KEY (provisional_dossier_id) REFERENCES public.coach_provisional_dossiers(id) ON DELETE SET NULL;

ALTER TABLE public.coach_imports
  DROP CONSTRAINT IF EXISTS coach_imports_subject_xor_dossier;
ALTER TABLE public.coach_imports
  ADD CONSTRAINT coach_imports_subject_xor_dossier CHECK (
    (subject_user_id IS NOT NULL AND provisional_dossier_id IS NULL)
    OR (subject_user_id IS NULL AND provisional_dossier_id IS NOT NULL)
    OR (
      subject_user_id IS NULL
      AND provisional_dossier_id IS NULL
      AND status IN ('previewed', 'committed', 'failed', 'cancelled')
    )
  );

CREATE OR REPLACE FUNCTION public.coach_dossier_preserve_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.coach_import_claim_sources (
    coach_ref, dossier_id, import_id, file_sha256, mapping_hash, kind, row_lineage
  )
  SELECT
    'user:' || OLD.coach_id::text,
    OLD.id,
    i.id,
    i.file_sha256,
    i.mapping_hash,
    i.kind,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('row_no', r.row_no, 'status', r.status) ORDER BY r.row_no)
      FROM public.coach_import_rows r
      WHERE r.import_id = i.id
    ), '[]'::jsonb)
  FROM public.coach_imports i
  WHERE i.provisional_dossier_id = OLD.id
    AND i.status = 'committed';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS coach_dossier_preserve_sources ON public.coach_provisional_dossiers;
CREATE TRIGGER coach_dossier_preserve_sources
  BEFORE DELETE ON public.coach_provisional_dossiers
  FOR EACH ROW
  EXECUTE FUNCTION public.coach_dossier_preserve_sources();

REVOKE ALL ON FUNCTION public.coach_dossier_preserve_sources() FROM PUBLIC, anon, authenticated;

-- Attached copies stay readable only while coaching is active.
DROP POLICY IF EXISTS coach_provisional_workouts_select ON public.coach_provisional_workouts;
CREATE POLICY coach_provisional_workouts_select ON public.coach_provisional_workouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_provisional_dossiers d
      WHERE d.id = dossier_id
        AND d.coach_id = (SELECT auth.uid())
        AND (
          d.status <> 'attached'
          OR EXISTS (
            SELECT 1 FROM public.coach_client_links l
            WHERE l.coach_id = d.coach_id
              AND l.client_id = d.attached_user_id
              AND l.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS coach_provisional_exercises_select ON public.coach_provisional_exercises;
CREATE POLICY coach_provisional_exercises_select ON public.coach_provisional_exercises
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_provisional_workouts w
      JOIN public.coach_provisional_dossiers d ON d.id = w.dossier_id
      WHERE w.id = workout_id
        AND d.coach_id = (SELECT auth.uid())
        AND (
          d.status <> 'attached'
          OR EXISTS (
            SELECT 1 FROM public.coach_client_links l
            WHERE l.coach_id = d.coach_id
              AND l.client_id = d.attached_user_id
              AND l.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS coach_provisional_sets_select ON public.coach_provisional_sets;
CREATE POLICY coach_provisional_sets_select ON public.coach_provisional_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_provisional_exercises e
      JOIN public.coach_provisional_workouts w ON w.id = e.workout_id
      JOIN public.coach_provisional_dossiers d ON d.id = w.dossier_id
      WHERE e.id = exercise_id
        AND d.coach_id = (SELECT auth.uid())
        AND (
          d.status <> 'attached'
          OR EXISTS (
            SELECT 1 FROM public.coach_client_links l
            WHERE l.coach_id = d.coach_id
              AND l.client_id = d.attached_user_id
              AND l.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS coach_provisional_weights_select ON public.coach_provisional_weights;
CREATE POLICY coach_provisional_weights_select ON public.coach_provisional_weights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_provisional_dossiers d
      WHERE d.id = dossier_id
        AND d.coach_id = (SELECT auth.uid())
        AND (
          d.status <> 'attached'
          OR EXISTS (
            SELECT 1 FROM public.coach_client_links l
            WHERE l.coach_id = d.coach_id
              AND l.client_id = d.attached_user_id
              AND l.status = 'active'
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := coalesce(nullif(auth.role(), ''), current_user);
  v_active integer;
  v_self integer;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  PERFORM public.lock_platform_operators();
  SELECT count(*) FILTER (WHERE revoked_at IS NULL),
         count(*) FILTER (WHERE user_id = p_user AND revoked_at IS NULL)
    INTO v_active, v_self
  FROM public.platform_operators;
  IF v_self = 1 AND v_active <= 1 THEN
    RAISE EXCEPTION 'last_operator';
  END IF;
  IF v_self = 1 THEN
    INSERT INTO public.platform_operator_departures (user_id, reason)
    VALUES (p_user, 'account_deleted')
    ON CONFLICT (user_id) DO UPDATE
      SET departed_at = clock_timestamp(), reason = excluded.reason;
    DELETE FROM public.platform_operators WHERE user_id = p_user;
  END IF;
  UPDATE public.coach_provisional_dossiers
     SET status = 'revoked',
         attached_user_id = NULL,
         attached_at = NULL,
         updated_at = clock_timestamp()
   WHERE attached_user_id = p_user;
  RETURN jsonb_build_object('ok', true, 'user_id', p_user);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;

COMMENT ON FUNCTION public.prepare_account_deletion(uuid) IS
  'Service-role preflight before storage cleanup and Auth deletion. Refuses the last operator. Detaches provisional dossiers so attached_user_id RESTRICT does not block the athlete. Direct Auth deletion of an operator still fails the RESTRICT foreign key.';

-- ---------------------------------------------------------------------------
-- Catalog visibility, collisions, canonical lock, request guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.exercise_catalog_key_count(p_norm text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT e.id)::integer
    FROM public.exercises e
   WHERE p_norm IS NOT NULL
     AND e.merged_into_id IS NULL
     AND (
       public.exercise_normalize_name(e.name) = p_norm
       OR public.exercise_normalize_name(e.name_fr) = p_norm
       OR EXISTS (
         SELECT 1 FROM public.exercise_aliases a
          WHERE a.exercise_id = e.id AND a.normalized = p_norm
       )
     );
$$;

REVOKE ALL ON FUNCTION public.exercise_catalog_key_count(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.exercise_visible(p_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exercises e
     WHERE e.id = p_id
       AND e.merged_into_id IS NULL
       AND (e.verified = true OR e.created_by = p_user)
  );
$$;

REVOKE ALL ON FUNCTION public.exercise_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_exercise_catalog(p_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := public.exercise_normalize_name(p_name);
  v_count integer;
  v_id uuid;
BEGIN
  IF v_norm IS NULL THEN
    RETURN NULL;
  END IF;
  v_count := public.exercise_catalog_key_count(v_norm);
  IF v_count <> 1 THEN
    RETURN NULL;
  END IF;
  SELECT e.id INTO v_id
    FROM public.exercises e
   WHERE e.merged_into_id IS NULL
     AND (
       public.exercise_normalize_name(e.name) = v_norm
       OR public.exercise_normalize_name(e.name_fr) = v_norm
       OR EXISTS (
         SELECT 1 FROM public.exercise_aliases a
          WHERE a.exercise_id = e.id AND a.normalized = v_norm
       )
     )
   LIMIT 1;
  IF NOT public.exercise_visible(v_id, auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_exercise_catalog_as(p_name text, p_user uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := public.exercise_normalize_name(p_name);
  v_id uuid;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF public.exercise_catalog_key_count(v_norm) <> 1 THEN
    RETURN NULL;
  END IF;
  SELECT e.id INTO v_id
    FROM public.exercises e
   WHERE e.merged_into_id IS NULL
     AND (
       public.exercise_normalize_name(e.name) = v_norm
       OR public.exercise_normalize_name(e.name_fr) = v_norm
       OR EXISTS (
         SELECT 1 FROM public.exercise_aliases a
          WHERE a.exercise_id = e.id AND a.normalized = v_norm
       )
     )
   LIMIT 1;
  IF NOT public.exercise_visible(v_id, p_user) THEN
    RETURN NULL;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_exercise_catalog_as(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_exercise_catalog_as(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.exercise_public_card(p_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.exercise_visible(p_id, p_user) THEN jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'name_fr', e.name_fr,
      'primary_muscles', e.primary_muscles,
      'category', e.category,
      'equipment', e.equipment
    )
    ELSE NULL
  END
  FROM public.exercises e
  WHERE e.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.exercise_public_card(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exercise_public_card(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.exercise_canonical_id(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_id;
  v_next uuid;
  v_guard integer := 0;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;
  LOOP
    SELECT merged_into_id INTO v_next
      FROM public.exercises
     WHERE id = v_id
     FOR SHARE;
    EXIT WHEN NOT FOUND OR v_next IS NULL;
    v_id := v_next;
    v_guard := v_guard + 1;
    IF v_guard > 8 THEN
      RAISE EXCEPTION 'merge_cycle';
    END IF;
  END LOOP;
  RETURN v_id;
END;
$$;

DROP TRIGGER IF EXISTS exercise_catalog_link_workout ON public.workout_exercises;
CREATE TRIGGER exercise_catalog_link_workout
  BEFORE INSERT OR UPDATE ON public.workout_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

DROP TRIGGER IF EXISTS exercise_catalog_link_routine ON public.routine_exercises;
CREATE TRIGGER exercise_catalog_link_routine
  BEFORE INSERT OR UPDATE ON public.routine_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

DROP TRIGGER IF EXISTS exercise_catalog_link_program ON public.program_day_exercises;
CREATE TRIGGER exercise_catalog_link_program
  BEFORE INSERT OR UPDATE ON public.program_day_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

DROP TRIGGER IF EXISTS exercise_catalog_link_provisional ON public.coach_provisional_exercises;
CREATE TRIGGER exercise_catalog_link_provisional
  BEFORE INSERT OR UPDATE ON public.coach_provisional_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

CREATE OR REPLACE FUNCTION public.exercise_request_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('approved', 'rejected', 'matched')
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.result_exercise_id IS DISTINCT FROM OLD.result_exercise_id) THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  IF OLD.result_exercise_id IS NOT NULL AND NEW.result_exercise_id IS NULL THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exercise_request_status_guard ON public.exercise_requests;
CREATE TRIGGER exercise_request_status_guard
  BEFORE UPDATE ON public.exercise_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_request_status_guard();

REVOKE ALL ON FUNCTION public.exercise_request_status_guard() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can create exercise requests" ON public.exercise_requests;
CREATE POLICY "Users can create exercise requests"
  ON public.exercise_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND result_exercise_id IS NULL
  );

CREATE OR REPLACE FUNCTION public.list_exercise_duplicate_candidates(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE (left_id uuid, right_id uuid, left_name text, right_name text, score real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pair.left_id, pair.right_id, pair.left_name, pair.right_name, pair.score
    FROM (
      SELECT a.exercise_id AS left_id,
             b.exercise_id AS right_id,
             ea.name AS left_name,
             eb.name AS right_name,
             max(similarity(a.normalized, b.normalized)) AS score
        FROM public.exercise_aliases a
        JOIN public.exercise_aliases b ON a.exercise_id < b.exercise_id
        JOIN public.exercises ea ON ea.id = a.exercise_id AND ea.merged_into_id IS NULL
        JOIN public.exercises eb ON eb.id = b.exercise_id AND eb.merged_into_id IS NULL
       WHERE a.normalized <> b.normalized
         AND similarity(a.normalized, b.normalized) >= 0.72
         AND NOT EXISTS (
           SELECT 1 FROM public.exercise_duplicate_dismissals d
            WHERE d.left_id = a.exercise_id AND d.right_id = b.exercise_id
         )
       GROUP BY a.exercise_id, b.exercise_id, ea.name, eb.name
    ) pair
   ORDER BY pair.score DESC, pair.left_name, pair.right_name
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
   OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

DROP FUNCTION IF EXISTS public.list_exercise_duplicate_candidates(integer);
REVOKE ALL ON FUNCTION public.list_exercise_duplicate_candidates(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_exercise_duplicate_candidates(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_user uuid, p_function text, p_limit integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_count integer;
  v_start timestamptz;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_user IS NULL OR p_function IS NULL OR coalesce(p_limit, 0) < 1 THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  PERFORM pg_advisory_xact_lock(20014509, pg_catalog.hashtext(p_user::text || ':' || p_function));
  v_start := (date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  SELECT count(*) INTO v_count
    FROM public.ai_usage_logs
   WHERE user_id = p_user
     AND function_name = p_function
     AND called_at >= v_start;
  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'daily_limit';
  END IF;
  INSERT INTO public.ai_usage_logs (user_id, function_name)
  VALUES (p_user, p_function)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Import quota, set order, incidents, provisional revision
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.coach_import_actionable_preview_count(p_coach uuid, p_except uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
    FROM public.coach_imports i
   WHERE i.coach_id = p_coach
     AND i.status = 'previewed'
     AND i.id IS DISTINCT FROM p_except
     AND (
       i.subject_user_id = p_coach
       OR (
         i.subject_user_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.coach_client_links l
            WHERE l.coach_id = p_coach
              AND l.client_id = i.subject_user_id
              AND l.status = 'active'
         )
       )
       OR EXISTS (
         SELECT 1 FROM public.coach_provisional_dossiers d
          WHERE d.id = i.provisional_dossier_id
            AND d.coach_id = p_coach
            AND d.status IN ('preparing', 'invited')
       )
     );
$$;

REVOKE ALL ON FUNCTION public.coach_import_actionable_preview_count(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_stamp_set_orders(p_import uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH groups AS (
    SELECT r.id,
           r.row_no,
           coalesce(r.planned->>'date', '') AS d,
           coalesce(r.planned->>'session_name', '') AS s,
           coalesce(r.planned->>'exercise', '') AS e,
           CASE
             WHEN coalesce(r.planned->>'set_index', '') ~ '^[0-9]+$'
              AND (r.planned->>'set_index')::integer BETWEEN 1 AND 100
             THEN (r.planned->>'set_index')::integer
           END AS si
      FROM public.coach_import_rows r
     WHERE r.import_id = p_import
       AND r.status = 'ready'
  ),
  flags AS (
    SELECT d, s, e,
           bool_and(si IS NOT NULL) AS explicit,
           count(*) = count(DISTINCT si) AS unique_si
      FROM groups
     GROUP BY d, s, e
  ),
  ranked AS (
    SELECT g.id,
           CASE
             WHEN f.explicit AND f.unique_si THEN g.si
             ELSE row_number() OVER (PARTITION BY g.d, g.s, g.e ORDER BY g.row_no)::integer
           END AS ord,
           CASE WHEN f.explicit AND f.unique_si THEN 'set_index' ELSE 'file_order' END AS rule
      FROM groups g
      JOIN flags f USING (d, s, e)
  )
  UPDATE public.coach_import_rows r
     SET planned = r.planned || jsonb_build_object('applied_order', ranked.ord, 'order_rule', ranked.rule)
    FROM ranked
   WHERE r.id = ranked.id;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_stamp_set_orders(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_problem_fingerprint(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.coach_import_sha256(
    i.status || ':' || i.mapping_hash || ':' || i.error_count::text || ':' || i.ready_count::text || ':' || i.row_count::text || ':' ||
    coalesce((
      SELECT string_agg(DISTINCT r.error_code, ',' ORDER BY r.error_code)
      FROM public.coach_import_rows r
      WHERE r.import_id = i.id AND r.error_code IS NOT NULL
    ), '')
  )
  FROM public.coach_imports i
  WHERE i.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.coach_import_problem_fingerprint(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_coach_import_incident(p_kind text, p_error_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text := NULLIF(btrim(coalesce(p_kind, '')), '');
  v_code text := left(btrim(coalesce(p_error_code, '')), 80);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_capabilities c
    WHERE c.user_id = v_uid AND c.capability = 'coach'
  ) THEN
    RAISE EXCEPTION 'coach_capability_required';
  END IF;
  IF v_code IS NULL OR char_length(v_code) < 1 THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('workout', 'body_weight') THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  INSERT INTO public.coach_import_incidents (coach_id, coach_ref, kind, error_code)
  VALUES (v_uid, 'user:' || v_uid::text, v_kind, v_code);
  RETURN jsonb_build_object('status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.record_coach_import_incident(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_coach_import_incident(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.record_coach_import_incident(text, text) IS
  'Durable trace after a preview or commit rolls back. Stores an error code only, never the CSV.';

CREATE OR REPLACE FUNCTION public.provisional_content_revision(p_dossier uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.coach_import_sha256(
    coalesce((
      SELECT string_agg(
        w.id::text || '|' || w.name || '|' || w.performed_at::text || '|' ||
        coalesce((
          SELECT string_agg(
            e.name || '|' || e.order_index::text || '|' || e.notes || '|' ||
            coalesce((
              SELECT string_agg(
                s.order_index::text || '|' || coalesce(s.weight_kg::text, '') || '|' ||
                coalesce(s.reps::text, '') || '|' || coalesce(s.rir::text, '') || '|' || s.set_type,
                ',' ORDER BY s.order_index, s.id
              )
              FROM public.coach_provisional_sets s
              WHERE s.exercise_id = e.id
            ), ''),
            ';' ORDER BY e.order_index, e.id
          )
          FROM public.coach_provisional_exercises e
          WHERE e.workout_id = w.id
        ), ''),
        E'\n' ORDER BY w.performed_at, w.id
      )
      FROM public.coach_provisional_workouts w
      WHERE w.dossier_id = p_dossier
    ), '') || E'\n' ||
    coalesce((
      SELECT string_agg(
        wt.measured_at::text || '|' || wt.weight_kg::text || '|' || coalesce(wt.notes, ''),
        E'\n' ORDER BY wt.measured_at, wt.id
      )
      FROM public.coach_provisional_weights wt
      WHERE wt.dossier_id = p_dossier
    ), '')
  );
$$;

REVOKE ALL ON FUNCTION public.provisional_content_revision(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provisional_expire_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.coach_provisional_invites
     SET status = 'expired'
   WHERE status = 'pending'
     AND expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.provisional_expire_invites() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisional_expire_invites() TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.provisional_purge_abandoned()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.provisional_expire_invites();
  DELETE FROM public.coach_provisional_dossiers d
   WHERE d.status IN ('preparing', 'invited', 'revoked')
     AND d.attached_user_id IS NULL
     AND d.updated_at < clock_timestamp() - interval '90 days'
     AND NOT EXISTS (
       SELECT 1 FROM public.coach_provisional_claims c WHERE c.dossier_id = d.id
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.provisional_purge_abandoned() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisional_purge_abandoned() TO postgres, service_role;

COMMENT ON FUNCTION public.provisional_purge_abandoned() IS
  'Deletes unclaimed dossiers idle for 90 days. Attached athlete copies and claim rows are kept. Invite expiry is committed here, never by a read that then raises.';

CREATE OR REPLACE FUNCTION public.preview_provisional_claim(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_invite public.coach_provisional_invites;
  v_dossier public.coach_provisional_dossiers;
  v_coach uuid;
  v_email text;
  v_coach_name text;
  v_sessions jsonb;
  v_weights jsonb;
  v_files jsonb;
  v_session_dates jsonb;
  v_weight_dates jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_token IS NULL OR char_length(btrim(p_token)) < 32 THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  v_hash := public.coach_import_sha256(btrim(p_token));
  SELECT * INTO v_invite FROM public.coach_provisional_invites WHERE token_hash = v_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  SELECT coach_id INTO v_coach
    FROM public.coach_provisional_dossiers
   WHERE id = v_invite.dossier_id;
  IF v_coach IS NULL THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  PERFORM public.lock_coach_relationship_lifecycle(v_coach);
  PERFORM public.lock_coach_import_provisional(v_invite.dossier_id);
  SELECT * INTO v_dossier
    FROM public.coach_provisional_dossiers
   WHERE id = v_invite.dossier_id
   FOR UPDATE;
  SELECT * INTO v_invite
    FROM public.coach_provisional_invites
   WHERE id = v_invite.id
   FOR UPDATE;
  IF v_dossier.status = 'attached' AND v_dossier.attached_user_id = v_uid THEN
    RETURN (
      SELECT public.provisional_claim_summary(c)
      FROM public.coach_provisional_claims c
      WHERE c.dossier_id = v_dossier.id
    );
  END IF;
  IF v_invite.status = 'revoked' OR v_dossier.status = 'revoked' THEN
    RAISE EXCEPTION 'invite_revoked';
  END IF;
  IF v_invite.status = 'expired' OR v_invite.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF v_invite.status <> 'pending' OR v_dossier.status NOT IN ('preparing', 'invited') THEN
    RAISE EXCEPTION 'invite_consumed';
  END IF;
  v_email := public.provisional_caller_email();
  IF v_email IS NULL OR v_email IS DISTINCT FROM v_invite.email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;
  SELECT coalesce(nullif(btrim(p.full_name), ''), '') INTO v_coach_name
    FROM public.user_profiles p
   WHERE p.id = v_dossier.coach_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'date', q.civil,
           'name', q.name,
           'exercises', q.exercises,
           'details', q.details
         ) ORDER BY q.civil, q.name), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT
        (w.performed_at AT TIME ZONE 'UTC')::date AS civil,
        w.name,
        coalesce((
          SELECT jsonb_agg(e.name ORDER BY e.order_index)
          FROM public.coach_provisional_exercises e
          WHERE e.workout_id = w.id
        ), '[]'::jsonb) AS exercises,
        coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'name', e.name,
                   'notes', e.notes,
                   'sets', coalesce((
                     SELECT jsonb_agg(jsonb_build_object(
                              'order', s.order_index,
                              'weight_kg', s.weight_kg,
                              'reps', s.reps,
                              'rir', s.rir,
                              'set_type', s.set_type
                            ) ORDER BY s.order_index)
                     FROM public.coach_provisional_sets s
                     WHERE s.exercise_id = e.id
                   ), '[]'::jsonb)
                 ) ORDER BY e.order_index)
          FROM public.coach_provisional_exercises e
          WHERE e.workout_id = w.id
        ), '[]'::jsonb) AS details
      FROM public.coach_provisional_workouts w
      WHERE w.dossier_id = v_dossier.id
    ) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'measured_at', w.measured_at,
           'weight_kg', w.weight_kg,
           'notes', coalesce(w.notes, '')
         ) ORDER BY w.measured_at), '[]'::jsonb),
         coalesce(jsonb_agg(w.measured_at ORDER BY w.measured_at), '[]'::jsonb)
    INTO v_weights, v_weight_dates
    FROM public.coach_provisional_weights w
   WHERE w.dossier_id = v_dossier.id;
  SELECT coalesce(jsonb_agg(DISTINCT i.file_sha256), '[]'::jsonb)
    INTO v_files
    FROM public.coach_imports i
   WHERE i.provisional_dossier_id = v_dossier.id
     AND i.status = 'committed'
     AND (
       EXISTS (
         SELECT 1 FROM public.coach_import_subject_sources s
          WHERE s.user_id = v_uid AND s.file_sha256 = i.file_sha256
       )
       OR EXISTS (
         SELECT 1 FROM public.coach_imports o
          WHERE o.subject_user_id = v_uid
            AND o.status = 'committed'
            AND o.file_sha256 = i.file_sha256
       )
     );
  SELECT coalesce(jsonb_agg(DISTINCT (w.performed_at AT TIME ZONE 'UTC')::date), '[]'::jsonb)
    INTO v_session_dates
    FROM public.coach_provisional_workouts w
   WHERE w.dossier_id = v_dossier.id
     AND EXISTS (
       SELECT 1 FROM public.workouts wo
        WHERE wo.user_id = v_uid
          AND (wo.date AT TIME ZONE 'UTC')::date = (w.performed_at AT TIME ZONE 'UTC')::date
     );
  RETURN jsonb_build_object(
    'ok', true,
    'already_attached', false,
    'dossier_id', v_dossier.id,
    'display_name', v_dossier.display_name,
    'coach_name', coalesce(v_coach_name, ''),
    'workout_count', jsonb_array_length(v_sessions),
    'weight_count', jsonb_array_length(v_weights),
    'sessions', v_sessions,
    'weight_dates', v_weight_dates,
    'weights', v_weights,
    'revision', public.provisional_content_revision(v_dossier.id),
    'collisions', jsonb_build_object(
      'files', v_files,
      'session_dates', coalesce(v_session_dates, '[]'::jsonb),
      'weight_dates', coalesce((
        SELECT jsonb_agg(w.measured_at ORDER BY w.measured_at)
        FROM public.coach_provisional_weights w
        WHERE w.dossier_id = v_dossier.id
          AND EXISTS (
            SELECT 1 FROM public.weight_measurements m
             WHERE m.user_id = v_uid AND m.measured_at = w.measured_at
          )
      ), '[]'::jsonb)
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.confirm_provisional_claim(text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.confirm_provisional_claim(
  p_token text,
  p_accept_data boolean,
  p_accept_coaching boolean,
  p_revision text,
  p_acknowledge_collisions boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_invite public.coach_provisional_invites;
  v_dossier public.coach_provisional_dossiers;
  v_coach uuid;
  v_email text;
  v_claim public.coach_provisional_claims;
  v_src public.coach_provisional_workouts;
  v_ex public.coach_provisional_exercises;
  v_wid uuid;
  v_eid uuid;
  v_weight public.coach_provisional_weights;
  v_weight_id uuid;
  v_workouts integer := 0;
  v_weights integer := 0;
  v_skipped integer := 0;
  v_coaching text := 'not_requested';
  v_claim_id uuid;
  v_revision text;
  v_collision boolean;
  v_import public.coach_imports;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_token IS NULL OR char_length(btrim(p_token)) < 32 THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  IF coalesce(p_accept_data, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  v_hash := public.coach_import_sha256(btrim(p_token));
  SELECT * INTO v_invite FROM public.coach_provisional_invites WHERE token_hash = v_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  SELECT coach_id INTO v_coach
    FROM public.coach_provisional_dossiers
   WHERE id = v_invite.dossier_id;
  IF v_coach IS NULL THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  PERFORM public.lock_coach_relationship_lifecycle(v_coach);
  PERFORM public.lock_coach_import_provisional(v_invite.dossier_id);
  PERFORM public.lock_coach_import_subject(v_uid);
  SELECT * INTO v_dossier
    FROM public.coach_provisional_dossiers
   WHERE id = v_invite.dossier_id
   FOR UPDATE;
  SELECT * INTO v_invite FROM public.coach_provisional_invites WHERE id = v_invite.id FOR UPDATE;
  IF v_dossier.status = 'attached' THEN
    IF v_dossier.attached_user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'invite_consumed';
    END IF;
    SELECT * INTO v_claim FROM public.coach_provisional_claims WHERE dossier_id = v_dossier.id;
    RETURN public.provisional_claim_summary(v_claim);
  END IF;
  IF v_invite.status = 'revoked' OR v_dossier.status = 'revoked' THEN
    RAISE EXCEPTION 'invite_revoked';
  END IF;
  IF v_invite.status = 'expired' OR v_invite.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_consumed';
  END IF;
  v_email := public.provisional_caller_email();
  IF v_email IS NULL OR v_email IS DISTINCT FROM v_invite.email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;
  v_revision := public.provisional_content_revision(v_dossier.id);
  IF p_revision IS NULL OR p_revision IS DISTINCT FROM v_revision THEN
    RAISE EXCEPTION 'content_changed';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.coach_imports i
     WHERE i.provisional_dossier_id = v_dossier.id
       AND i.status = 'committed'
       AND (
         EXISTS (
           SELECT 1 FROM public.coach_import_subject_sources s
            WHERE s.user_id = v_uid AND s.file_sha256 = i.file_sha256
         )
         OR EXISTS (
           SELECT 1 FROM public.coach_imports o
            WHERE o.subject_user_id = v_uid AND o.status = 'committed' AND o.file_sha256 = i.file_sha256
         )
       )
  ) OR EXISTS (
    SELECT 1 FROM public.coach_provisional_workouts w
     WHERE w.dossier_id = v_dossier.id
       AND EXISTS (
         SELECT 1 FROM public.workouts wo
          WHERE wo.user_id = v_uid
            AND (wo.date AT TIME ZONE 'UTC')::date = (w.performed_at AT TIME ZONE 'UTC')::date
       )
  ) OR EXISTS (
    SELECT 1 FROM public.coach_provisional_weights w
     WHERE w.dossier_id = v_dossier.id
       AND EXISTS (
         SELECT 1 FROM public.weight_measurements m
          WHERE m.user_id = v_uid AND m.measured_at = w.measured_at
       )
  ) INTO v_collision;
  IF v_collision AND coalesce(p_acknowledge_collisions, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'collision_unacknowledged';
  END IF;

  v_claim_id := gen_random_uuid();
  INSERT INTO public.coach_provisional_claims (
    id, dossier_id, coach_ref, user_id, invite_id, email,
    workout_count, weight_count, skipped_weight_count, coaching_status
  ) VALUES (
    v_claim_id, v_dossier.id, 'user:' || v_dossier.coach_id::text, v_uid, v_invite.id, v_email,
    0, 0, 0, 'not_requested'
  );

  FOR v_import IN
    SELECT * FROM public.coach_imports
     WHERE provisional_dossier_id = v_dossier.id AND status = 'committed'
  LOOP
    INSERT INTO public.coach_import_claim_sources (
      claim_id, coach_ref, dossier_id, import_id, file_sha256, mapping_hash, kind, row_lineage
    ) VALUES (
      v_claim_id,
      'user:' || v_dossier.coach_id::text,
      v_dossier.id,
      v_import.id,
      v_import.file_sha256,
      v_import.mapping_hash,
      v_import.kind,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object('row_no', r.row_no, 'status', r.status) ORDER BY r.row_no)
        FROM public.coach_import_rows r WHERE r.import_id = v_import.id
      ), '[]'::jsonb)
    );
    INSERT INTO public.coach_import_subject_sources (user_id, file_sha256, kind, import_id)
    VALUES (v_uid, v_import.file_sha256, v_import.kind, v_import.id)
    ON CONFLICT (user_id, file_sha256) DO NOTHING;
  END LOOP;

  FOR v_src IN
    SELECT * FROM public.coach_provisional_workouts
     WHERE dossier_id = v_dossier.id
     ORDER BY performed_at, id
     FOR UPDATE
  LOOP
    INSERT INTO public.workouts (user_id, name, date, completed, notes)
    VALUES (v_uid, v_src.name, v_src.performed_at, true, '')
    RETURNING id INTO v_wid;
    FOR v_ex IN
      SELECT * FROM public.coach_provisional_exercises
       WHERE workout_id = v_src.id
       ORDER BY order_index, id
    LOOP
      INSERT INTO public.workout_exercises (workout_id, name, order_index, notes)
      VALUES (v_wid, v_ex.name, v_ex.order_index, v_ex.notes)
      RETURNING id INTO v_eid;
      INSERT INTO public.workout_sets (
        exercise_id, set_type, weight_kg, reps, rir, completed, order_index
      )
      SELECT v_eid, s.set_type, s.weight_kg, s.reps, s.rir, s.completed, s.order_index
        FROM public.coach_provisional_sets s
       WHERE s.exercise_id = v_ex.id
       ORDER BY s.order_index;
    END LOOP;
    INSERT INTO public.coach_provisional_claim_workouts (
      claim_id, provisional_workout_id, workout_id, source_name, source_performed_at
    ) VALUES (v_claim_id, v_src.id, v_wid, v_src.name, v_src.performed_at);
    v_workouts := v_workouts + 1;
  END LOOP;

  FOR v_weight IN
    SELECT * FROM public.coach_provisional_weights
     WHERE dossier_id = v_dossier.id
     ORDER BY measured_at
     FOR UPDATE
  LOOP
    BEGIN
      INSERT INTO public.weight_measurements (user_id, weight_kg, measured_at, notes)
      VALUES (v_uid, v_weight.weight_kg, v_weight.measured_at, coalesce(v_weight.notes, ''))
      RETURNING id INTO v_weight_id;
      INSERT INTO public.coach_provisional_claim_weights (
        claim_id, provisional_weight_id, weight_id, measured_at, applied
      ) VALUES (v_claim_id, v_weight.id, v_weight_id, v_weight.measured_at, true);
      v_weights := v_weights + 1;
    EXCEPTION
      WHEN unique_violation THEN
        INSERT INTO public.coach_provisional_claim_weights (
          claim_id, provisional_weight_id, weight_id, measured_at, applied
        ) VALUES (v_claim_id, v_weight.id, NULL, v_weight.measured_at, false);
        v_skipped := v_skipped + 1;
    END;
  END LOOP;

  IF coalesce(p_accept_coaching, false) THEN
    BEGIN
      PERFORM public.activate_coaching_relationship(v_dossier.coach_id, v_uid);
      v_coaching := 'active';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM IN ('already_coached', 'coach_unavailable', 'invalid_target') THEN
          v_coaching := SQLERRM;
        ELSE
          RAISE;
        END IF;
    END;
  END IF;

  UPDATE public.coach_provisional_claims
     SET workout_count = v_workouts,
         weight_count = v_weights,
         skipped_weight_count = v_skipped,
         coaching_status = v_coaching
   WHERE id = v_claim_id
   RETURNING * INTO v_claim;
  UPDATE public.coach_provisional_invites
     SET status = 'consumed', consumed_by = v_uid, consumed_at = clock_timestamp()
   WHERE id = v_invite.id;
  UPDATE public.coach_provisional_dossiers
     SET status = 'attached',
         attached_user_id = v_uid,
         attached_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = v_dossier.id;
  RETURN public.provisional_claim_summary(v_claim);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_provisional_claim(text, boolean, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_provisional_claim(text, boolean, boolean, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_provisional_claim(text, boolean, boolean, text, boolean) IS
  'Lock order: coach lifecycle 20014501, dossier 20014507, athlete 20014506, then revalidation. Copies only the previewed revision. activate_coaching_relationship re-takes 20014501.';

DROP FUNCTION IF EXISTS public.list_provisional_dossiers();
CREATE FUNCTION public.list_provisional_dossiers(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_capabilities c
    WHERE c.user_id = v_uid AND c.capability = 'coach'
  ) THEN
    RAISE EXCEPTION 'coach_capability_required';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(q) ORDER BY q.created_at DESC, q.id DESC)
    FROM (
      SELECT
        d.id,
        d.display_name,
        d.status,
        d.created_at,
        d.attached_at,
        (SELECT count(*) FROM public.coach_provisional_workouts w WHERE w.dossier_id = d.id) AS workout_count,
        (SELECT count(*) FROM public.coach_provisional_weights w WHERE w.dossier_id = d.id) AS weight_count,
        (
          SELECT i.email FROM public.coach_provisional_invites i
          WHERE i.dossier_id = d.id AND i.status = 'pending'
          LIMIT 1
        ) AS invite_email,
        (
          SELECT i.expires_at FROM public.coach_provisional_invites i
          WHERE i.dossier_id = d.id AND i.status = 'pending'
          LIMIT 1
        ) AS invite_expires_at
      FROM public.coach_provisional_dossiers d
      WHERE d.coach_id = v_uid
        AND (
          p_before IS NULL
          OR d.created_at < p_before
          OR (d.created_at = p_before AND p_before_id IS NOT NULL AND d.id < p_before_id)
        )
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT least(greatest(coalesce(p_limit, 100), 1), 100)
    ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_provisional_dossiers(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_provisional_dossiers(timestamptz, uuid, integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_coach_imports();
CREATE FUNCTION public.list_coach_imports(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.coach_import_expire_previews(auth.uid());
  RETURN coalesce((
    SELECT jsonb_agg(public.coach_import_view(i, 0, 0, false) ORDER BY i.created_at DESC, i.id DESC)
    FROM (
      SELECT * FROM public.coach_imports i
      WHERE i.coach_id = auth.uid()
        AND (
          i.status = 'previewed'
          OR (
            i.status = 'committed'
            AND (
              i.subject_user_id = auth.uid()
              OR public.is_coach_of(i.subject_user_id)
              OR i.provisional_dossier_id IS NOT NULL
            )
          )
        )
        AND (
          p_before IS NULL
          OR i.created_at < p_before
          OR (i.created_at = p_before AND p_before_id IS NOT NULL AND i.id < p_before_id)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
    ) i
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_coach_imports(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_coach_imports(timestamptz, uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Operator console: recheck, exact proof, versions, holds, service revoke
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_recheck_operator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recheck_operator() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_proof_access_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_operator()
    AND coalesce(p_name, '') <> ''
    AND EXISTS (
      SELECT 1 FROM public.platform_admin_audit a
      WHERE a.actor_id = auth.uid()
        AND a.action = 'open_qualification_proof'
        AND a.object_name = p_name
        AND a.created_at > clock_timestamp() - interval '10 minutes'
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_platform_operator(p_user uuid, p_confirm boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := coalesce(nullif(auth.role(), ''), current_user);
  v_actor text;
  v_active integer;
  v_target integer;
BEGIN
  IF coalesce(p_confirm, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  IF v_role IS DISTINCT FROM 'service_role' AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  PERFORM public.lock_platform_operators();
  IF v_role IS DISTINCT FROM 'service_role' AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  v_actor := public.marketplace_audit_actor();
  SELECT count(*) FILTER (WHERE revoked_at IS NULL),
         count(*) FILTER (WHERE user_id = p_user AND revoked_at IS NULL)
    INTO v_active, v_target
  FROM public.platform_operators;
  IF v_target = 1 AND v_active <= 1 THEN
    RAISE EXCEPTION 'last_operator';
  END IF;
  UPDATE public.platform_operators
    SET revoked_at = clock_timestamp()
  WHERE user_id = p_user
    AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  PERFORM public.admin_audit(v_actor, 'revoke_operator', 'operator', p_user, '');
  RETURN jsonb_build_object('status', 'revoked', 'user_id', p_user);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_coach_qualification(
  p_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS public.coach_qualifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result public.coach_qualifications;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_actor text := public.marketplace_audit_actor();
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role'
     AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_decision NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_decision = 'rejected' AND v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  SELECT * INTO v_result
  FROM public.coach_qualifications
  WHERE id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.admin_recheck_operator();
  IF v_result.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'qualification_locked';
  END IF;
  UPDATE public.coach_qualifications SET
    verification_status = p_decision,
    verified_at = CASE WHEN p_decision = 'verified' THEN clock_timestamp() ELSE NULL END,
    reviewer_id = auth.uid(),
    reviewer_ref = v_actor,
    review_note = v_note,
    updated_at = clock_timestamp()
  WHERE id = p_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_marketplace_report(
  p_report uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS public.marketplace_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.marketplace_reports;
  v_note text := coalesce(p_note, '');
  v_actor text := public.marketplace_audit_actor();
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role'
     AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO v_row FROM public.marketplace_reports WHERE id = p_report;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.lock_marketplace_directory_hold(v_row.target_user_id);
  SELECT * INTO v_row FROM public.marketplace_reports WHERE id = p_report FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.admin_recheck_operator();
  IF p_action = 'acknowledge' THEN
    IF v_row.status <> 'open' THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.status := 'in_review';
  ELSIF p_action = 'dismiss' THEN
    IF v_row.status NOT IN ('open', 'in_review') THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.status := 'dismissed';
  ELSIF p_action = 'resolve' THEN
    IF v_row.status NOT IN ('open', 'in_review') THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.status := 'resolved';
  ELSIF p_action = 'suspend_directory' THEN
    IF v_row.status IN ('resolved', 'dismissed') THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.directory_hold_active := true;
    IF v_row.status = 'open' THEN v_row.status := 'in_review'; END IF;
  ELSIF p_action = 'restore_directory' THEN
    v_row.directory_hold_active := false;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;
  UPDATE public.marketplace_reports
    SET status = v_row.status,
        directory_hold_active = v_row.directory_hold_active,
        updated_at = clock_timestamp()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  INSERT INTO public.marketplace_moderation_actions (report_id, action, note, actor)
    VALUES (v_row.id, p_action, v_note, v_actor);
  PERFORM public.marketplace_refresh_directory_suspended(v_row.target_user_id);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_audit_object(
  p_actor text,
  p_action text,
  p_subject_type text,
  p_subject uuid,
  p_note text,
  p_object text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.platform_admin_audit (actor_id, actor_ref, action, subject_type, subject_id, note, object_name)
  VALUES (auth.uid(), p_actor, p_action, p_subject_type, p_subject, left(coalesce(p_note, ''), 500), p_object);
$$;

REVOKE ALL ON FUNCTION public.admin_audit_object(text, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_open_qualification_proof(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_path text;
  v_mime text := '';
  v_size bigint := 0;
BEGIN
  v_actor := public.admin_require(true);
  SELECT q.proof_path INTO v_path
  FROM public.coach_qualifications q
  WHERE q.id = p_id
    AND q.verification_status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  PERFORM public.admin_recheck_operator();
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'proof_missing';
  END IF;
  SELECT coalesce(o.metadata->>'mimetype', ''),
         coalesce((o.metadata->>'size')::bigint, 0)
    INTO v_mime, v_size
  FROM storage.objects o
  WHERE o.bucket_id = 'qualification-proofs'
    AND o.name = v_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proof_missing';
  END IF;
  PERFORM public.admin_audit_object(v_actor, 'open_qualification_proof', 'qualification', p_id, v_mime, v_path);
  RETURN jsonb_build_object('proof_path', v_path, 'mime', v_mime, 'byte_size', v_size);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_pending_qualifications();
CREATE FUNCTION public.admin_list_pending_qualifications(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  qualification_type text,
  issuer text,
  declared_at timestamptz,
  expires_on date,
  proof_present boolean,
  coach_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT q.id, q.title, q.qualification_type, q.issuer, q.declared_at, q.expires_on,
         (q.proof_path IS NOT NULL),
         coalesce(left(p.full_name, 80), '')
  FROM public.coach_qualifications q
  LEFT JOIN public.user_profiles p ON p.id = q.coach_id
  WHERE q.verification_status = 'pending'
    AND (
      p_before IS NULL
      OR (q.declared_at, q.id) > (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  ORDER BY q.declared_at, q.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_exercise_proposals();
CREATE FUNCTION public.admin_list_exercise_proposals(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  muscles text,
  description text,
  suggestion_name_fr text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT r.id,
         r.name,
         coalesce(r.muscles, ''),
         left(coalesce(r.description, ''), 400),
         left(coalesce(r.ai_suggestion->>'name_fr', ''), 120),
         r.created_at,
         r.updated_at
  FROM public.exercise_requests r
  WHERE r.status IN ('pending', 'processing')
    AND (
      p_before IS NULL
      OR (r.created_at, r.id) > (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  ORDER BY r.created_at, r.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_exercise_duplicates(integer);
CREATE FUNCTION public.admin_list_exercise_duplicates(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (left_id uuid, right_id uuid, left_name text, right_name text, score real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT * FROM public.list_exercise_duplicate_candidates(p_limit, p_offset);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_match_exercise_proposal(uuid, uuid, boolean);
CREATE FUNCTION public.admin_match_exercise_proposal(
  p_id uuid,
  p_exercise uuid,
  p_confirm boolean,
  p_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_status text;
  v_updated timestamptz;
  v_name text;
  v_muscles text;
  v_target uuid;
BEGIN
  v_actor := public.admin_require(p_confirm);
  SELECT r.updated_at, r.name, coalesce(r.muscles, '')
    INTO v_updated, v_name, v_muscles
  FROM public.exercise_requests r
  WHERE r.id = p_id
    AND r.status IN ('pending', 'processing')
    AND r.result_exercise_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  PERFORM public.admin_recheck_operator();
  IF p_updated_at IS NULL OR v_updated IS DISTINCT FROM p_updated_at THEN
    RAISE EXCEPTION 'request_changed';
  END IF;
  v_target := public.exercise_canonical_id(p_exercise);
  IF v_target IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.id = v_target AND e.merged_into_id IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  UPDATE public.exercise_requests
    SET status = 'matched',
        result_exercise_id = v_target,
        updated_at = clock_timestamp()
  WHERE id = p_id
    AND status IN ('pending', 'processing')
    AND result_exercise_id IS NULL
  RETURNING status INTO v_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  PERFORM public.admin_audit(
    v_actor, 'match_exercise', 'exercise_request', p_id,
    left(jsonb_build_object('exercise_id', v_target, 'name', v_name, 'muscles', v_muscles)::text, 500)
  );
  RETURN jsonb_build_object('status', v_status, 'exercise_id', v_target, 'applied', false);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_reject_exercise_proposal(uuid, text, boolean);
CREATE FUNCTION public.admin_reject_exercise_proposal(
  p_id uuid,
  p_note text,
  p_confirm boolean,
  p_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_updated timestamptz;
  v_name text;
  v_muscles text;
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  SELECT r.updated_at, r.name, coalesce(r.muscles, '')
    INTO v_updated, v_name, v_muscles
  FROM public.exercise_requests r
  WHERE r.id = p_id
    AND r.status IN ('pending', 'processing')
    AND r.result_exercise_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  PERFORM public.admin_recheck_operator();
  IF p_updated_at IS NULL OR v_updated IS DISTINCT FROM p_updated_at THEN
    RAISE EXCEPTION 'request_changed';
  END IF;
  UPDATE public.exercise_requests
    SET status = 'rejected',
        error_message = left(v_note, 500),
        updated_at = clock_timestamp()
  WHERE id = p_id
    AND status IN ('pending', 'processing')
    AND result_exercise_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  PERFORM public.admin_audit(
    v_actor, 'reject_exercise', 'exercise_request', p_id,
    left(jsonb_build_object('note', v_note, 'name', v_name, 'muscles', v_muscles)::text, 500)
  );
  RETURN jsonb_build_object('status', 'rejected', 'applied', false);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_approve_exercise_proposal(uuid, text, text, text, text, boolean);
CREATE FUNCTION public.admin_approve_exercise_proposal(
  p_id uuid,
  p_name text,
  p_name_fr text,
  p_category text,
  p_equipment text,
  p_confirm boolean,
  p_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_name text := btrim(coalesce(p_name, ''));
  v_fr text := btrim(coalesce(p_name_fr, ''));
  v_norm text;
  v_fr_norm text;
  v_id uuid;
  v_muscles text;
  v_updated timestamptz;
  v_request_name text;
  v_muscle_list text[];
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF p_category NOT IN ('compound', 'isolation', 'cardio', 'stretch', 'plyometric')
     OR p_equipment NOT IN ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other') THEN
    RAISE EXCEPTION 'invalid_exercise';
  END IF;
  v_norm := public.exercise_normalize_name(v_name);
  IF v_norm IS NULL OR length(v_norm) < 2 THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  SELECT r.muscles, r.updated_at, r.name
    INTO v_muscles, v_updated, v_request_name
  FROM public.exercise_requests r
  WHERE r.id = p_id
    AND r.status IN ('pending', 'processing')
    AND r.result_exercise_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  PERFORM public.admin_recheck_operator();
  IF p_updated_at IS NULL OR v_updated IS DISTINCT FROM p_updated_at THEN
    RAISE EXCEPTION 'request_changed';
  END IF;
  IF public.exercise_catalog_key_count(v_norm) > 0 THEN
    RAISE EXCEPTION 'already_in_catalog';
  END IF;
  v_fr_norm := public.exercise_normalize_name(v_fr);
  IF v_fr_norm IS NOT NULL AND v_fr_norm IS DISTINCT FROM v_norm
     AND public.exercise_catalog_key_count(v_fr_norm) > 0 THEN
    RAISE EXCEPTION 'name_taken';
  END IF;
  SELECT coalesce(array_agg(left(btrim(part), 80)), '{}'::text[])
    INTO v_muscle_list
    FROM unnest(string_to_array(coalesce(v_muscles, ''), ',')) AS part
   WHERE btrim(part) <> '';
  BEGIN
    INSERT INTO public.exercises (
      name, name_fr, primary_muscles, category, equipment, verified, created_by
    ) VALUES (
      v_name,
      v_fr,
      coalesce(v_muscle_list, '{}'::text[]),
      p_category,
      p_equipment,
      true,
      NULL
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'name_taken';
  END;
  INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
  VALUES (v_id, v_name, 'und', v_norm, 'proposal');
  IF v_fr_norm IS NOT NULL AND v_fr_norm IS DISTINCT FROM v_norm THEN
    INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
    VALUES (v_id, v_fr, 'fr', v_fr_norm, 'proposal');
  END IF;
  UPDATE public.exercise_requests
    SET status = 'approved',
        result_exercise_id = v_id,
        updated_at = clock_timestamp()
  WHERE id = p_id;
  PERFORM public.admin_audit(
    v_actor, 'approve_exercise', 'exercise_request', p_id,
    left(jsonb_build_object(
      'exercise_id', v_id,
      'name', v_name,
      'name_fr', v_fr,
      'muscles', v_muscles,
      'request_name', v_request_name,
      'category', p_category,
      'equipment', p_equipment
    )::text, 500)
  );
  RETURN jsonb_build_object('status', 'approved', 'exercise_id', v_id, 'applied', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_merge_exercises(
  p_winner uuid,
  p_loser uuid,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_result jsonb;
BEGIN
  v_actor := public.admin_require(p_confirm);
  PERFORM public.admin_recheck_operator();
  v_result := public.merge_exercises(p_winner, p_loser, true);
  PERFORM public.admin_recheck_operator();
  PERFORM public.admin_audit(v_actor, 'merge_exercises', 'exercise', p_loser, p_winner::text);
  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_problem_imports();
CREATE FUNCTION public.admin_list_problem_imports(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  kind text,
  status text,
  created_at timestamptz,
  row_count integer,
  error_count integer,
  ready_count integer,
  ignored_count integer,
  subject_kind text,
  coach_label text,
  error_codes text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT i.id, i.kind, i.status, i.created_at, i.row_count, i.error_count,
         i.ready_count, i.ignored_count,
         CASE WHEN i.provisional_dossier_id IS NULL THEN 'account' ELSE 'provisional' END,
         coalesce(left(p.full_name, 80), ''),
         coalesce((
           SELECT array_agg(DISTINCT r.error_code)
           FROM public.coach_import_rows r
           WHERE r.import_id = i.id
             AND r.error_code IS NOT NULL
         ), ARRAY[]::text[])
  FROM public.coach_imports i
  LEFT JOIN public.user_profiles p ON p.id = i.coach_id
  WHERE (i.status = 'failed' OR i.error_count > 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.platform_admin_audit a
      WHERE a.action = 'acknowledge_import'
        AND a.subject_id = i.id
        AND a.note LIKE public.coach_import_problem_fingerprint(i.id) || E'\n%'
    )
    AND (
      p_before IS NULL
      OR i.created_at < p_before
      OR (i.created_at = p_before AND p_before_id IS NOT NULL AND i.id < p_before_id)
    )
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_acknowledge_problem_import(
  p_id uuid,
  p_note text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_fp text;
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  SELECT i.status INTO v_status
  FROM public.coach_imports i
  WHERE i.id = p_id
    AND (i.status = 'failed' OR i.error_count > 0)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  PERFORM public.admin_recheck_operator();
  v_fp := public.coach_import_problem_fingerprint(p_id);
  PERFORM public.admin_audit(v_actor, 'acknowledge_import', 'import', p_id, v_fp || E'\n' || v_note);
  RETURN jsonb_build_object('status', 'acknowledged', 'import_status', v_status, 'fingerprint', v_fp);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_open_reports();
CREATE FUNCTION public.admin_list_open_reports(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  status text,
  subject_type text,
  category text,
  context text,
  directory_hold_active boolean,
  created_at timestamptz,
  target_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT r.id, r.status, r.subject_type, r.category, left(r.context, 500),
         r.directory_hold_active, r.created_at,
         coalesce(left(p.full_name, 80), '')
  FROM public.marketplace_reports r
  LEFT JOIN public.user_profiles p ON p.id = r.target_user_id
  WHERE r.status IN ('open', 'in_review')
    AND (
      p_before IS NULL
      OR (r.created_at, r.id) > (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  ORDER BY r.created_at, r.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_directory_holds(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  status text,
  subject_type text,
  category text,
  context text,
  directory_hold_active boolean,
  created_at timestamptz,
  target_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT r.id, r.status, r.subject_type, r.category, left(r.context, 500),
         r.directory_hold_active, r.created_at,
         coalesce(left(p.full_name, 80), '')
  FROM public.marketplace_reports r
  LEFT JOIN public.user_profiles p ON p.id = r.target_user_id
  WHERE r.directory_hold_active = true
    AND (
      p_before IS NULL
      OR (r.created_at, r.id) > (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  ORDER BY r.created_at, r.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_marketplace_report(
  p_report uuid,
  p_action text,
  p_note text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.marketplace_reports;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
BEGIN
  v_actor := public.admin_require(p_confirm);
  PERFORM public.admin_recheck_operator();
  IF p_action NOT IN ('acknowledge', 'dismiss', 'resolve', 'suspend_directory', 'restore_directory') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF p_action <> 'acknowledge' AND v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  v_row := public.review_marketplace_report(p_report, p_action, coalesce(v_note, ''));
  PERFORM public.admin_recheck_operator();
  PERFORM public.admin_audit(v_actor, 'review_report', 'report', p_report, p_action);
  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'directory_hold_active', v_row.directory_hold_active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_qualification(
  p_id uuid,
  p_decision text,
  p_note text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.coach_qualifications;
BEGIN
  v_actor := public.admin_require(p_confirm);
  PERFORM public.admin_recheck_operator();
  v_row := public.review_coach_qualification(p_id, p_decision, p_note);
  PERFORM public.admin_audit(v_actor, 'review_qualification', 'qualification', p_id, p_decision);
  RETURN jsonb_build_object('id', v_row.id, 'verification_status', v_row.verification_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dismiss_exercise_duplicate(
  p_left uuid,
  p_right uuid,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_left uuid;
  v_right uuid;
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF p_left IS NULL OR p_right IS NULL OR p_left = p_right THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF p_left < p_right THEN
    v_left := p_left;
    v_right := p_right;
  ELSE
    v_left := p_right;
    v_right := p_left;
  END IF;
  PERFORM public.admin_recheck_operator();
  INSERT INTO public.exercise_duplicate_dismissals (left_id, right_id, dismissed_by)
  VALUES (v_left, v_right, auth.uid())
  ON CONFLICT (left_id, right_id) DO NOTHING;
  PERFORM public.admin_audit(v_actor, 'dismiss_duplicate', 'exercise', v_left, v_right::text);
  RETURN jsonb_build_object('status', 'dismissed', 'left_id', v_left, 'right_id', v_right);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_pending_qualifications(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_qualifications(timestamptz, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_exercise_proposals(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_exercise_proposals(timestamptz, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_exercise_duplicates(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_exercise_duplicates(integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_match_exercise_proposal(uuid, uuid, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_exercise_proposal(uuid, uuid, boolean, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_reject_exercise_proposal(uuid, text, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_exercise_proposal(uuid, text, boolean, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_approve_exercise_proposal(uuid, text, text, text, text, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_exercise_proposal(uuid, text, text, text, text, boolean, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_problem_imports(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_problem_imports(timestamptz, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_open_reports(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_open_reports(timestamptz, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_directory_holds(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_directory_holds(timestamptz, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_dismiss_exercise_duplicate(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dismiss_exercise_duplicate(uuid, uuid, boolean) TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'provisional-retention') THEN
    PERFORM cron.unschedule('provisional-retention');
  END IF;
  v_jobid := cron.schedule(
    'provisional-retention',
    '25 3 * * *',
    'SELECT public.provisional_purge_abandoned()'
  );
  IF v_jobid IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM cron.job
       WHERE jobid = v_jobid
         AND jobname = 'provisional-retention'
         AND schedule = '25 3 * * *'
         AND command = 'SELECT public.provisional_purge_abandoned()'
     )
  THEN
    RAISE EXCEPTION 'provisional-retention schedule mismatch';
  END IF;
END $$;

-- Patched preview, commit, and CSV parser.
CREATE OR REPLACE FUNCTION public.preview_coach_import(
  p_subject_user_id uuid,
  p_filename text,
  p_source_text text,
  p_mapping jsonb,
  p_idempotency_key text,
  p_provisional_dossier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_dossier uuid;
  v_mapping jsonb;
  v_hash text;
  v_map_hash text;
  v_existing public.coach_imports;
  v_import public.coach_imports;
  v_parsed record;
  v_headers text[];
  v_plan jsonb;
  v_ready integer := 0;
  v_error integer := 0;
  v_ignored integer := 0;
  v_rows integer := 0;
  v_found uuid;
  v_new_id uuid;
  v_have boolean := false;
  v_self uuid := NULL;
  v_dup_hash text;
  v_key text := btrim(p_idempotency_key);
BEGIN
  IF p_provisional_dossier_id IS NOT NULL AND p_subject_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_subject';
  END IF;
  IF p_provisional_dossier_id IS NOT NULL THEN
    v_uid := public.coach_import_assert_dossier(p_provisional_dossier_id);
    v_dossier := p_provisional_dossier_id;
  ELSE
    v_uid := public.coach_import_assert_actor(p_subject_user_id);
    v_dossier := NULL;
  END IF;
  IF p_filename IS NULL OR char_length(btrim(p_filename)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_filename';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(v_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  v_mapping := public.coach_import_normalized_mapping(p_mapping);
  v_hash := public.coach_import_sha256(p_source_text);
  v_map_hash := public.coach_import_sha256(v_mapping::text);
  PERFORM public.coach_import_expire_previews(v_uid);

  SELECT id INTO v_found
  FROM public.coach_imports
  WHERE coach_id = v_uid AND idempotency_key = v_key;
  IF FOUND THEN
    PERFORM public.lock_coach_import(v_found);
    SELECT * INTO v_existing FROM public.coach_imports WHERE id = v_found FOR UPDATE;
    IF NOT FOUND THEN
      v_found := NULL;
    ELSIF v_existing.subject_user_id IS DISTINCT FROM p_subject_user_id
       OR v_existing.provisional_dossier_id IS DISTINCT FROM v_dossier THEN
      RAISE EXCEPTION 'import_conflict';
    ELSIF v_existing.status = 'committed' THEN
      IF v_existing.file_sha256 = v_hash AND v_existing.mapping_hash = v_map_hash THEN
        RETURN public.coach_import_view(v_existing);
      END IF;
      RAISE EXCEPTION 'import_conflict';
    ELSIF v_existing.status = 'previewed' AND v_existing.file_sha256 IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'file_changed';
    ELSE
      DELETE FROM public.coach_import_rows WHERE import_id = v_existing.id;
      v_import := v_existing;
      v_have := true;
    END IF;
  END IF;

  IF v_have THEN
    v_self := v_import.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_imports committed
    WHERE committed.file_sha256 = v_hash
      AND committed.status = 'committed'
      AND committed.id IS DISTINCT FROM v_self
      AND (
        (v_dossier IS NULL AND committed.subject_user_id = p_subject_user_id)
        OR (v_dossier IS NOT NULL AND committed.provisional_dossier_id = v_dossier)
      )
      AND NOT (
        committed.coach_id = v_uid
        AND committed.mapping_hash = v_map_hash
      )
  ) THEN
    RAISE EXCEPTION 'already_imported';
  END IF;

  IF NOT v_have THEN
    SELECT id INTO v_found
    FROM public.coach_imports
    WHERE coach_id = v_uid
      AND file_sha256 = v_hash
      AND mapping_hash = v_map_hash
      AND status IN ('previewed', 'committed')
      AND (
        (v_dossier IS NULL AND subject_user_id = p_subject_user_id)
        OR (v_dossier IS NOT NULL AND provisional_dossier_id = v_dossier)
      );
    IF FOUND THEN
      PERFORM public.lock_coach_import(v_found);
      SELECT * INTO v_existing FROM public.coach_imports WHERE id = v_found FOR UPDATE;
      IF FOUND
         AND v_existing.subject_user_id IS NOT DISTINCT FROM p_subject_user_id
       AND v_existing.provisional_dossier_id IS NOT DISTINCT FROM v_dossier
         AND v_existing.file_sha256 = v_hash
         AND v_existing.mapping_hash = v_map_hash
         AND v_existing.status IN ('previewed', 'committed') THEN
        RETURN public.coach_import_view(v_existing);
      END IF;
    END IF;
    PERFORM public.lock_coach_import_quota(v_uid);
    IF public.coach_import_actionable_preview_count(v_uid, NULL) >= 20 THEN
      RAISE EXCEPTION 'preview_quota';
    END IF;
    v_new_id := gen_random_uuid();
    PERFORM public.lock_coach_import(v_new_id);
    INSERT INTO public.coach_imports (
      id, coach_id, coach_ref, subject_user_id, provisional_dossier_id, status, kind, filename, file_sha256,
      mapping, mapping_hash, idempotency_key, source_headers
    ) VALUES (
      v_new_id, v_uid, 'user:' || v_uid::text, p_subject_user_id, v_dossier, 'previewed', v_mapping->>'kind',
      btrim(p_filename), v_hash, v_mapping, v_map_hash, v_key, '[]'::jsonb
    )
    RETURNING * INTO v_import;
  END IF;

  FOR v_parsed IN
    SELECT * FROM public.coach_import_parse_csv(p_source_text, v_mapping->>'delimiter')
  LOOP
    IF v_parsed.row_no = 1 THEN
      v_headers := v_parsed.cells;
      PERFORM public.coach_import_assert_headers(v_headers, v_mapping);
      CONTINUE;
    END IF;
    v_rows := v_rows + 1;
    v_plan := public.coach_import_plan_row(v_mapping->>'kind', v_mapping, v_headers, v_parsed.cells);
    INSERT INTO public.coach_import_rows (import_id, row_no, raw, status, error_code, planned)
    VALUES (
      v_import.id,
      v_parsed.row_no - 1,
      to_jsonb(v_parsed.cells),
      v_plan->>'status',
      v_plan->>'error_code',
      v_plan
    );
    IF v_plan->>'status' = 'ready' THEN v_ready := v_ready + 1;
    ELSIF v_plan->>'status' = 'ignored' THEN v_ignored := v_ignored + 1;
    ELSE v_error := v_error + 1;
    END IF;
  END LOOP;

  WITH ranked AS (
    SELECT r.id,
           row_number() OVER (
             PARTITION BY r.planned->>'date', coalesce(r.planned->>'session_name', ''), r.planned->>'exercise'
             ORDER BY r.row_no
           ) AS n
    FROM public.coach_import_rows r
    WHERE r.import_id = v_import.id
      AND r.status = 'ready'
      AND coalesce((r.planned->>'derive_set')::boolean, false)
  )
  UPDATE public.coach_import_rows r
     SET planned = jsonb_set(r.planned, '{set_index}', to_jsonb(ranked.n), true)
    FROM ranked
   WHERE r.id = ranked.id;

  IF v_import.status IS DISTINCT FROM 'previewed' THEN
    PERFORM public.lock_coach_import_quota(v_uid);
    IF public.coach_import_actionable_preview_count(v_uid, v_import.id) >= 20 THEN
      RAISE EXCEPTION 'preview_quota';
    END IF;
  END IF;
  PERFORM public.coach_import_stamp_set_orders(v_import.id);

  v_import.kind := v_mapping->>'kind';
  v_dup_hash := public.coach_import_duplicate_hash(v_import);
  UPDATE public.coach_imports
     SET mapping = v_mapping,
         mapping_hash = v_map_hash,
         file_sha256 = v_hash,
         filename = btrim(p_filename),
         kind = v_mapping->>'kind',
         source_headers = to_jsonb(coalesce(v_headers, ARRAY[]::text[])),
         status = 'previewed',
         created_at = CASE
           WHEN v_import.status IN ('cancelled', 'failed') THEN clock_timestamp()
           ELSE created_at
         END,
         row_count = v_rows,
         ready_count = v_ready,
         ignored_count = v_ignored,
         error_count = v_error,
         duplicate_set_hash = v_dup_hash
   WHERE id = v_import.id
   RETURNING * INTO v_import;

  RETURN public.coach_import_view(v_import);
EXCEPTION
  WHEN unique_violation THEN
    RETURN public.coach_import_finish_subject_conflict(v_uid, p_subject_user_id, v_dossier, v_key, v_hash, v_map_hash);
END;
$$;




CREATE OR REPLACE FUNCTION public.commit_coach_import(
  p_import_id uuid,
  p_file_sha256 text,
  p_mapping jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_subject uuid;
  v_dossier uuid;
  v_coach uuid;
  v_import public.coach_imports;
  v_mapping jsonb;
  v_map_hash text;
  v_row public.coach_import_rows;
  v_wid uuid;
  v_eid uuid;
  v_weight uuid;
  v_applied integer := 0;
  v_session text;
  v_date date;
  v_ex text;
  v_ex_ord integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_import_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT subject_user_id, provisional_dossier_id, coach_id INTO v_subject, v_dossier, v_coach
  FROM public.coach_imports
  WHERE id = p_import_id;
  IF NOT FOUND OR v_coach IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_dossier IS NOT NULL AND v_subject IS NOT NULL THEN
    RAISE EXCEPTION 'import_conflict';
  END IF;
  IF v_dossier IS NOT NULL THEN
    v_uid := public.coach_import_assert_dossier(v_dossier);
  ELSE
    v_uid := public.coach_import_assert_actor(v_subject);
  END IF;
  PERFORM public.lock_coach_import(p_import_id);
  SELECT * INTO v_import FROM public.coach_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND OR v_import.coach_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_import.subject_user_id IS DISTINCT FROM v_subject
     OR v_import.provisional_dossier_id IS DISTINCT FROM v_dossier THEN
    RAISE EXCEPTION 'import_conflict';
  END IF;
  IF v_import.status = 'committed' THEN
    RETURN public.coach_import_view(v_import);
  END IF;
  IF p_file_sha256 IS NULL OR btrim(p_file_sha256) = '' OR v_import.file_sha256 IS DISTINCT FROM lower(btrim(p_file_sha256)) THEN RAISE EXCEPTION 'file_changed'; END IF;
  v_mapping := public.coach_import_normalized_mapping(p_mapping);
  v_map_hash := public.coach_import_sha256(v_mapping::text);
  IF v_map_hash <> v_import.mapping_hash THEN RAISE EXCEPTION 'mapping_changed'; END IF;
  PERFORM public.coach_import_assert_headers(
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_import.source_headers)), ARRAY[]::text[]),
    v_mapping
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_import_rows
    WHERE import_id = v_import.id AND status = 'ready'
  ) THEN
    RAISE EXCEPTION 'nothing_to_import';
  END IF;
  IF v_import.provisional_dossier_id IS NULL THEN
    PERFORM public.coach_import_lock_active_link(v_uid, v_import.subject_user_id);
    PERFORM public.lock_coach_import_subject(v_import.subject_user_id);
  ELSE
    PERFORM public.lock_coach_import_provisional(v_import.provisional_dossier_id);
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_provisional_dossiers d
      WHERE d.id = v_import.provisional_dossier_id
        AND d.coach_id = v_uid
        AND d.status IN ('preparing', 'invited')
    ) THEN
      RAISE EXCEPTION 'dossier_closed';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_imports other
    WHERE other.file_sha256 = v_import.file_sha256
      AND other.status = 'committed'
      AND other.id <> v_import.id
      AND (
        (v_import.provisional_dossier_id IS NULL AND other.subject_user_id = v_import.subject_user_id)
        OR (v_import.provisional_dossier_id IS NOT NULL AND other.provisional_dossier_id = v_import.provisional_dossier_id)
      )
  ) THEN
    RAISE EXCEPTION 'already_imported';
  END IF;
  IF v_import.kind = 'workout' THEN
    IF coalesce((v_mapping->>'acknowledge_duplicates')::boolean, false) THEN
      IF public.coach_import_duplicate_hash(v_import) IS DISTINCT FROM v_import.duplicate_set_hash THEN
        RAISE EXCEPTION 'duplicates_changed';
      END IF;
    ELSIF public.coach_import_duplicate_report(v_import) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'potential_duplicate';
    END IF;
  END IF;

  PERFORM public.coach_import_stamp_set_orders(v_import.id);

  IF v_import.provisional_dossier_id IS NOT NULL THEN
    IF v_import.kind = 'body_weight' THEN
      FOR v_row IN
        SELECT * FROM public.coach_import_rows
        WHERE import_id = v_import.id AND status = 'ready'
        ORDER BY row_no
        FOR UPDATE
      LOOP
        v_date := (v_row.planned->>'date')::date;
        BEGIN
          INSERT INTO public.coach_provisional_weights (dossier_id, import_id, weight_kg, measured_at, notes)
          VALUES (
            v_import.provisional_dossier_id,
            v_import.id,
            (v_row.planned->>'body_weight_kg')::numeric,
            v_date,
            v_row.planned->>'notes'
          );
          UPDATE public.coach_import_rows
             SET status = 'applied'
           WHERE id = v_row.id;
          v_applied := v_applied + 1;
        EXCEPTION
          WHEN unique_violation THEN
            UPDATE public.coach_import_rows
               SET status = 'ignored', error_code = 'already_exists'
             WHERE id = v_row.id;
        END;
      END LOOP;
    ELSE
      FOR v_date, v_session IN
        SELECT (planned->>'date')::date, coalesce(planned->>'session_name', '')
        FROM public.coach_import_rows
        WHERE import_id = v_import.id AND status = 'ready'
        GROUP BY 1, 2
        ORDER BY min(row_no)
      LOOP
        INSERT INTO public.coach_provisional_workouts (dossier_id, import_id, name, performed_at)
        VALUES (
          v_import.provisional_dossier_id,
          v_import.id,
          CASE WHEN v_session <> '' THEN v_session ELSE to_char(v_date, 'YYYY-MM-DD') END,
          ((v_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC')
        )
        RETURNING id INTO v_wid;
        v_ex_ord := 0;
        FOR v_ex IN
          SELECT planned->>'exercise'
          FROM public.coach_import_rows
          WHERE import_id = v_import.id
            AND status = 'ready'
            AND (planned->>'date')::date = v_date
            AND coalesce(planned->>'session_name', '') = v_session
          GROUP BY planned->>'exercise'
          ORDER BY min(row_no)
        LOOP
          v_ex_ord := v_ex_ord + 1;
          INSERT INTO public.coach_provisional_exercises (workout_id, name, order_index, notes)
          VALUES (
            v_wid,
            v_ex,
            v_ex_ord,
            coalesce((
              SELECT string_agg(
                concat(coalesce(r.planned->>'set_index', r.row_no::text), ' · ', r.planned->>'notes'),
                E'\n' ORDER BY r.row_no
              )
              FROM public.coach_import_rows r
              WHERE r.import_id = v_import.id
                AND r.status = 'ready'
                AND (r.planned->>'date')::date = v_date
                AND coalesce(r.planned->>'session_name', '') = v_session
                AND r.planned->>'exercise' = v_ex
                AND coalesce(r.planned->>'notes', '') <> ''
            ), '')
          )
          RETURNING id INTO v_eid;
          INSERT INTO public.coach_provisional_sets (
            exercise_id, set_type, weight_kg, reps, rir, completed, order_index
          )
          SELECT
            v_eid,
            'working',
            (r.planned->>'load_kg')::numeric,
            (r.planned->>'reps')::int,
            (r.planned->>'rir')::int,
            true,
            coalesce((r.planned->>'applied_order')::integer, row_number() OVER (ORDER BY r.row_no))
          FROM public.coach_import_rows r
          WHERE r.import_id = v_import.id
            AND r.status = 'ready'
            AND (r.planned->>'date')::date = v_date
            AND coalesce(r.planned->>'session_name', '') = v_session
            AND r.planned->>'exercise' = v_ex
          ORDER BY r.row_no;
          UPDATE public.coach_import_rows
             SET status = 'applied', applied_provisional_workout_id = v_wid
           WHERE import_id = v_import.id
             AND status = 'ready'
             AND (planned->>'date')::date = v_date
             AND coalesce(planned->>'session_name', '') = v_session
             AND planned->>'exercise' = v_ex;
        END LOOP;
      END LOOP;
      SELECT count(*) INTO v_applied
      FROM public.coach_import_rows
      WHERE import_id = v_import.id AND status = 'applied';
    END IF;
  ELSIF v_import.kind = 'body_weight' THEN
    FOR v_row IN
      SELECT * FROM public.coach_import_rows
      WHERE import_id = v_import.id AND status = 'ready'
      ORDER BY row_no
      FOR UPDATE
    LOOP
      v_date := (v_row.planned->>'date')::date;
      BEGIN
        IF EXISTS (
          SELECT 1 FROM public.weight_measurements w
          WHERE w.user_id = v_import.subject_user_id AND w.measured_at = v_date
        ) THEN
          RAISE unique_violation;
        END IF;
        INSERT INTO public.weight_measurements (user_id, weight_kg, measured_at, notes)
        VALUES (
          v_import.subject_user_id,
          (v_row.planned->>'body_weight_kg')::numeric,
          v_date,
          v_row.planned->>'notes'
        )
        RETURNING id INTO v_weight;
        UPDATE public.coach_import_rows
           SET status = 'applied', applied_weight_id = v_weight
         WHERE id = v_row.id;
        v_applied := v_applied + 1;
      EXCEPTION
        WHEN unique_violation THEN
          UPDATE public.coach_import_rows
             SET status = 'ignored', error_code = 'already_exists'
           WHERE id = v_row.id;
      END;
    END LOOP;
  ELSE
    FOR v_date, v_session IN
      SELECT (planned->>'date')::date, coalesce(planned->>'session_name', '')
      FROM public.coach_import_rows
      WHERE import_id = v_import.id AND status = 'ready'
      GROUP BY 1, 2
      ORDER BY min(row_no)
    LOOP
      INSERT INTO public.workouts (user_id, name, date, completed, notes)
      VALUES (
        v_import.subject_user_id,
        CASE WHEN v_session <> '' THEN v_session ELSE to_char(v_date, 'YYYY-MM-DD') END,
        ((v_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC'),
        true,
        ''
      )
      RETURNING id INTO v_wid;
      v_ex_ord := 0;
      FOR v_ex IN
        SELECT planned->>'exercise'
        FROM public.coach_import_rows
        WHERE import_id = v_import.id
          AND status = 'ready'
          AND (planned->>'date')::date = v_date
          AND coalesce(planned->>'session_name', '') = v_session
        GROUP BY planned->>'exercise'
        ORDER BY min(row_no)
      LOOP
        v_ex_ord := v_ex_ord + 1;
        INSERT INTO public.workout_exercises (workout_id, name, order_index, notes)
        VALUES (
          v_wid,
          v_ex,
          v_ex_ord,
          coalesce((
            SELECT string_agg(
              concat(coalesce(r.planned->>'set_index', r.row_no::text), ' · ', r.planned->>'notes'),
              E'\n' ORDER BY r.row_no
            )
            FROM public.coach_import_rows r
            WHERE r.import_id = v_import.id
              AND r.status = 'ready'
              AND (r.planned->>'date')::date = v_date
              AND coalesce(r.planned->>'session_name', '') = v_session
              AND r.planned->>'exercise' = v_ex
              AND coalesce(r.planned->>'notes', '') <> ''
          ), '')
        )
        RETURNING id INTO v_eid;
        INSERT INTO public.workout_sets (
          exercise_id, set_type, weight_kg, reps, rir, completed, order_index
        )
        SELECT
          v_eid,
          'working',
          (r.planned->>'load_kg')::numeric,
          (r.planned->>'reps')::int,
          (r.planned->>'rir')::int,
          true,
          coalesce((r.planned->>'applied_order')::integer, row_number() OVER (ORDER BY r.row_no))
        FROM public.coach_import_rows r
        WHERE r.import_id = v_import.id
          AND r.status = 'ready'
          AND (r.planned->>'date')::date = v_date
          AND coalesce(r.planned->>'session_name', '') = v_session
          AND r.planned->>'exercise' = v_ex
        ORDER BY r.row_no;
        UPDATE public.coach_import_rows
           SET status = 'applied', applied_workout_id = v_wid
         WHERE import_id = v_import.id
           AND status = 'ready'
           AND (planned->>'date')::date = v_date
           AND coalesce(planned->>'session_name', '') = v_session
           AND planned->>'exercise' = v_ex;
      END LOOP;
    END LOOP;
    SELECT count(*) INTO v_applied
    FROM public.coach_import_rows
    WHERE import_id = v_import.id AND status = 'applied';
  END IF;

  UPDATE public.coach_imports
     SET status = 'committed',
         committed_at = clock_timestamp(),
         applied_count = v_applied,
         ignored_count = (
           SELECT count(*) FROM public.coach_import_rows
           WHERE import_id = v_import.id AND status = 'ignored'
         )
   WHERE id = v_import.id
   RETURNING * INTO v_import;

  RETURN public.coach_import_view(v_import);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'already_imported';
END;
$$;

CREATE OR REPLACE FUNCTION public.coach_import_parse_csv(p_text text, p_delimiter text)
RETURNS TABLE(row_no integer, cells text[])
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text text;
  v_delim text;
  v_row text[] := ARRAY[]::text[];
  v_cell text := '';
  v_in_quotes boolean := false;
  v_i integer := 1;
  v_ch text;
  v_row_no integer := 0;
  v_max_rows integer := 2001;
  v_max_cols integer := 32;
  v_max_cell integer := 400;
  v_bytes bytea;
  v_width integer;
  v_stored jsonb := '[]'::jsonb;
  v_item jsonb;
  v_pad text[];
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RAISE EXCEPTION 'file_empty';
  END IF;
  IF octet_length(p_text) > 524288 THEN
    RAISE EXCEPTION 'file_too_large';
  END IF;
  v_text := replace(replace(p_text, E'\r\n', E'\n'), E'\r', E'\n');
  v_bytes := convert_to(v_text, 'UTF8');
  IF octet_length(v_bytes) >= 3
     AND get_byte(v_bytes, 0) = 239
     AND get_byte(v_bytes, 1) = 187
     AND get_byte(v_bytes, 2) = 191 THEN
    v_text := convert_from(substring(v_bytes from 4), 'UTF8');
  END IF;
  v_delim := CASE p_delimiter WHEN E'\t' THEN E'\t' WHEN ';' THEN ';' ELSE ',' END;
  WHILE v_i <= char_length(v_text) LOOP
    v_ch := substr(v_text, v_i, 1);
    IF v_in_quotes THEN
      IF v_ch = '"' AND substr(v_text, v_i + 1, 1) = '"' THEN
        v_cell := v_cell || '"';
        v_i := v_i + 2;
        CONTINUE;
      ELSIF v_ch = '"' THEN
        v_in_quotes := false;
        v_i := v_i + 1;
        CONTINUE;
      ELSE
        v_cell := v_cell || v_ch;
        v_i := v_i + 1;
        CONTINUE;
      END IF;
    END IF;
    IF v_ch = '"' THEN
      v_in_quotes := true;
      v_i := v_i + 1;
      CONTINUE;
    END IF;
    IF v_ch = v_delim THEN
      v_row := v_row || btrim(v_cell);
      v_cell := '';
      v_i := v_i + 1;
      CONTINUE;
    END IF;
    IF v_ch = E'\n' THEN
      v_row := v_row || btrim(v_cell);
      v_cell := '';
      IF exists (SELECT 1 FROM unnest(v_row) c WHERE c <> '') THEN
        v_row_no := v_row_no + 1;
        IF v_row_no > v_max_rows THEN RAISE EXCEPTION 'too_many_rows'; END IF;
        IF coalesce(array_length(v_row, 1), 0) > v_max_cols THEN RAISE EXCEPTION 'too_many_columns'; END IF;
        IF exists (SELECT 1 FROM unnest(v_row) c WHERE char_length(c) > v_max_cell) THEN
          RAISE EXCEPTION 'cell_too_long';
        END IF;
        v_stored := v_stored || jsonb_build_array(to_jsonb(v_row));
      END IF;
      v_row := ARRAY[]::text[];
      v_i := v_i + 1;
      CONTINUE;
    END IF;
    v_cell := v_cell || v_ch;
    v_i := v_i + 1;
  END LOOP;
  IF v_in_quotes THEN RAISE EXCEPTION 'malformed_csv'; END IF;
  v_row := v_row || btrim(v_cell);
  IF exists (SELECT 1 FROM unnest(v_row) c WHERE c <> '') THEN
    v_row_no := v_row_no + 1;
    IF v_row_no > v_max_rows THEN RAISE EXCEPTION 'too_many_rows'; END IF;
    IF coalesce(array_length(v_row, 1), 0) > v_max_cols THEN RAISE EXCEPTION 'too_many_columns'; END IF;
    IF exists (SELECT 1 FROM unnest(v_row) c WHERE char_length(c) > v_max_cell) THEN
      RAISE EXCEPTION 'cell_too_long';
    END IF;
    v_stored := v_stored || jsonb_build_array(to_jsonb(v_row));
  END IF;
  IF v_row_no < 2 THEN RAISE EXCEPTION 'header_missing'; END IF;
  SELECT max(jsonb_array_length(item)) INTO v_width
    FROM jsonb_array_elements(v_stored) item;
  IF coalesce(v_width, 0) > v_max_cols THEN RAISE EXCEPTION 'too_many_columns'; END IF;
  v_row_no := 0;
  FOR v_item IN SELECT item FROM jsonb_array_elements(v_stored) item LOOP
    SELECT coalesce(array_agg(btrim(value) ORDER BY ord), ARRAY[]::text[])
      INTO v_pad
      FROM jsonb_array_elements_text(v_item) WITH ORDINALITY AS t(value, ord);
    WHILE coalesce(array_length(v_pad, 1), 0) < v_width LOOP
      v_pad := v_pad || '';
    END LOOP;
    v_row_no := v_row_no + 1;
    row_no := v_row_no;
    cells := v_pad;
    RETURN NEXT;
  END LOOP;
END;
$$;


COMMENT ON FUNCTION public.commit_coach_import(uuid, text, jsonb) IS
  'Applies the previewed plan. Does not reparse the CSV. Rejects a null or different file hash. Set order uses set_index only when every ready set in the group has a unique index from 1 to 100; otherwise file order. Lock order is unchanged.';

-- Chosen catalog id survives program save. Import views expose subject and time.
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
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 42 THEN RAISE EXCEPTION 'Too many days'; END IF;
  IF NOT COALESCE(p_trusted, false) THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
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
        program_day_id, name, catalog_exercise_id, default_sets, default_reps, default_reps_min, default_rir,
        default_rest_seconds, default_weight_kg, order_index,
        set_type, superset_group, drop_count, tempo, isometric_seconds,
        cluster_rest_seconds, cluster_reps_per_burst, myo_activation
      ) VALUES (
        v_day_id,
        btrim(v_ex->>'name'),
        NULLIF(v_ex->>'catalog_exercise_id', '')::uuid,
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


CREATE OR REPLACE FUNCTION public.coach_import_view(
  p_import public.coach_imports,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50,
  p_errors_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 0), 200);
  v_dups jsonb := '[]'::jsonb;
BEGIN
  IF p_import.kind = 'workout' THEN
    v_dups := public.coach_import_duplicate_report(p_import);
  END IF;
  RETURN jsonb_build_object(
    'import_id', p_import.id,
    'status', p_import.status,
    'created_at', p_import.created_at,
    'subject_user_id', p_import.subject_user_id,
    'provisional_dossier_id', p_import.provisional_dossier_id,
    'kind', p_import.kind,
    'filename', p_import.filename,
    'file_sha256', p_import.file_sha256,
    'ready_count', p_import.ready_count,
    'ignored_count', p_import.ignored_count,
    'error_count', p_import.error_count,
    'applied_count', p_import.applied_count,
    'row_count', p_import.row_count,
    'row_offset', v_offset,
    'row_limit', v_limit,
    'errors_only', coalesce(p_errors_only, false),
    'potential_duplicates', v_dups,
    'issues', coalesce((
      SELECT jsonb_agg(DISTINCT s.code)
      FROM (
        SELECT r.error_code AS code
        FROM public.coach_import_rows r
        WHERE r.import_id = p_import.id AND r.error_code IS NOT NULL
        UNION ALL
        SELECT 'potential_duplicate'::text
        WHERE v_dups <> '[]'::jsonb
          AND coalesce((p_import.mapping->>'acknowledge_duplicates')::boolean, false) = false
      ) s
      WHERE s.code IS NOT NULL
    ), '[]'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'row_no', q.row_no,
        'status', q.status,
        'error_code', q.error_code,
        'planned', q.planned
      ) ORDER BY q.row_no)
      FROM (
        SELECT r.row_no, r.status, r.error_code, r.planned
        FROM public.coach_import_rows r
        WHERE r.import_id = p_import.id
          AND (NOT coalesce(p_errors_only, false) OR r.status = 'error')
        ORDER BY r.row_no
        OFFSET v_offset
        LIMIT v_limit
      ) q
    ), '[]'::jsonb)
  );
END;
$$;

