-- P5.1 Coach CSV import. Preview is mandatory. The server re-parses and
-- revalidates at commit. Historical completed rows only — not a live logger
-- and not an assigned-plan writer.

CREATE TABLE IF NOT EXISTS public.coach_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('previewed', 'committed', 'failed', 'cancelled')),
  kind text NOT NULL CHECK (kind IN ('workout', 'body_weight')),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 200),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  mapping jsonb NOT NULL,
  mapping_hash text NOT NULL CHECK (char_length(mapping_hash) = 64),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  ready_count integer NOT NULL DEFAULT 0 CHECK (ready_count >= 0),
  ignored_count integer NOT NULL DEFAULT 0 CHECK (ignored_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  applied_count integer NOT NULL DEFAULT 0 CHECK (applied_count >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  committed_at timestamptz,
  UNIQUE (coach_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_imports_fingerprint_idx
  ON public.coach_imports (coach_id, subject_user_id, file_sha256, mapping_hash)
  WHERE status IN ('previewed', 'committed');

CREATE TABLE IF NOT EXISTS public.coach_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.coach_imports(id) ON DELETE CASCADE,
  row_no integer NOT NULL CHECK (row_no >= 1),
  raw jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'ignored', 'error', 'applied')),
  error_code text,
  planned jsonb,
  applied_workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  applied_weight_id uuid REFERENCES public.weight_measurements(id) ON DELETE SET NULL,
  UNIQUE (import_id, row_no)
);

CREATE INDEX IF NOT EXISTS coach_import_rows_import_idx
  ON public.coach_import_rows (import_id, row_no);

ALTER TABLE public.coach_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_import_rows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.coach_imports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_import_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.coach_imports TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_import_rows TO authenticated, service_role;

DROP POLICY IF EXISTS coach_imports_select ON public.coach_imports;
CREATE POLICY coach_imports_select ON public.coach_imports
  FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS coach_import_rows_select ON public.coach_import_rows;
