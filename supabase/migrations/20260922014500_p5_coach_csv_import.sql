-- P5.1 Coach CSV import. Preview is mandatory. The server re-parses and
-- revalidates at commit. Historical completed rows only — not a live logger
-- and not an assigned-plan writer.

CREATE TABLE IF NOT EXISTS public.coach_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  coach_ref text NOT NULL CHECK (coach_ref ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('previewed', 'committed', 'failed', 'cancelled')),
  kind text NOT NULL CHECK (kind IN ('workout', 'body_weight')),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 200),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  mapping jsonb NOT NULL,
  mapping_hash text NOT NULL CHECK (char_length(mapping_hash) = 64),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  source_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
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

-- Same file for the same athlete stays committed once, whichever Coach imported it.
CREATE UNIQUE INDEX IF NOT EXISTS coach_imports_subject_source_idx
  ON public.coach_imports (subject_user_id, file_sha256)
  WHERE status = 'committed';

CREATE INDEX IF NOT EXISTS coach_imports_open_preview_idx
  ON public.coach_imports (coach_id, created_at)
  WHERE status = 'previewed';

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
  USING (
    coach_id = (SELECT auth.uid())
    AND (
      subject_user_id = (SELECT auth.uid())
      OR public.is_coach_of(subject_user_id)
    )
  );

DROP POLICY IF EXISTS coach_import_rows_select ON public.coach_import_rows;
CREATE POLICY coach_import_rows_select ON public.coach_import_rows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_imports i
      WHERE i.id = import_id
    )
  );

CREATE OR REPLACE FUNCTION public.coach_imports_protect_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.coach_ref IS DISTINCT FROM OLD.coach_ref THEN
    RAISE EXCEPTION 'coach_ref_immutable';
  END IF;
  IF OLD.coach_id IS NOT NULL
     AND NEW.coach_id IS DISTINCT FROM OLD.coach_id
     AND NEW.coach_id IS NOT NULL THEN
    RAISE EXCEPTION 'coach_id_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_imports_protect_provenance ON public.coach_imports;
CREATE TRIGGER coach_imports_protect_provenance
  BEFORE UPDATE ON public.coach_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.coach_imports_protect_provenance();

REVOKE ALL ON FUNCTION public.coach_imports_protect_provenance() FROM PUBLIC, anon, authenticated;

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
      IF exists (SELECT 1 FROM unnest(v_row) c WHERE c <> '') THEN
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
  IF exists (SELECT 1 FROM unnest(v_row) c WHERE c <> '') THEN
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

