-- P5.3 exercise catalog: aliases, normalized identity, proposals, explicit merge.
-- Free-text history (workout / routine / program / provisional names) is never rewritten.
-- A catalog link is set only when the normalized name matches exactly one active exercise.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.exercises(id),
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_not_self_merge;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_not_self_merge CHECK (merged_into_id IS DISTINCT FROM id);

CREATE INDEX IF NOT EXISTS exercises_merged_into_idx
  ON public.exercises (merged_into_id)
  WHERE merged_into_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.exercise_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  alias text NOT NULL,
  locale text NOT NULL DEFAULT 'und' CHECK (locale IN ('fr', 'en', 'und')),
  normalized text NOT NULL,
  source text NOT NULL DEFAULT 'seed' CHECK (source IN ('canonical', 'seed', 'proposal', 'merge', 'import')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized)
);

CREATE INDEX IF NOT EXISTS exercise_aliases_exercise_idx
  ON public.exercise_aliases (exercise_id);
CREATE INDEX IF NOT EXISTS exercise_aliases_normalized_trgm
  ON public.exercise_aliases USING gin (normalized gin_trgm_ops);

ALTER TABLE public.exercise_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exercise_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.exercise_aliases TO authenticated, service_role;
GRANT ALL ON TABLE public.exercise_aliases TO service_role;

DROP POLICY IF EXISTS exercise_aliases_select ON public.exercise_aliases;
CREATE POLICY exercise_aliases_select ON public.exercise_aliases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exercises e
      WHERE e.id = exercise_aliases.exercise_id
        AND e.merged_into_id IS NULL
        AND (e.verified = true OR e.created_by = (SELECT auth.uid()))
    )
  );

CREATE TABLE IF NOT EXISTS public.exercise_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id uuid NOT NULL REFERENCES public.exercises(id),
  loser_id uuid NOT NULL,
  loser_name text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loser_id)
);

ALTER TABLE public.exercise_merges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exercise_merges FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.exercise_merges TO service_role;

ALTER TABLE public.exercise_requests
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS ai_suggestion jsonb;

ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS catalog_exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL;
ALTER TABLE public.routine_exercises
  ADD COLUMN IF NOT EXISTS catalog_exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL;
ALTER TABLE public.program_day_exercises
  ADD COLUMN IF NOT EXISTS catalog_exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL;
