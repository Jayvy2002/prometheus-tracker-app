-- P5 audit follow-up. Append-only on top of 20260923082313_p5_audit_fixes.
-- Closes what that migration left open:
--   * account deletion: last-operator guard and dossier detach happen inside
--     the Auth delete itself, so a refused delete leaves no side effect and a
--     formerly revoked operator can still delete the account (F01, F11);
--   * a claimed dossier's source rows follow the same access rule as its copies (F02);
--   * a direct commit refuses bytes the athlete already received by claim (F10);
--   * CSV parsing is linear and trims like the client (F37, perf);
--   * renaming a logged exercise re-resolves its identity (F14);
--   * an athlete edit bumps exercise_requests.updated_at so a stale
--     operator decision is refused (F32);
--   * import incidents are bounded and readable by operators (F31).

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- Preflight only. No side effect: the Edge calls it before closing the coach
-- account so the last operator is refused before anything irreversible.
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
  SELECT count(*) FILTER (WHERE revoked_at IS NULL),
         count(*) FILTER (WHERE user_id = p_user AND revoked_at IS NULL)
    INTO v_active, v_self
  FROM public.platform_operators;
  IF v_self = 1 AND v_active <= 1 THEN
    RAISE EXCEPTION 'last_operator';
  END IF;
  RETURN jsonb_build_object('ok', true, 'user_id', p_user);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;

COMMENT ON FUNCTION public.prepare_account_deletion(uuid) IS
  'Read-only preflight: refuses the last active operator. The effects run in the auth.users BEFORE DELETE trigger account_deletion_guard.';

CREATE OR REPLACE FUNCTION public.account_deletion_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active integer;
  v_self integer;
  v_any integer;
  v_dossier uuid;
BEGIN
  -- Same mutex as grant/revoke: two concurrent deletions cannot both pass.
  PERFORM public.lock_platform_operators();
  SELECT count(*) FILTER (WHERE revoked_at IS NULL),
         count(*) FILTER (WHERE user_id = OLD.id AND revoked_at IS NULL),
         count(*) FILTER (WHERE user_id = OLD.id)
    INTO v_active, v_self, v_any
  FROM public.platform_operators;
  IF v_self = 1 AND v_active <= 1 THEN
    RAISE EXCEPTION 'last_operator';
  END IF;
  IF v_any > 0 THEN
    IF v_self = 1 THEN
      INSERT INTO public.platform_operator_departures (user_id, reason)
      VALUES (OLD.id, 'account_deleted')
      ON CONFLICT (user_id) DO UPDATE
        SET departed_at = clock_timestamp(), reason = excluded.reason;
    END IF;
    DELETE FROM public.platform_operators WHERE user_id = OLD.id;
  END IF;

  -- Dossiers claimed by this athlete: the copies and the CSV rows are the
  -- athlete's data. Purge them, keep the provenance hashes, close the dossier.
  FOR v_dossier IN
    SELECT d.id FROM public.coach_provisional_dossiers d
     WHERE d.attached_user_id = OLD.id
     FOR UPDATE
  LOOP
    PERFORM public.lock_coach_import_provisional(v_dossier);
    DELETE FROM public.coach_import_rows r
     USING public.coach_imports i
     WHERE r.import_id = i.id
       AND i.provisional_dossier_id = v_dossier;
    DELETE FROM public.coach_provisional_workouts WHERE dossier_id = v_dossier;
    DELETE FROM public.coach_provisional_weights WHERE dossier_id = v_dossier;
    UPDATE public.coach_provisional_dossiers
       SET status = 'revoked',
           attached_user_id = NULL,
           attached_at = NULL,
           updated_at = clock_timestamp()
     WHERE id = v_dossier;
  END LOOP;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.account_deletion_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS account_deletion_guard ON auth.users;
CREATE TRIGGER account_deletion_guard
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.account_deletion_guard();