CREATE OR REPLACE FUNCTION public.coach_import_calendar_date(p_year integer, p_month integer, p_day integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_dim integer;
BEGIN
  IF p_year IS NULL OR p_year < 1 OR p_year > 9999 THEN RETURN NULL; END IF;
  IF p_month IS NULL OR p_month < 1 OR p_month > 12 THEN RETURN NULL; END IF;
  IF p_day IS NULL OR p_day < 1 THEN RETURN NULL; END IF;
  v_dim := CASE p_month
    WHEN 1 THEN 31 WHEN 3 THEN 31 WHEN 5 THEN 31 WHEN 7 THEN 31
    WHEN 8 THEN 31 WHEN 10 THEN 31 WHEN 12 THEN 31
    WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30
    WHEN 2 THEN CASE
      WHEN (p_year % 4 = 0 AND p_year % 100 <> 0) OR (p_year % 400 = 0) THEN 29
      ELSE 28
    END
    ELSE 0
  END;
  IF p_day > v_dim THEN RETURN NULL; END IF;
  RETURN pg_catalog.make_date(p_year, p_month, p_day);
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_calendar_date(integer, integer, integer) FROM PUBLIC, anon, authenticated;

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
  v_norm text;
BEGIN
  IF v = '' OR v ~ '^[=+@|-]' THEN RETURN NULL; END IF;
  IF v ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN public.coach_import_calendar_date(
      split_part(v, '-', 1)::int,
      split_part(v, '-', 2)::int,
      split_part(v, '-', 3)::int
    );
  END IF;
  IF v ~ '^\d{1,2}[/.]\d{1,2}[/.]\d{4}$' THEN
    v_norm := regexp_replace(v, '[/.]', '-', 'g');
    a := split_part(v_norm, '-', 1)::int;
    b := split_part(v_norm, '-', 2)::int;
    y := split_part(v_norm, '-', 3)::int;
    IF p_format = 'dmy' THEN
      RETURN public.coach_import_calendar_date(y, b, a);
    END IF;
    IF p_format = 'mdy' THEN
      RETURN public.coach_import_calendar_date(y, a, b);
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

CREATE OR REPLACE FUNCTION public.coach_import_is_formula(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(coalesce(p_value, '')) ~ '^[=+@|-]';
$$;

REVOKE ALL ON FUNCTION public.coach_import_is_formula(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_parse_uint(p_value text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := btrim(replace(coalesce(p_value, ''), ',', '.'));
BEGIN
  IF v = '' OR public.coach_import_is_formula(v) OR v !~ '^\d{1,9}$' THEN
    RETURN NULL;
  END IF;
  RETURN v::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_parse_uint(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_parse_unit(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := regexp_replace(
    translate(lower(btrim(coalesce(p_value, ''))), 'éèêëàâäùûüôöîïç', 'eeeeaaauuuooiic'),
    '[^a-z0-9]+',
    '',
    'g'
  );
BEGIN
  IF v IN ('kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilogramme', 'kilogrammes') THEN
    RETURN 'kg';
  END IF;
  IF v IN ('lb', 'lbs', 'pound', 'pounds', 'livre', 'livres') THEN
    RETURN 'lb';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_parse_unit(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_header_group(p_header text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE public.coach_import_header_token(p_header)
    WHEN 'date' THEN 'date'
    WHEN 'jour' THEN 'date'
    WHEN 'day' THEN 'date'
    WHEN 'loggedat' THEN 'date'
    WHEN 'measuredat' THEN 'date'
    WHEN 'exercise' THEN 'exercise'
    WHEN 'exercice' THEN 'exercise'
    WHEN 'movement' THEN 'exercise'
    WHEN 'mouvement' THEN 'exercise'
    WHEN 'lift' THEN 'exercise'
    WHEN 'set' THEN 'set_index'
    WHEN 'serie' THEN 'set_index'
    WHEN 'setindex' THEN 'set_index'
    WHEN 'reps' THEN 'reps'
    WHEN 'rep' THEN 'reps'
    WHEN 'repetitions' THEN 'reps'
    WHEN 'rir' THEN 'rir'
    WHEN 'rpe' THEN 'rpe'
    WHEN 'notes' THEN 'notes'
    WHEN 'note' THEN 'notes'
    WHEN 'comment' THEN 'notes'
    WHEN 'commentaire' THEN 'notes'
    WHEN 'session' THEN 'session_name'
    WHEN 'workout' THEN 'session_name'
    WHEN 'seance' THEN 'session_name'
    WHEN 'unit' THEN 'unit'
    WHEN 'unite' THEN 'unit'
    WHEN 'units' THEN 'unit'
    WHEN 'weight' THEN 'weight'
    WHEN 'poids' THEN 'weight'
    WHEN 'wt' THEN 'weight'
    WHEN 'load' THEN 'weight'
    WHEN 'charge' THEN 'weight'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_header_group(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_assert_headers(p_headers text[], p_mapping jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  i integer;
  j integer;
  g text;
  n integer := coalesce(array_length(p_headers, 1), 0);
  v_ignored integer[] := coalesce((
    SELECT array_agg(value::int)
    FROM jsonb_array_elements_text(coalesce(p_mapping->'ignored', '[]'::jsonb))
  ), ARRAY[]::integer[]);
  v_mapped integer[] := coalesce((
    SELECT array_agg(value::int)
    FROM jsonb_each_text(coalesce(p_mapping->'columns', '{}'::jsonb))
  ), ARRAY[]::integer[]);
BEGIN
  FOR i IN 1..n LOOP
    g := public.coach_import_header_group(p_headers[i]);
    IF g IS NULL THEN CONTINUE; END IF;
    FOR j IN i + 1..n LOOP
      IF public.coach_import_header_group(p_headers[j]) IS DISTINCT FROM g THEN
        CONTINUE;
      END IF;
      IF NOT ((i - 1) = ANY (v_ignored) OR (i - 1) = ANY (v_mapped))
         OR NOT ((j - 1) = ANY (v_ignored) OR (j - 1) = ANY (v_mapped)) THEN
        RAISE EXCEPTION 'duplicate_header';
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_assert_headers(text[], jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_cell(p_cells text[], p_cols jsonb, p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_cols ? p_role THEN p_cells[(p_cols->>p_role)::int + 1]
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_cell(text[], jsonb, text) FROM PUBLIC, anon, authenticated;

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
  v_effort text := nullif(btrim(coalesce(p_mapping->>'effort_source', '')), '');
  v_ack_text text := p_mapping->>'acknowledge_duplicates';
  v_ack boolean := false;
  v_cols jsonb;
  v_ignored jsonb;
BEGIN
  IF v_kind NOT IN ('workout', 'body_weight') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_delim NOT IN (',', ';', E'\t') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_date_fmt NOT IN ('iso', 'dmy', 'mdy') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_load_unit NOT IN ('kg', 'lb') OR v_bw_unit NOT IN ('kg', 'lb') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_rpe_mode NOT IN ('notes', 'convert_to_rir') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_effort IS NOT NULL AND v_effort NOT IN ('rir', 'rpe') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
  IF v_ack_text IS NULL OR btrim(v_ack_text) = '' THEN
    v_ack := false;
  ELSIF v_ack_text IN ('true', 'false') THEN
    v_ack := v_ack_text::boolean;
  ELSE
    RAISE EXCEPTION 'invalid_mapping';
  END IF;
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
  IF v_kind = 'workout'
     AND v_rpe_mode = 'convert_to_rir'
     AND (v_cols ? 'rir')
     AND (v_cols ? 'rpe')
     AND v_effort IS NULL
  THEN
    RAISE EXCEPTION 'rir_rpe_conflict';
  END IF;
  RETURN jsonb_build_object(
    'kind', v_kind,
    'delimiter', v_delim,
    'date_format', v_date_fmt,
    'load_unit', v_load_unit,
    'body_weight_unit', v_bw_unit,
    'rpe_mode', v_rpe_mode,
    'effort_source', to_jsonb(v_effort),
    'acknowledge_duplicates', v_ack,
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
  v_session text;
  v_notes text;
  v_rpe numeric;
  v_rir integer;
  v_load numeric;
  v_set integer;
  v_reps integer;
  v_derive boolean := false;
  v_unit text;
  v_unit_raw text;
  idx integer;
  token text;
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

  v_raw := public.coach_import_cell(p_cells, v_cols, 'date');
  v_date := public.coach_import_parse_date(v_raw, p_mapping->>'date_format');
  IF v_date IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error_code', CASE WHEN public.coach_import_is_formula(v_raw) THEN 'formula_rejected' ELSE 'invalid_date' END
    );
  END IF;

  v_notes := nullif(btrim(coalesce(public.coach_import_cell(p_cells, v_cols, 'notes'), '')), '');
  IF public.coach_import_is_formula(v_notes) THEN
    RETURN jsonb_build_object('status', 'error', 'error_code', 'formula_rejected', 'date', v_date);
  END IF;

  IF p_kind = 'body_weight' THEN
    v_raw := public.coach_import_cell(p_cells, v_cols, 'body_weight');
    v_num := public.coach_import_parse_number(v_raw);
    IF v_num IS NULL OR v_num <= 0 OR v_num > 500 THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN public.coach_import_is_formula(v_raw) THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
    v_unit := p_mapping->>'body_weight_unit';
    v_unit_raw := public.coach_import_cell(p_cells, v_cols, 'unit');
    IF v_unit_raw IS NOT NULL AND btrim(v_unit_raw) <> '' THEN
      IF public.coach_import_is_formula(v_unit_raw) THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'formula_rejected', 'date', v_date);
      END IF;
      v_unit := public.coach_import_parse_unit(v_unit_raw);
      IF v_unit IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'invalid_unit', 'date', v_date);
      END IF;
    END IF;
    IF v_unit = 'lb' THEN
      v_num := round(v_num * 0.45359237, 2);
    END IF;
    RETURN jsonb_build_object(
      'status', 'ready',
      'error_code', null,
      'date', v_date,
      'body_weight_kg', v_num,
      'source_unit', v_unit,
      'notes', v_notes
    );
  END IF;

  v_raw := public.coach_import_cell(p_cells, v_cols, 'exercise');
  IF public.coach_import_is_formula(v_raw) THEN
    RETURN jsonb_build_object('status', 'error', 'error_code', 'formula_rejected', 'date', v_date);
  END IF;
  v_exercise := nullif(btrim(coalesce(v_raw, '')), '');
  IF v_exercise IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error_code', 'exercise_required', 'date', v_date);
  END IF;
  v_session := public.coach_import_cell(p_cells, v_cols, 'session_name');
  IF public.coach_import_is_formula(v_session) THEN
    RETURN jsonb_build_object('status', 'error', 'error_code', 'formula_rejected', 'date', v_date);
  END IF;
  v_session := nullif(btrim(coalesce(v_session, '')), '');

  v_raw := public.coach_import_cell(p_cells, v_cols, 'reps');
  IF v_raw IS NOT NULL AND btrim(v_raw) <> '' THEN
    v_reps := public.coach_import_parse_uint(v_raw);
    IF v_reps IS NULL OR v_reps > 1000 THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN public.coach_import_is_formula(v_raw) THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
  END IF;
  v_raw := public.coach_import_cell(p_cells, v_cols, 'exercise_load');
  IF v_raw IS NOT NULL AND btrim(v_raw) <> '' THEN
    v_load := public.coach_import_parse_number(v_raw);
    IF v_load IS NULL OR v_load < 0 OR v_load > 2000 THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN public.coach_import_is_formula(v_raw) THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
  END IF;
  v_unit := p_mapping->>'load_unit';
  v_unit_raw := public.coach_import_cell(p_cells, v_cols, 'unit');
  IF v_unit_raw IS NOT NULL AND btrim(v_unit_raw) <> '' THEN
    IF public.coach_import_is_formula(v_unit_raw) THEN
      RETURN jsonb_build_object('status', 'error', 'error_code', 'formula_rejected', 'date', v_date);
    END IF;
    v_unit := public.coach_import_parse_unit(v_unit_raw);
    IF v_unit IS NULL THEN
      RETURN jsonb_build_object('status', 'error', 'error_code', 'invalid_unit', 'date', v_date);
    END IF;
  END IF;
  IF v_load IS NOT NULL AND v_unit = 'lb' THEN
    v_load := round(v_load * 0.45359237, 2);
  END IF;
  v_raw := public.coach_import_cell(p_cells, v_cols, 'set_index');
  IF v_raw IS NULL OR btrim(v_raw) = '' THEN
    v_derive := true;
  ELSE
    v_set := public.coach_import_parse_uint(v_raw);
    IF v_set IS NULL OR v_set < 1 OR v_set > 100 THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN public.coach_import_is_formula(v_raw) THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
  END IF;
  v_raw := public.coach_import_cell(p_cells, v_cols, 'rir');
  IF v_raw IS NOT NULL AND btrim(v_raw) <> '' THEN
    v_rir := public.coach_import_parse_uint(v_raw);
    IF v_rir IS NULL OR v_rir > 10 THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error_code', CASE WHEN public.coach_import_is_formula(v_raw) THEN 'formula_rejected' ELSE 'invalid_number' END
      );
    END IF;
  END IF;
  v_raw := public.coach_import_cell(p_cells, v_cols, 'rpe');
  IF v_raw IS NOT NULL AND btrim(v_raw) <> '' THEN
    IF public.coach_import_is_formula(v_raw) THEN
      RETURN jsonb_build_object('status', 'error', 'error_code', 'formula_rejected', 'date', v_date);
    END IF;
    v_rpe := public.coach_import_parse_number(v_raw);
    IF v_rpe IS NULL OR v_rpe < 1 OR v_rpe > 10 THEN
      RETURN jsonb_build_object('status', 'error', 'error_code', 'invalid_number', 'date', v_date);
    END IF;
    IF p_mapping->>'rpe_mode' = 'notes' THEN
      v_notes := nullif(concat_ws(' · ', v_notes, 'RPE ' || v_rpe::text), '');
    ELSIF v_rir IS NOT NULL AND nullif(p_mapping->>'effort_source', '') IS NULL THEN
      RETURN jsonb_build_object('status', 'error', 'error_code', 'rir_rpe_conflict', 'date', v_date);
    ELSIF coalesce(nullif(p_mapping->>'effort_source', ''), 'rpe') = 'rir' AND v_rir IS NOT NULL THEN
      v_notes := nullif(concat_ws(' · ', v_notes, 'RPE ' || v_rpe::text), '');
    ELSE
      v_rir := greatest(0, round(10 - v_rpe))::int;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'status', 'ready',
    'error_code', null,
    'date', v_date,
    'exercise', v_exercise,
    'session_name', v_session,
    'set_index', v_set,
    'derive_set', v_derive,
    'reps', v_reps,
    'load_kg', v_load,
    'source_unit', CASE WHEN v_load IS NULL THEN NULL ELSE v_unit END,
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

CREATE OR REPLACE FUNCTION public.coach_import_actor_can_read(p_import public.coach_imports)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_import.coach_id IS NOT NULL
    AND p_import.coach_id = auth.uid()
    AND (
      p_import.subject_user_id = auth.uid()
      OR public.is_coach_of(p_import.subject_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.coach_import_actor_can_read(public.coach_imports) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_lock_active_link(p_coach uuid, p_subject uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_coach IS NULL OR p_subject IS NULL THEN
    RAISE EXCEPTION 'not_your_client';
  END IF;
  IF p_subject = p_coach THEN
    RETURN;
  END IF;
  PERFORM 1
  FROM public.coach_client_links
  WHERE coach_id = p_coach
    AND client_id = p_subject
    AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_your_client';
  END IF;
  IF NOT public.coach_relationship_is_open(p_coach) THEN
    RAISE EXCEPTION 'coach_account_closed';
  END IF;
  IF NOT public.is_coach_of(p_subject) THEN
    RAISE EXCEPTION 'not_your_client';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_lock_active_link(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lock_coach_import_quota(p_coach uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_coach IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(20014505, pg_catalog.hashtext(p_coach::text));
END;
$$;

REVOKE ALL ON FUNCTION public.lock_coach_import_quota(uuid) FROM PUBLIC, anon, authenticated;

-- Drops raw rows of previews older than 7 days. Committed provenance is kept.
CREATE OR REPLACE FUNCTION public.coach_import_expire_previews(p_coach uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_row public.coach_imports;
BEGIN
  IF p_coach IS NULL THEN RETURN; END IF;
  FOR v_id IN
    SELECT i.id
    FROM public.coach_imports i
    WHERE i.coach_id = p_coach
      AND i.status = 'previewed'
      AND i.created_at < clock_timestamp() - interval '7 days'
    ORDER BY i.id
  LOOP
    PERFORM public.lock_coach_import(v_id);
    SELECT * INTO v_row FROM public.coach_imports WHERE id = v_id FOR UPDATE;
    IF NOT FOUND
       OR v_row.status <> 'previewed'
       OR v_row.created_at >= clock_timestamp() - interval '7 days' THEN
      CONTINUE;
    END IF;
    DELETE FROM public.coach_import_rows WHERE import_id = v_id;
    UPDATE public.coach_imports
       SET status = 'cancelled',
           source_headers = '[]'::jsonb,
           row_count = 0,
           ready_count = 0,
           ignored_count = 0,
           error_count = 0
     WHERE id = v_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_expire_previews(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_duplicate_report(p_import public.coach_imports)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'workout_id', q.id,
      'name', q.name,
      'date', q.civil
    ) ORDER BY q.civil, q.name)
    FROM (
      SELECT DISTINCT w.id, w.name, (w.date AT TIME ZONE 'UTC')::date AS civil
      FROM public.workouts w
      WHERE p_import.kind = 'workout'
        AND w.user_id = p_import.subject_user_id
        AND NOT EXISTS (
          SELECT 1 FROM public.coach_import_rows own
          WHERE own.import_id = p_import.id
            AND own.applied_workout_id = w.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.coach_import_rows r
          WHERE r.import_id = p_import.id
            AND r.status IN ('ready', 'applied')
            AND (r.planned->>'date')::date = (w.date AT TIME ZONE 'UTC')::date
            AND (
              lower(btrim(w.name)) = lower(btrim(coalesce(
                nullif(btrim(r.planned->>'session_name'), ''),
                to_char((r.planned->>'date')::date, 'YYYY-MM-DD')
              )))
              OR EXISTS (
                SELECT 1 FROM public.workout_exercises e
                WHERE e.workout_id = w.id
                  AND lower(btrim(e.name)) = lower(btrim(r.planned->>'exercise'))
              )
            )
        )
    ) q
  ), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.coach_import_duplicate_report(public.coach_imports) FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.coach_import_view(public.coach_imports, integer, integer, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_finish_conflict(
  p_uid uuid,
  p_subject uuid,
  p_key text,
  p_hash text,
  p_map_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_row public.coach_imports;
BEGIN
  IF p_subject IS DISTINCT FROM p_uid THEN
    PERFORM public.lock_coach_relationship_lifecycle(p_uid);
  END IF;
  SELECT id INTO v_id
  FROM public.coach_imports
  WHERE coach_id = p_uid AND idempotency_key = p_key;
  IF FOUND THEN
    PERFORM public.lock_coach_import(v_id);
    SELECT * INTO v_row FROM public.coach_imports WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR v_row.subject_user_id IS DISTINCT FROM p_subject THEN
      RAISE EXCEPTION 'import_conflict';
    END IF;
    IF v_row.status = 'committed' THEN
      IF v_row.file_sha256 = p_hash AND v_row.mapping_hash = p_map_hash THEN
        RETURN public.coach_import_view(v_row);
      END IF;
      RAISE EXCEPTION 'import_conflict';
    END IF;
    IF v_row.file_sha256 IS DISTINCT FROM p_hash THEN
      RAISE EXCEPTION 'file_changed';
    END IF;
    IF v_row.mapping_hash = p_map_hash THEN
      RETURN public.coach_import_view(v_row);
    END IF;
    RAISE EXCEPTION 'import_conflict';
  END IF;
  SELECT id INTO v_id
  FROM public.coach_imports
  WHERE coach_id = p_uid
    AND subject_user_id = p_subject
    AND file_sha256 = p_hash
    AND mapping_hash = p_map_hash
    AND status IN ('previewed', 'committed');
  IF FOUND THEN
    PERFORM public.lock_coach_import(v_id);
    SELECT * INTO v_row FROM public.coach_imports WHERE id = v_id FOR UPDATE;
    IF FOUND
       AND v_row.subject_user_id = p_subject
       AND v_row.file_sha256 = p_hash
       AND v_row.mapping_hash = p_map_hash
       AND v_row.status IN ('previewed', 'committed') THEN
      RETURN public.coach_import_view(v_row);
    END IF;
  END IF;
  RAISE EXCEPTION 'import_conflict';
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_finish_conflict(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

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
  v_found uuid;
  v_new_id uuid;
  v_have boolean := false;
  v_self uuid := NULL;
  v_key text := btrim(p_idempotency_key);
BEGIN
  v_uid := public.coach_import_assert_actor(p_subject_user_id);
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
    ELSIF v_existing.subject_user_id IS DISTINCT FROM p_subject_user_id THEN
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
    WHERE committed.subject_user_id = p_subject_user_id
      AND committed.file_sha256 = v_hash
      AND committed.status = 'committed'
      AND committed.id IS DISTINCT FROM v_self
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
      AND subject_user_id = p_subject_user_id
      AND file_sha256 = v_hash
      AND mapping_hash = v_map_hash
      AND status IN ('previewed', 'committed');
    IF FOUND THEN
      PERFORM public.lock_coach_import(v_found);
      SELECT * INTO v_existing FROM public.coach_imports WHERE id = v_found FOR UPDATE;
      IF FOUND
         AND v_existing.subject_user_id = p_subject_user_id
         AND v_existing.file_sha256 = v_hash
         AND v_existing.mapping_hash = v_map_hash
         AND v_existing.status IN ('previewed', 'committed') THEN
        RETURN public.coach_import_view(v_existing);
      END IF;
    END IF;
    PERFORM public.lock_coach_import_quota(v_uid);
    IF (
      SELECT count(*) FROM public.coach_imports
      WHERE coach_id = v_uid AND status = 'previewed'
    ) >= 20 THEN
      RAISE EXCEPTION 'preview_quota';
    END IF;
    v_new_id := gen_random_uuid();
    PERFORM public.lock_coach_import(v_new_id);
    INSERT INTO public.coach_imports (
      id, coach_id, coach_ref, subject_user_id, status, kind, filename, file_sha256,
      mapping, mapping_hash, idempotency_key, source_headers
    ) VALUES (
      v_new_id, v_uid, 'user:' || v_uid::text, p_subject_user_id, 'previewed', v_mapping->>'kind',
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
         error_count = v_error
   WHERE id = v_import.id
   RETURNING * INTO v_import;

  RETURN public.coach_import_view(v_import);
EXCEPTION
  WHEN unique_violation THEN
    RETURN public.coach_import_finish_conflict(v_uid, p_subject_user_id, v_key, v_hash, v_map_hash);
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
  v_subject uuid;
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
  SELECT subject_user_id, coach_id INTO v_subject, v_coach
  FROM public.coach_imports
  WHERE id = p_import_id;
  IF NOT FOUND OR v_coach IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  v_uid := public.coach_import_assert_actor(v_subject);
  PERFORM public.lock_coach_import(p_import_id);
  SELECT * INTO v_import FROM public.coach_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND OR v_import.coach_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_import.subject_user_id IS DISTINCT FROM v_subject THEN
    RAISE EXCEPTION 'import_conflict';
  END IF;
  IF v_import.status = 'committed' THEN
    RETURN public.coach_import_view(v_import);
  END IF;
  IF v_import.file_sha256 <> lower(p_file_sha256) THEN RAISE EXCEPTION 'file_changed'; END IF;
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
  PERFORM public.coach_import_lock_active_link(v_uid, v_import.subject_user_id);

  IF EXISTS (
    SELECT 1 FROM public.coach_imports other
    WHERE other.subject_user_id = v_import.subject_user_id
      AND other.file_sha256 = v_import.file_sha256
      AND other.status = 'committed'
      AND other.id <> v_import.id
  ) THEN
    RAISE EXCEPTION 'already_imported';
  END IF;
  IF v_import.kind = 'workout'
     AND coalesce((v_mapping->>'acknowledge_duplicates')::boolean, false) = false
     AND public.coach_import_duplicate_report(v_import) <> '[]'::jsonb
  THEN
    RAISE EXCEPTION 'potential_duplicate';
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
          row_number() OVER (ORDER BY r.row_no)
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

REVOKE ALL ON FUNCTION public.commit_coach_import(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_coach_import(uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_coach_import(
  p_import_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50,
  p_errors_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_import public.coach_imports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF coalesce(p_offset, 0) < 0 OR coalesce(p_limit, 50) < 1 OR coalesce(p_limit, 50) > 200 THEN
    RAISE EXCEPTION 'invalid_mapping';
  END IF;
  PERFORM public.coach_import_expire_previews(auth.uid());
  SELECT * INTO v_import FROM public.coach_imports WHERE id = p_import_id;
  IF NOT FOUND OR NOT public.coach_import_actor_can_read(v_import) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  RETURN public.coach_import_view(v_import, p_offset, p_limit, coalesce(p_errors_only, false));
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_import(uuid, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_import(uuid, integer, integer, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_coach_imports()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.coach_import_expire_previews(auth.uid());
  RETURN coalesce((
    SELECT jsonb_agg(public.coach_import_view(i, 0, 0, false) ORDER BY i.created_at DESC)
    FROM (
      SELECT * FROM public.coach_imports i
      WHERE i.coach_id = auth.uid()
        AND i.status IN ('previewed', 'committed')
        AND (
          i.subject_user_id = auth.uid()
          OR public.is_coach_of(i.subject_user_id)
        )
      ORDER BY created_at DESC
      LIMIT 20
    ) i
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_coach_imports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_coach_imports() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_coach_import(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_import public.coach_imports;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_import_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.lock_coach_import(p_import_id);
  SELECT * INTO v_import FROM public.coach_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND OR v_import.coach_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_import.status = 'committed' THEN
    RAISE EXCEPTION 'import_conflict';
  END IF;
  IF v_import.status = 'previewed' THEN
    DELETE FROM public.coach_import_rows WHERE import_id = v_import.id;
    UPDATE public.coach_imports
       SET status = 'cancelled',
           source_headers = '[]'::jsonb,
           row_count = 0,
           ready_count = 0,
           ignored_count = 0,
           error_count = 0
     WHERE id = v_import.id
     RETURNING * INTO v_import;
  END IF;
  RETURN public.coach_import_view(v_import);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_coach_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_coach_import(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.coach_imports IS
  'P5.1 Coach CSV import jobs. Preview then transactional commit. coach_ref stays after the Coach account is deleted; coach_id becomes null. Subject rows follow the subject lifecycle. Open previews are capped at 20 per Coach and their raw rows are removed after 7 days or on cancel. Committed provenance is kept.';
COMMENT ON FUNCTION public.preview_coach_import(uuid, text, text, jsonb, text) IS
  'Parse and plan a Coach CSV. No business writes. Lock order: Coach lifecycle, expire old previews, import mutex, coach_imports FOR UPDATE, then preview quota 20014505 before a new row. Idempotency key is bound to the subject. A committed file cannot be imported again for the same athlete.';
COMMENT ON FUNCTION public.commit_coach_import(uuid, text, jsonb) IS
  'Lock order: lifecycle, import mutex, coach_imports FOR UPDATE, revalidation, active coach_client_links FOR SHARE, duplicate checks, then historical writes. Blank load, reps and RIR stay null. Session dates are noon UTC. Same-file reimport is already_imported. Overlapping workouts need acknowledge_duplicates.';
COMMENT ON FUNCTION public.cancel_coach_import(uuid) IS
  'Cancel one open preview and delete its raw rows. Committed provenance is not deleted.';