ALTER TABLE public.coach_provisional_exercises
  ADD COLUMN IF NOT EXISTS catalog_exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workout_exercises_catalog_idx
  ON public.workout_exercises (catalog_exercise_id)
  WHERE catalog_exercise_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS routine_exercises_catalog_idx
  ON public.routine_exercises (catalog_exercise_id)
  WHERE catalog_exercise_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS program_day_exercises_catalog_idx
  ON public.program_day_exercises (catalog_exercise_id)
  WHERE catalog_exercise_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_provisional_exercises_catalog_idx
  ON public.coach_provisional_exercises (catalog_exercise_id)
  WHERE catalog_exercise_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.exercise_normalize_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          translate(
            lower(btrim(coalesce(p_name, ''))),
            'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
            'aaaaaaceeeeiiiinooooouuuuyyoa'
          ),
          '[^a-z0-9]+',
          ' ',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.exercise_canonical_id(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
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
    SELECT merged_into_id INTO v_next FROM public.exercises WHERE id = v_id;
    EXIT WHEN v_next IS NULL;
    v_id := v_next;
    v_guard := v_guard + 1;
    IF v_guard > 8 THEN
      RAISE EXCEPTION 'merge_cycle';
    END IF;
  END LOOP;
  RETURN v_id;
END;
$$;

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
  SELECT count(DISTINCT a.exercise_id), min(a.exercise_id::text)::uuid
    INTO v_count, v_id
    FROM public.exercise_aliases a
    JOIN public.exercises e ON e.id = a.exercise_id
   WHERE a.normalized = v_norm
     AND e.merged_into_id IS NULL;
  IF v_count = 1 THEN
    RETURN v_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.exercise_link_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.catalog_exercise_id IS NULL THEN
      NEW.catalog_exercise_id := public.resolve_exercise_catalog(NEW.name);
    ELSE
      NEW.catalog_exercise_id := public.exercise_canonical_id(NEW.catalog_exercise_id);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name
     AND OLD.catalog_exercise_id IS NULL
     AND NEW.catalog_exercise_id IS NULL THEN
    NEW.catalog_exercise_id := public.resolve_exercise_catalog(NEW.name);
  ELSIF NEW.catalog_exercise_id IS NOT NULL THEN
    NEW.catalog_exercise_id := public.exercise_canonical_id(NEW.catalog_exercise_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exercise_catalog_link_workout ON public.workout_exercises;
CREATE TRIGGER exercise_catalog_link_workout
  BEFORE INSERT OR UPDATE OF name ON public.workout_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

DROP TRIGGER IF EXISTS exercise_catalog_link_routine ON public.routine_exercises;
CREATE TRIGGER exercise_catalog_link_routine
  BEFORE INSERT OR UPDATE OF name ON public.routine_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

DROP TRIGGER IF EXISTS exercise_catalog_link_program ON public.program_day_exercises;
CREATE TRIGGER exercise_catalog_link_program
  BEFORE INSERT OR UPDATE OF name ON public.program_day_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

DROP TRIGGER IF EXISTS exercise_catalog_link_provisional ON public.coach_provisional_exercises;
CREATE TRIGGER exercise_catalog_link_provisional
  BEFORE INSERT OR UPDATE OF name ON public.coach_provisional_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercise_link_catalog();

CREATE OR REPLACE FUNCTION public.suggest_exercise_matches(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := public.exercise_normalize_name(p_name);
  v_exact jsonb := '[]'::jsonb;
  v_near jsonb := '[]'::jsonb;
BEGIN
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('normalized', NULL, 'exact', v_exact, 'nearby', v_near);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'name', e.name, 'name_fr', e.name_fr
         )), '[]'::jsonb)
    INTO v_exact
    FROM public.exercise_aliases a
    JOIN public.exercises e ON e.id = a.exercise_id
   WHERE a.normalized = v_norm
     AND e.merged_into_id IS NULL
     AND (e.verified = true OR e.created_by = auth.uid());
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'name_fr', s.name_fr, 'score', s.score
         ) ORDER BY s.score DESC, s.name), '[]'::jsonb)
    INTO v_near
    FROM (
      SELECT e.id, e.name, e.name_fr, max(similarity(a.normalized, v_norm)) AS score
        FROM public.exercise_aliases a
        JOIN public.exercises e ON e.id = a.exercise_id
       WHERE a.normalized <> v_norm
         AND e.merged_into_id IS NULL
         AND (e.verified = true OR e.created_by = auth.uid())
         AND similarity(a.normalized, v_norm) >= 0.45
       GROUP BY e.id, e.name, e.name_fr
       ORDER BY max(similarity(a.normalized, v_norm)) DESC, e.name
       LIMIT 5
    ) s;
  RETURN jsonb_build_object('normalized', v_norm, 'exact', v_exact, 'nearby', v_near);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_exercises(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, name text, name_fr text, match_kind text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT public.exercise_normalize_name(p_query) AS n
  )
  SELECT e.id, e.name, e.name_fr,
         CASE min(CASE
           WHEN a.normalized = q.n THEN 0
           WHEN a.normalized LIKE q.n || '%' THEN 1
           ELSE 2
         END)
           WHEN 0 THEN 'exact'
           WHEN 1 THEN 'prefix'
           ELSE 'contains'
         END AS match_kind
    FROM q
    JOIN public.exercise_aliases a
      ON q.n IS NOT NULL
     AND length(q.n) >= 2
     AND (a.normalized = q.n OR a.normalized LIKE '%' || q.n || '%')
    JOIN public.exercises e ON e.id = a.exercise_id
   WHERE e.merged_into_id IS NULL
     AND (e.verified = true OR e.created_by = auth.uid())
   GROUP BY e.id, e.name, e.name_fr, q.n
   ORDER BY min(CASE
            WHEN a.normalized = q.n THEN 0
            WHEN a.normalized LIKE q.n || '%' THEN 1
            ELSE 2
          END), e.name
   LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.propose_exercise(
  p_name text,
  p_muscles text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text := public.exercise_normalize_name(p_name);
  v_id uuid;
  v_matches jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_norm IS NULL OR length(v_norm) < 2 THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  INSERT INTO public.exercise_requests (user_id, name, muscles, description, status, normalized_name)
  VALUES (
    v_uid,
    btrim(p_name),
    coalesce(p_muscles, ''),
    coalesce(p_description, ''),
    'pending',
    v_norm
  )
  RETURNING id INTO v_id;
  v_matches := public.suggest_exercise_matches(p_name);
  RETURN v_matches || jsonb_build_object(
    'request_id', v_id,
    'status', 'pending',
    'applied', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_exercises(
  p_winner uuid,
  p_loser uuid,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner public.exercises;
  v_loser public.exercises;
  v_alias public.exercise_aliases;
  v_norm text;
BEGIN
  IF COALESCE(p_confirm, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  IF p_winner IS NULL OR p_loser IS NULL OR p_winner = p_loser THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  PERFORM id
    FROM public.exercises
   WHERE id IN (p_winner, p_loser)
   ORDER BY id
     FOR UPDATE;

  SELECT * INTO v_winner FROM public.exercises WHERE id = p_winner;
  SELECT * INTO v_loser FROM public.exercises WHERE id = p_loser;
  IF v_winner.id IS NULL OR v_loser.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_winner.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'winner_merged';
  END IF;
  IF v_loser.merged_into_id = p_winner THEN
    RETURN jsonb_build_object('status', 'already_merged', 'winner_id', p_winner, 'loser_id', p_loser);
  END IF;
  IF v_loser.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_merged';
  END IF;

  FOR v_alias IN
    SELECT * FROM public.exercise_aliases WHERE exercise_id = p_loser
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.exercise_aliases
       WHERE normalized = v_alias.normalized
         AND exercise_id = p_winner
    ) THEN
      DELETE FROM public.exercise_aliases WHERE id = v_alias.id;
    ELSE
      UPDATE public.exercise_aliases
         SET exercise_id = p_winner,
             source = 'merge'
       WHERE id = v_alias.id;
    END IF;
  END LOOP;

  v_norm := public.exercise_normalize_name(v_loser.name);
  IF v_norm IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.exercise_aliases WHERE normalized = v_norm
  ) THEN
    INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
    VALUES (p_winner, v_loser.name, 'und', v_norm, 'merge');
  END IF;
  v_norm := public.exercise_normalize_name(v_loser.name_fr);
  IF v_norm IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.exercise_aliases WHERE normalized = v_norm
  ) THEN
    INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
    VALUES (p_winner, v_loser.name_fr, 'fr', v_norm, 'merge');
  END IF;

  UPDATE public.exercise_requests
     SET result_exercise_id = p_winner
   WHERE result_exercise_id = p_loser;
  UPDATE public.exercises
     SET merged_into_id = p_winner
   WHERE merged_into_id = p_loser;

  UPDATE public.workout_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id = p_loser;
  UPDATE public.routine_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id = p_loser;
  UPDATE public.program_day_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id = p_loser;
  UPDATE public.coach_provisional_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id = p_loser;

  UPDATE public.exercises
     SET merged_into_id = p_winner,
         merged_at = clock_timestamp()
   WHERE id = p_loser;

  UPDATE public.workout_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id IS NULL
     AND public.resolve_exercise_catalog(name) = p_winner;
  UPDATE public.routine_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id IS NULL
     AND public.resolve_exercise_catalog(name) = p_winner;
  UPDATE public.program_day_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id IS NULL
     AND public.resolve_exercise_catalog(name) = p_winner;
  UPDATE public.coach_provisional_exercises
     SET catalog_exercise_id = p_winner
   WHERE catalog_exercise_id IS NULL
     AND public.resolve_exercise_catalog(name) = p_winner;

  INSERT INTO public.exercise_merges (winner_id, loser_id, loser_name, actor_id)
  VALUES (p_winner, p_loser, v_loser.name, auth.uid());

  RETURN jsonb_build_object('status', 'merged', 'winner_id', p_winner, 'loser_id', p_loser);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_exercise_duplicate_candidates(p_limit integer DEFAULT 50)
RETURNS TABLE (left_id uuid, right_id uuid, left_name text, right_name text, score real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.exercise_id, b.exercise_id, ea.name, eb.name,
         similarity(a.normalized, b.normalized) AS score
    FROM public.exercise_aliases a
    JOIN public.exercise_aliases b ON a.exercise_id < b.exercise_id
    JOIN public.exercises ea ON ea.id = a.exercise_id AND ea.merged_into_id IS NULL
    JOIN public.exercises eb ON eb.id = b.exercise_id AND eb.merged_into_id IS NULL
   WHERE a.normalized <> b.normalized
     AND similarity(a.normalized, b.normalized) >= 0.72
   ORDER BY score DESC, ea.name, eb.name
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.exercise_normalize_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exercise_normalize_name(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.exercise_canonical_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exercise_canonical_id(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_exercise_catalog(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_exercise_catalog(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.exercise_link_catalog() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.suggest_exercise_matches(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_exercise_matches(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_exercises(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_exercises(text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.propose_exercise(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_exercise(text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.merge_exercises(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_exercises(uuid, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.list_exercise_duplicate_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_exercise_duplicate_candidates(integer) TO service_role;

INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
SELECT e.id, e.name, 'en', public.exercise_normalize_name(e.name), 'canonical'
  FROM public.exercises e
 WHERE e.merged_into_id IS NULL
   AND public.exercise_normalize_name(e.name) IS NOT NULL
ON CONFLICT (normalized) DO NOTHING;

INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
SELECT e.id, e.name_fr, 'fr', public.exercise_normalize_name(e.name_fr), 'canonical'
  FROM public.exercises e
 WHERE e.merged_into_id IS NULL
   AND public.exercise_normalize_name(e.name_fr) IS NOT NULL
ON CONFLICT (normalized) DO NOTHING;

INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
SELECT e.id, v.alias, v.locale, public.exercise_normalize_name(v.alias), 'seed'
  FROM (VALUES
    ('Bench Press', 'bp', 'en'),
    ('Bench Press', 'chest press', 'en'),
    ('Overhead Press', 'ohp', 'en'),
    ('Overhead Press', 'military press', 'en'),
    ('Overhead Press', 'shoulder press', 'en'),
    ('Squat', 'back squat', 'en'),
    ('Squat', 'squat barre', 'fr'),
    ('Deadlift', 'sdt', 'fr'),
    ('Romanian Deadlift', 'rdl', 'en'),
    ('Pull-up', 'pullup', 'en'),
    ('Chin-up', 'chinup', 'en'),
    ('Hip Thrust', 'hipthrust', 'en'),
    ('Face Pull', 'face pulls', 'en'),
    ('Lateral Raise', 'side raise', 'en'),
    ('Lunge', 'fentes', 'fr'),
    ('Dip', 'dips', 'en'),
    ('Barbell Row', 'bent over row', 'en')
  ) AS v(name, alias, locale)
  JOIN public.exercises e ON e.name = v.name AND e.merged_into_id IS NULL
 WHERE public.exercise_normalize_name(v.alias) IS NOT NULL
ON CONFLICT (normalized) DO NOTHING;

UPDATE public.workout_exercises
   SET catalog_exercise_id = public.resolve_exercise_catalog(name)
 WHERE catalog_exercise_id IS NULL
   AND public.resolve_exercise_catalog(name) IS NOT NULL;

UPDATE public.routine_exercises
   SET catalog_exercise_id = public.resolve_exercise_catalog(name)
 WHERE catalog_exercise_id IS NULL
   AND public.resolve_exercise_catalog(name) IS NOT NULL;

UPDATE public.program_day_exercises
   SET catalog_exercise_id = public.resolve_exercise_catalog(name)
 WHERE catalog_exercise_id IS NULL
   AND public.resolve_exercise_catalog(name) IS NOT NULL;

UPDATE public.coach_provisional_exercises
   SET catalog_exercise_id = public.resolve_exercise_catalog(name)
 WHERE catalog_exercise_id IS NULL
   AND public.resolve_exercise_catalog(name) IS NOT NULL;

DROP POLICY IF EXISTS "Users can read verified or own exercises" ON public.exercises;
CREATE POLICY "Users can read verified or own exercises" ON public.exercises
  FOR SELECT TO authenticated
  USING (
    merged_into_id IS NULL
    AND (verified = true OR created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert exercises" ON public.exercises;
REVOKE INSERT ON TABLE public.exercises FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can update own exercise requests" ON public.exercise_requests;
CREATE POLICY "Users can update own exercise requests" ON public.exercise_requests
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND result_exercise_id IS NULL
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND result_exercise_id IS NULL
  );