-- ---------------------------------------------------------------------------
-- A claimed dossier's source rows follow the copies' access rule
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS coach_imports_select ON public.coach_imports;
CREATE POLICY coach_imports_select ON public.coach_imports
  FOR SELECT TO authenticated
  USING (
    coach_id = (SELECT auth.uid())
    AND (
      subject_user_id = (SELECT auth.uid())
      OR (
        subject_user_id IS NOT NULL
        AND public.is_coach_of(subject_user_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.coach_provisional_dossiers d
        WHERE d.id = provisional_dossier_id
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
    )
  );

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
  ) OR (
    -- The same bytes reached this athlete through a claimed dossier.
    v_import.provisional_dossier_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.coach_import_subject_sources s
      WHERE s.user_id = v_import.subject_user_id
        AND s.file_sha256 = v_import.file_sha256
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

COMMENT ON FUNCTION public.commit_coach_import(uuid, text, jsonb) IS
  'Applies the plan frozen at preview. already_imported covers a prior direct commit and the same bytes received through a claimed dossier (coach_import_subject_sources).';

-- ---------------------------------------------------------------------------
-- CSV parser: linear time, bounded cells, client-equivalent trim
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.coach_import_trim(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Same set as String.prototype.trim: ASCII space, tab, NBSP, BOM,
  -- Unicode spaces and line separators.
  SELECT regexp_replace(
    coalesce(p_value, ''),
    '^[\s ﻿  -     　]+|[\s ﻿  -     　]+$',
    '',
    'g'
  );
$$;

REVOKE ALL ON FUNCTION public.coach_import_trim(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_parse_csv(p_text text, p_delimiter text)
RETURNS TABLE(row_no integer, cells text[])
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text text;
  v_chars text[];
  v_len integer;
  v_delim text;
  v_row text[] := ARRAY[]::text[];
  v_cell text := '';
  v_cell_len integer := 0;
  v_in_quotes boolean := false;
  v_i integer := 1;
  v_ch text;
  v_count integer := 0;
  v_max_rows integer := 2001;
  v_max_cols integer := 32;
  v_max_cell integer := 400;
  v_bytes bytea;
  v_width integer := 0;
  v_rows jsonb[] := ARRAY[]::jsonb[];
  v_item jsonb;
  v_pad text[];
  v_k integer;
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
  -- One split, then O(1) indexing. substr() on a multibyte text rescans from
  -- the start at every call and made a 2 000-row file take minutes.
  v_chars := regexp_split_to_array(v_text, '');
  v_len := coalesce(array_length(v_chars, 1), 0);
  -- A sentinel newline closes the last row with the same code path.
  v_chars := v_chars || E'\n'::text;
  v_len := v_len + 1;
  WHILE v_i <= v_len LOOP
    v_ch := v_chars[v_i];
    IF v_in_quotes THEN
      IF v_ch = '"' AND v_i < v_len AND v_chars[v_i + 1] = '"' THEN
        v_cell := v_cell || '"';
        v_cell_len := v_cell_len + 1;
        v_i := v_i + 2;
      ELSIF v_ch = '"' THEN
        v_in_quotes := false;
        v_i := v_i + 1;
      ELSIF v_i = v_len THEN
        -- The sentinel is not file content.
        v_i := v_i + 1;
      ELSE
        v_cell := v_cell || v_ch;
        v_cell_len := v_cell_len + 1;
        v_i := v_i + 1;
      END IF;
      IF v_cell_len > v_max_cell THEN RAISE EXCEPTION 'cell_too_long'; END IF;
      CONTINUE;
    END IF;
    IF v_ch = '"' THEN
      v_in_quotes := true;
      v_i := v_i + 1;
      CONTINUE;
    END IF;
    IF v_ch = v_delim OR v_ch = E'\n' THEN
      v_row := v_row || public.coach_import_trim(v_cell);
      v_cell := '';
      v_cell_len := 0;
      IF coalesce(array_length(v_row, 1), 0) > v_max_cols THEN RAISE EXCEPTION 'too_many_columns'; END IF;
      IF v_ch = E'\n' THEN
        IF EXISTS (SELECT 1 FROM unnest(v_row) c WHERE c <> '') THEN
          v_count := v_count + 1;
          IF v_count > v_max_rows THEN RAISE EXCEPTION 'too_many_rows'; END IF;
          v_width := greatest(v_width, array_length(v_row, 1));
          v_rows := v_rows || to_jsonb(v_row);
        END IF;
        v_row := ARRAY[]::text[];
      END IF;
      v_i := v_i + 1;
      CONTINUE;
    END IF;
    v_cell := v_cell || v_ch;
    v_cell_len := v_cell_len + 1;
    IF v_cell_len > v_max_cell THEN RAISE EXCEPTION 'cell_too_long'; END IF;
    v_i := v_i + 1;
  END LOOP;
  IF v_in_quotes THEN RAISE EXCEPTION 'malformed_csv'; END IF;
  IF v_count < 2 THEN RAISE EXCEPTION 'header_missing'; END IF;
  FOR v_k IN 1..v_count LOOP
    v_item := v_rows[v_k];
    SELECT coalesce(array_agg(value ORDER BY ord), ARRAY[]::text[])
      INTO v_pad
      FROM jsonb_array_elements_text(v_item) WITH ORDINALITY AS t(value, ord);
    WHILE coalesce(array_length(v_pad, 1), 0) < v_width LOOP
      v_pad := v_pad || ''::text;
    END LOOP;
    row_no := v_k;
    cells := v_pad;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Exercise identity on rename
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.exercise_link_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.catalog_exercise_id IS NULL THEN
      NEW.catalog_exercise_id := public.resolve_exercise_catalog(NEW.name);
    ELSE
      NEW.catalog_exercise_id := public.exercise_canonical_id(NEW.catalog_exercise_id);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.catalog_exercise_id IS DISTINCT FROM OLD.catalog_exercise_id THEN
    -- An explicit choice from the picker wins, canonicalised.
    NEW.catalog_exercise_id := public.exercise_canonical_id(NEW.catalog_exercise_id);
  ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
    -- Renamed to another known exercise: this is a replacement.
    -- Renamed to an unknown label: a custom label of the same exercise.
    v_resolved := public.resolve_exercise_catalog(NEW.name);
    IF v_resolved IS NOT NULL THEN
      NEW.catalog_exercise_id := v_resolved;
    ELSIF NEW.catalog_exercise_id IS NOT NULL THEN
      NEW.catalog_exercise_id := public.exercise_canonical_id(NEW.catalog_exercise_id);
    END IF;
  ELSIF NEW.catalog_exercise_id IS NOT NULL THEN
    NEW.catalog_exercise_id := public.exercise_canonical_id(NEW.catalog_exercise_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Exercise request: an athlete edit is a new version
-- ---------------------------------------------------------------------------

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
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.muscles IS DISTINCT FROM OLD.muscles
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    -- Operators pass the updated_at they reviewed; an edit invalidates it.
    NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Import incidents: bounded writes, operator read
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_coach_import_incident(p_kind text, p_error_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text := NULLIF(btrim(coalesce(p_kind, '')), '');
  v_code text := btrim(coalesce(p_error_code, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_capabilities c
    WHERE c.user_id = v_uid AND c.capability = 'coach'
  ) THEN
    RAISE EXCEPTION 'coach_capability_required';
  END IF;
  -- A code, never free text: operators read it.
  IF v_code !~ '^[a-z][a-z0-9_]{0,59}$' THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('workout', 'body_weight') THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  -- At most 50 traces per coach and day; the rest is dropped, not an error.
  IF (
    SELECT count(*) FROM public.coach_import_incidents i
    WHERE i.coach_id = v_uid
      AND i.created_at > clock_timestamp() - interval '1 day'
  ) >= 50 THEN
    RETURN jsonb_build_object('status', 'dropped');
  END IF;
  INSERT INTO public.coach_import_incidents (coach_id, coach_ref, kind, error_code)
  VALUES (v_uid, 'user:' || v_uid::text, v_kind, v_code);
  RETURN jsonb_build_object('status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.record_coach_import_incident(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_coach_import_incident(text, text) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS coach_import_incidents_created_idx
  ON public.coach_import_incidents (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS coach_import_incidents_coach_idx
  ON public.coach_import_incidents (coach_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_list_import_incidents(
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  kind text,
  error_code text,
  created_at timestamptz,
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
  SELECT i.id, i.kind, i.error_code, i.created_at,
         coalesce(left(p.full_name, 80), '')
  FROM public.coach_import_incidents i
  LEFT JOIN public.user_profiles p ON p.id = i.coach_id
  WHERE p_before IS NULL
     OR i.created_at < p_before
     OR (i.created_at = p_before AND p_before_id IS NOT NULL AND i.id < p_before_id)
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_import_incidents(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_import_incidents(timestamptz, uuid, integer) TO authenticated, service_role;