CREATE POLICY coach_import_rows_select ON public.coach_import_rows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_imports i
      WHERE i.id = import_id AND i.coach_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.coach_import_sha256(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(pg_catalog.sha256(convert_to(coalesce(p_text, ''), 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.coach_import_sha256(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_header_token(p_header text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(
    translate(lower(btrim(coalesce(p_header, ''))), 'éèêëàâäùûüôöîïç', 'eeeeaaauuuooiic'),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

REVOKE ALL ON FUNCTION public.coach_import_header_token(text) FROM PUBLIC, anon, authenticated;

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
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RAISE EXCEPTION 'file_empty';
  END IF;
  IF octet_length(p_text) > 524288 THEN
    RAISE EXCEPTION 'file_too_large';
  END IF;
  v_text := replace(replace(p_text, E'\r\n', E'\n'), E'\r', E'\n');
  IF get_byte(convert_to(v_text, 'UTF8'), 0) = 239 THEN
    v_text := convert_from(substring(convert_to(v_text, 'UTF8') from 4), 'UTF8');
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
      IF v_row_no > 0 OR exists (SELECT 1 FROM unnest(v_row) c WHERE c <> '') THEN
        v_row_no := v_row_no + 1;
        IF v_row_no > v_max_rows THEN RAISE EXCEPTION 'too_many_rows'; END IF;
        IF coalesce(array_length(v_row, 1), 0) > v_max_cols THEN RAISE EXCEPTION 'too_many_columns'; END IF;
        IF exists (SELECT 1 FROM unnest(v_row) c WHERE char_length(c) > v_max_cell) THEN
          RAISE EXCEPTION 'cell_too_long';
        END IF;
        row_no := v_row_no;
        cells := v_row;
        RETURN NEXT;
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
  IF v_row_no > 0 OR exists (SELECT 1 FROM unnest(v_row) c WHERE c <> '') THEN
    v_row_no := v_row_no + 1;
    IF v_row_no > v_max_rows THEN RAISE EXCEPTION 'too_many_rows'; END IF;
    IF coalesce(array_length(v_row, 1), 0) > v_max_cols THEN RAISE EXCEPTION 'too_many_columns'; END IF;
    IF exists (SELECT 1 FROM unnest(v_row) c WHERE char_length(c) > v_max_cell) THEN
      RAISE EXCEPTION 'cell_too_long';
    END IF;
    row_no := v_row_no;
    cells := v_row;
    RETURN NEXT;
  END IF;
  IF v_row_no < 2 THEN RAISE EXCEPTION 'header_missing'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_parse_csv(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lock_coach_import(p_import_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_import_id IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(
    20014504,
    ('x' || substr(md5('prometheus.coach.import:' || p_import_id::text), 1, 8))::bit(32)::int
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_coach_import(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_parse_date(p_value text, p_format text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := btrim(coalesce(p_value, ''));
  a integer;
  b integer;
  y integer;
BEGIN
  IF v = '' OR v ~ '^[=+@|-]' THEN RETURN NULL; END IF;
  IF v ~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN v::date; END IF;
  IF v ~ '^\d{1,2}[/.]\d{1,2}[/.]\d{4}$' THEN
    a := split_part(regexp_replace(v, '[/.]', '-', 'g'), '-', 1)::int;
    b := split_part(regexp_replace(v, '[/.]', '-', 'g'), '-', 2)::int;
    y := split_part(regexp_replace(v, '[/.]', '-', 'g'), '-', 3)::int;
    IF p_format = 'dmy' AND a BETWEEN 1 AND 31 AND b BETWEEN 1 AND 12 THEN
      RETURN make_date(y, b, a);
    END IF;
    IF p_format = 'mdy' AND a BETWEEN 1 AND 12 AND b BETWEEN 1 AND 31 THEN
      RETURN make_date(y, a, b);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_parse_date(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_parse_number(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := btrim(replace(coalesce(p_value, ''), ',', '.'));
BEGIN
  IF v = '' OR v ~ '^[=+@|-]' THEN RETURN NULL; END IF;
  IF v !~ '^-?\d+(\.\d+)?$' THEN RETURN NULL; END IF;
  RETURN v::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_parse_number(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_normalized_mapping(p_mapping jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_kind text := p_mapping->>'kind';
  v_delim text := coalesce(p_mapping->>'delimiter', ',');
  v_date_fmt text := coalesce(p_mapping->>'date_format', 'iso');
  v_load_unit text := coalesce(p_mapping->>'load_unit', 'kg');
  v_bw_unit text := coalesce(p_mapping->>'body_weight_unit', 'kg');
  v_rpe_mode text := coalesce(p_mapping->>'rpe_mode', 'notes');
  v_cols jsonb;
  v_ignored jsonb;
BEGIN
  IF v_kind NOT IN ('workout', 'body_weight') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_delim NOT IN (',', ';', E'\t') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_date_fmt NOT IN ('iso', 'dmy', 'mdy') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_load_unit NOT IN ('kg', 'lb') OR v_bw_unit NOT IN ('kg', 'lb') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_rpe_mode NOT IN ('notes', 'convert_to_rir') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  SELECT coalesce(jsonb_object_agg(q.key, q.value), '{}'::jsonb)
    INTO v_cols
  FROM (
    SELECT e.key, e.value
    FROM jsonb_each(coalesce(p_mapping->'columns', '{}'::jsonb)) e
    ORDER BY e.key
  ) q;
  v_cols := coalesce(v_cols, '{}'::jsonb);
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(v_cols) e WHERE e.value !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'invalid_mapping';
  END IF;
  IF (SELECT count(*) FROM jsonb_each_text(v_cols))
     <> (SELECT count(DISTINCT value) FROM jsonb_each_text(v_cols))
  THEN
    RAISE EXCEPTION 'duplicate_mapping';
  END IF;
  SELECT coalesce(jsonb_agg(x.n ORDER BY x.n), '[]'::jsonb)
    INTO v_ignored
  FROM (
    SELECT value::int AS n
    FROM jsonb_array_elements_text(coalesce(p_mapping->'ignored', '[]'::jsonb))
  ) x;
  v_ignored := coalesce(v_ignored, '[]'::jsonb);
  IF v_kind = 'workout' AND (v_cols ? 'date') IS NOT TRUE THEN RAISE EXCEPTION 'date_required'; END IF;
  IF v_kind = 'workout' AND (v_cols ? 'exercise') IS NOT TRUE THEN RAISE EXCEPTION 'exercise_required'; END IF;
  IF v_kind = 'body_weight' AND (v_cols ? 'date') IS NOT TRUE THEN RAISE EXCEPTION 'date_required'; END IF;
  IF v_kind = 'body_weight' AND (v_cols ? 'body_weight') IS NOT TRUE THEN RAISE EXCEPTION 'body_weight_required'; END IF;
  IF (v_cols ? 'exercise_load') AND (v_cols ? 'body_weight')
     AND (v_cols->>'exercise_load') = (v_cols->>'body_weight')
  THEN
    RAISE EXCEPTION 'weight_role_conflict';
  END IF;
  RETURN jsonb_build_object(
    'kind', v_kind,
    'delimiter', v_delim,
    'date_format', v_date_fmt,
    'load_unit', v_load_unit,
    'body_weight_unit', v_bw_unit,
    'rpe_mode', v_rpe_mode,
    'columns', v_cols,
    'ignored', v_ignored
  );
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_normalized_mapping(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_plan_row(
  p_kind text,
  p_mapping jsonb,
  p_headers text[],
  p_cells text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_cols jsonb := p_mapping->'columns';
  v_date date;
  v_raw text;
  v_num numeric;
  v_exercise text;
  v_notes text;
  v_rpe numeric;
  v_rir numeric;
  v_load numeric;
  v_set integer;
  v_reps integer;
  idx integer;
  token text;
  ignored integer[] := coalesce((
    SELECT array_agg(value::int)
    FROM jsonb_array_elements_text(coalesce(p_mapping->'ignored', '[]'::jsonb))
  ), ARRAY[]::integer[]);
BEGIN
  FOR idx IN 1 .. coalesce(array_length(p_headers, 1), 0) LOOP
    token := public.coach_import_header_token(p_headers[idx]);
    IF token IN ('weight', 'poids', 'wt', 'load', 'charge')
       AND NOT (idx - 1 = ANY (
         SELECT jsonb_array_elements_text(coalesce(p_mapping->'ignored', '[]'::jsonb))::int
       ))
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_each_text(v_cols) e WHERE e.value::int = idx - 1
       )
    THEN
      RETURN jsonb_build_object('status', 'error', 'error_code', 'unresolved_ambiguity');
    END IF;
  END LOOP;

  v_raw := p_cells[(v_cols->>'date')::int + 1];
  v_date := public.coach_import_parse_date(v_raw, p_mapping->>'date_format');
  IF v_date IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error_code', CASE WHEN coalesce(v_raw, '') ~ '^[=+@|-]' THEN 'formula_rejected' ELSE 'invalid_date' END
    );
  END IF;

  IF p_kind = 'body_weight' THEN
    v_raw := p_cells[(v_cols->>'body_weight')::int + 1];
    v_num := public.coach_import_parse_number(v_raw);
    IF v_num IS NULL OR v_num <= 0 OR v_num > 500 THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN coalesce(v_raw, '') ~ '^[=+@|-]' THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
    IF p_mapping->>'body_weight_unit' = 'lb' THEN
      v_num := round(v_num * 0.45359237, 2);
    END IF;
    RETURN jsonb_build_object(
      'status', 'ready',
      'error_code', null,
      'date', v_date,
      'body_weight_kg', v_num,
      'notes', nullif(p_cells[coalesce((v_cols->>'notes')::int, -1) + 1], '')
    );
  END IF;

  v_exercise := nullif(p_cells[(v_cols->>'exercise')::int + 1], '');
  IF v_exercise IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error_code', 'exercise_required', 'date', v_date);
  END IF;
  v_raw := p_cells[coalesce((v_cols->>'reps')::int, -1) + 1];
  IF coalesce(v_raw, '') <> '' THEN
    v_num := public.coach_import_parse_number(v_raw);
    IF v_num IS NULL OR v_num < 0 OR v_num > 1000 OR v_num <> trunc(v_num) THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN v_raw ~ '^[=+@|-]' THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
    v_reps := v_num::int;
  ELSE
    v_reps := 0;
  END IF;
  v_raw := p_cells[coalesce((v_cols->>'exercise_load')::int, -1) + 1];
  IF coalesce(v_raw, '') <> '' THEN
    v_load := public.coach_import_parse_number(v_raw);
    IF v_load IS NULL OR v_load < 0 OR v_load > 2000 THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN v_raw ~ '^[=+@|-]' THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
    IF p_mapping->>'load_unit' = 'lb' THEN
      v_load := round(v_load * 0.45359237, 2);
    END IF;
  END IF;
  v_raw := p_cells[coalesce((v_cols->>'set_index')::int, -1) + 1];
  v_set := coalesce(public.coach_import_parse_number(v_raw)::int, 1);
  v_notes := nullif(p_cells[coalesce((v_cols->>'notes')::int, -1) + 1], '');
  v_raw := p_cells[coalesce((v_cols->>'rir')::int, -1) + 1];
  IF coalesce(v_raw, '') <> '' THEN
    v_rir := public.coach_import_parse_number(v_raw);
  END IF;
  v_raw := p_cells[coalesce((v_cols->>'rpe')::int, -1) + 1];
  IF coalesce(v_raw, '') <> '' THEN
    v_rpe := public.coach_import_parse_number(v_raw);
    IF v_rpe IS NULL OR v_rpe < 1 OR v_rpe > 10 THEN
      RETURN jsonb_build_object('status', 'error', 'error_code', 'invalid_number');
    END IF;
    IF p_mapping->>'rpe_mode' = 'convert_to_rir' THEN
      v_rir := greatest(0, round(10 - v_rpe));
    ELSE
      v_notes := nullif(concat_ws(' · ', v_notes, 'RPE ' || v_rpe::text), '');
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'status', 'ready',
    'error_code', null,
    'date', v_date,
    'exercise', v_exercise,
    'session_name', nullif(p_cells[coalesce((v_cols->>'session_name')::int, -1) + 1], ''),
    'set_index', v_set,
    'reps', v_reps,
    'load_kg', v_load,
    'rir', v_rir,
    'notes', v_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_plan_row(text, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_assert_actor(p_subject uuid)
RETURNS uuid
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
  IF p_subject IS NULL THEN RAISE EXCEPTION 'invalid_subject'; END IF;
  IF p_subject = v_uid THEN RETURN v_uid; END IF;
  PERFORM public.lock_coach_relationship_lifecycle(v_uid);
  IF NOT public.coach_relationship_is_open(v_uid) THEN
    RAISE EXCEPTION 'coach_account_closed';
  END IF;
  IF NOT public.is_coach_of(p_subject) THEN
    RAISE EXCEPTION 'not_your_client';
  END IF;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_assert_actor(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_view(p_import public.coach_imports)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN jsonb_build_object(
    'import_id', p_import.id,
    'status', p_import.status,
    'kind', p_import.kind,
    'filename', p_import.filename,
    'file_sha256', p_import.file_sha256,
    'ready_count', p_import.ready_count,
    'ignored_count', p_import.ignored_count,
    'error_count', p_import.error_count,
    'applied_count', p_import.applied_count,
    'issues', coalesce((
      SELECT jsonb_agg(DISTINCT r.error_code)
      FROM public.coach_import_rows r
      WHERE r.import_id = p_import.id AND r.error_code IS NOT NULL
    ), '[]'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'row_no', r.row_no,
        'status', r.status,
        'error_code', r.error_code,
        'planned', r.planned
      ) ORDER BY r.row_no)
      FROM public.coach_import_rows r
      WHERE r.import_id = p_import.id
        AND r.row_no <= 50
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_view(public.coach_imports) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_coach_import(
  p_subject_user_id uuid,
  p_filename text,
  p_source_text text,
  p_mapping jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
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
BEGIN
  v_uid := public.coach_import_assert_actor(p_subject_user_id);
  IF p_filename IS NULL OR char_length(btrim(p_filename)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_filename';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  v_mapping := public.coach_import_normalized_mapping(p_mapping);
  v_hash := public.coach_import_sha256(p_source_text);
  v_map_hash := public.coach_import_sha256(v_mapping::text);

  SELECT * INTO v_existing
  FROM public.coach_imports
  WHERE coach_id = v_uid AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status = 'committed' THEN
      IF v_existing.file_sha256 = v_hash AND v_existing.mapping_hash = v_map_hash THEN
        RETURN public.coach_import_view(v_existing);
      END IF;
      RAISE EXCEPTION 'import_conflict';
    END IF;
    IF v_existing.file_sha256 <> v_hash THEN RAISE EXCEPTION 'file_changed'; END IF;
    DELETE FROM public.coach_import_rows WHERE import_id = v_existing.id;
    v_import := v_existing;
  ELSE
    SELECT * INTO v_existing
    FROM public.coach_imports
    WHERE coach_id = v_uid
      AND subject_user_id = p_subject_user_id
      AND file_sha256 = v_hash
      AND mapping_hash = v_map_hash
      AND status IN ('previewed', 'committed')
    FOR UPDATE;
    IF FOUND THEN
      RETURN public.coach_import_view(v_existing);
    END IF;
    INSERT INTO public.coach_imports (
      coach_id, subject_user_id, status, kind, filename, file_sha256,
      mapping, mapping_hash, idempotency_key
    ) VALUES (
      v_uid, p_subject_user_id, 'previewed', v_mapping->>'kind', btrim(p_filename),
      v_hash, v_mapping, v_map_hash, btrim(p_idempotency_key)
    )
    RETURNING * INTO v_import;
  END IF;

  FOR v_parsed IN
    SELECT * FROM public.coach_import_parse_csv(p_source_text, v_mapping->>'delimiter')
  LOOP
    IF v_parsed.row_no = 1 THEN
      v_headers := v_parsed.cells;
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

  UPDATE public.coach_imports
     SET mapping = v_mapping,
         mapping_hash = v_map_hash,
         file_sha256 = v_hash,
         filename = btrim(p_filename),
         kind = v_mapping->>'kind',
         subject_user_id = p_subject_user_id,
         status = 'previewed',
         row_count = v_rows,
         ready_count = v_ready,
         ignored_count = v_ignored,
         error_count = v_error
   WHERE id = v_import.id
   RETURNING * INTO v_import;

  RETURN public.coach_import_view(v_import);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.coach_imports
    WHERE coach_id = v_uid AND idempotency_key = btrim(p_idempotency_key);
    IF FOUND THEN RETURN public.coach_import_view(v_existing); END IF;
    SELECT * INTO v_existing
    FROM public.coach_imports
    WHERE coach_id = v_uid
      AND subject_user_id = p_subject_user_id
      AND file_sha256 = v_hash
      AND mapping_hash = v_map_hash
      AND status IN ('previewed', 'committed');
    IF FOUND THEN RETURN public.coach_import_view(v_existing); END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_coach_import(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_coach_import(uuid, text, text, jsonb, text) TO authenticated, service_role;

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
  IF p_import_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_import FROM public.coach_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.lock_coach_import(p_import_id);
  v_uid := public.coach_import_assert_actor(v_import.subject_user_id);
  IF v_import.coach_id <> v_uid THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_import.status = 'committed' THEN
    RETURN public.coach_import_view(v_import);
  END IF;
  IF v_import.file_sha256 <> lower(p_file_sha256) THEN RAISE EXCEPTION 'file_changed'; END IF;
  v_mapping := public.coach_import_normalized_mapping(p_mapping);
  v_map_hash := public.coach_import_sha256(v_mapping::text);
  IF v_map_hash <> v_import.mapping_hash THEN RAISE EXCEPTION 'mapping_changed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_import_rows
    WHERE import_id = v_import.id AND status = 'ready'
  ) THEN
    RAISE EXCEPTION 'nothing_to_import';
  END IF;

  IF v_import.kind = 'body_weight' THEN
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
          coalesce(v_row.planned->>'notes', '')
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
      SELECT DISTINCT (planned->>'date')::date, coalesce(planned->>'session_name', '')
      FROM public.coach_import_rows
      WHERE import_id = v_import.id AND status = 'ready'
    LOOP
      INSERT INTO public.workouts (user_id, name, date, completed, notes)
      VALUES (
        v_import.subject_user_id,
        CASE WHEN v_session <> '' THEN v_session ELSE to_char(v_date, 'YYYY-MM-DD') END,
        (v_date::timestamp AT TIME ZONE 'UTC'),
        true,
        ''
      )
      RETURNING id INTO v_wid;
      v_ex_ord := 0;
      FOR v_ex IN
        SELECT DISTINCT planned->>'exercise'
        FROM public.coach_import_rows
        WHERE import_id = v_import.id
          AND status = 'ready'
          AND (planned->>'date')::date = v_date
          AND coalesce(planned->>'session_name', '') = v_session
      LOOP
        v_ex_ord := v_ex_ord + 1;
        INSERT INTO public.workout_exercises (workout_id, name, order_index, notes)
        VALUES (
          v_wid,
          v_ex,
          v_ex_ord,
          coalesce((
            SELECT planned->>'notes'
            FROM public.coach_import_rows
            WHERE import_id = v_import.id AND status = 'ready'
              AND (planned->>'date')::date = v_date
              AND coalesce(planned->>'session_name', '') = v_session
              AND planned->>'exercise' = v_ex
            ORDER BY row_no LIMIT 1
          ), '')
        )
        RETURNING id INTO v_eid;
        INSERT INTO public.workout_sets (
          exercise_id, set_type, weight_kg, reps, rir, completed, order_index
        )
        SELECT
          v_eid,
          'working',
          coalesce((r.planned->>'load_kg')::numeric, 0),
          coalesce((r.planned->>'reps')::int, 0),
          coalesce((r.planned->>'rir')::int, 0),
          true,
          coalesce((r.planned->>'set_index')::int, 1)
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
END;
$$;

REVOKE ALL ON FUNCTION public.commit_coach_import(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_coach_import(uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_coach_import(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_import public.coach_imports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_import
  FROM public.coach_imports
  WHERE id = p_import_id AND coach_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN public.coach_import_view(v_import);
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_import(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_coach_imports()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public.coach_import_view(i) ORDER BY i.created_at DESC)
    FROM (
      SELECT * FROM public.coach_imports
      WHERE coach_id = auth.uid()
      ORDER BY created_at DESC
      LIMIT 20
    ) i
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_coach_imports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_coach_imports() TO authenticated, service_role;

COMMENT ON TABLE public.coach_imports IS
  'P5.1 Coach CSV import jobs. Preview then transactional commit. Provenance stays here; business tables are not polluted.';
COMMENT ON FUNCTION public.preview_coach_import(uuid, text, text, jsonb, text) IS
  'Parse and plan a Coach CSV. No business writes. Coach self or active client only.';
COMMENT ON FUNCTION public.commit_coach_import(uuid, text, jsonb) IS
  'Revalidate mapping, fingerprint and is_coach_of, then apply historical rows atomically. Retry returns the committed result.';
