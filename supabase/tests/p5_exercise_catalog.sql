-- P5.3 catalog: aliases, safe link, proposal stays pending, merge keeps the written name.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.as_user(p uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
END;
$$;

INSERT INTO auth.users(id, email) VALUES
 ('c5500000-0000-4000-8000-000000000001', 'p53-coach@example.test'),
 ('c5500000-0000-4000-8000-000000000002', 'p53-athlete@example.test'),
 ('c5500000-0000-4000-8000-000000000003', 'p53-other@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c5500000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c5500000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c5500000-0000-4000-8000-000000000003', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;

DO $$ BEGIN
  IF public.exercise_normalize_name('Développé couché') <> 'developpe couche' THEN
    RAISE EXCEPTION 'normalize accent %', public.exercise_normalize_name('Développé couché');
  END IF;
  IF public.exercise_normalize_name('Pull-up') <> 'pull up' THEN
    RAISE EXCEPTION 'normalize hyphen %', public.exercise_normalize_name('Pull-up');
  END IF;
  IF public.resolve_exercise_catalog('bp') IS DISTINCT FROM public.resolve_exercise_catalog('Bench Press') THEN
    RAISE EXCEPTION 'bp alias missed';
  END IF;
  IF public.resolve_exercise_catalog('Soulevé de terre') IS DISTINCT FROM public.resolve_exercise_catalog('Deadlift') THEN
    RAISE EXCEPTION 'fr alias missed';
  END IF;
  IF public.resolve_exercise_catalog('Hack Squat') IS NOT DISTINCT FROM public.resolve_exercise_catalog('Squat') THEN
    RAISE EXCEPTION 'variant collapsed into squat';
  END IF;
  IF public.resolve_exercise_catalog('not a real catalog name xyz') IS NOT NULL THEN
    RAISE EXCEPTION 'unknown name resolved';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.search_exercises(text,integer)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.propose_exercise(text,text,text)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.resolve_exercise_catalog(text)', 'execute')
     OR has_function_privilege('authenticated', 'public.merge_exercises(uuid,uuid,boolean)', 'execute')
     OR has_function_privilege('authenticated', 'public.list_exercise_duplicate_candidates(integer,integer)', 'execute')
     OR has_function_privilege('anon', 'public.propose_exercise(text,text,text)', 'execute')
     OR has_table_privilege('authenticated', 'public.exercises', 'insert')
     OR has_table_privilege('authenticated', 'public.exercise_aliases', 'insert')
     OR has_table_privilege('authenticated', 'public.exercise_merges', 'select')
  THEN
    RAISE EXCEPTION 'p5.3 grants mismatch';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5500000-0000-4000-8000-000000000002');

DO $$
DECLARE
  v_before integer;
  v_after integer;
  v_prop jsonb;
  v_id uuid;
  v_name text;
  v_catalog uuid;
  v_deadlift uuid;
BEGIN
  BEGIN
    PERFORM public.merge_exercises(
      'c5500000-0000-4000-8000-000000000010',
      'c5500000-0000-4000-8000-000000000011',
      true
    );
    RAISE EXCEPTION 'authenticated merged';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.exercises (name, verified, created_by)
    VALUES ('Should Not Insert', false, 'c5500000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'authenticated inserted an exercise';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT count(*) INTO v_before FROM public.exercises;
  v_prop := public.propose_exercise('Pendlay Row', 'back', 'barbell row from the floor');
  IF v_prop->>'status' <> 'pending' OR (v_prop->>'applied')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'proposal applied %', v_prop;
  END IF;
  SELECT count(*) INTO v_after FROM public.exercises;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'proposal created an exercise';
  END IF;
  IF (SELECT status FROM public.exercise_requests WHERE id = (v_prop->>'request_id')::uuid) <> 'pending' THEN
    RAISE EXCEPTION 'request not pending';
  END IF;

  BEGIN
    UPDATE public.exercise_requests
       SET status = 'approved', result_exercise_id = public.resolve_exercise_catalog('Deadlift')
     WHERE id = (v_prop->>'request_id')::uuid;
    RAISE EXCEPTION 'athlete approved their own proposal';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_deadlift := public.resolve_exercise_catalog('Deadlift');
  INSERT INTO public.workouts (user_id, name, date, completed)
  VALUES ('c5500000-0000-4000-8000-000000000002', 'Hist', '2026-09-20', true)
  RETURNING id INTO v_id;
  INSERT INTO public.workout_exercises (workout_id, name, order_index)
  VALUES (v_id, 'Soulevé de terre', 0)
  RETURNING name, catalog_exercise_id INTO v_name, v_catalog;
  IF v_name <> 'Soulevé de terre' OR v_catalog IS DISTINCT FROM v_deadlift THEN
    RAISE EXCEPTION 'safe link rewrote history name=% catalog=%', v_name, v_catalog;
  END IF;
  INSERT INTO public.workout_exercises (workout_id, name, order_index)
  VALUES (v_id, 'Invented lift zz', 1)
  RETURNING catalog_exercise_id INTO v_catalog;
  IF v_catalog IS NOT NULL THEN
    RAISE EXCEPTION 'unsafe name was linked';
  END IF;

  PERFORM pg_temp.as_user('c5500000-0000-4000-8000-000000000003');
  IF EXISTS (
    SELECT 1 FROM public.exercise_requests
     WHERE id = (v_prop->>'request_id')::uuid
  ) THEN
    RAISE EXCEPTION 'other user read the proposal';
  END IF;

  PERFORM pg_temp.as_user('c5500000-0000-4000-8000-000000000001');
  IF (SELECT count(*) FROM public.search_exercises('sdt', 5)) <> 1 THEN
    RAISE EXCEPTION 'coach search missed sdt';
  END IF;
  IF (public.suggest_exercise_matches('bp')->'exact'->0->>'name') IS DISTINCT FROM 'Bench Press' THEN
    RAISE EXCEPTION 'exact match was not bench press';
  END IF;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_winner uuid;
  v_loser uuid;
  v_workout uuid;
  v_ex uuid;
  v_name text;
  v_catalog uuid;
  v_sets integer;
  v_again jsonb;
BEGIN
  INSERT INTO public.exercises (name, name_fr, verified)
  VALUES ('Pendlay Row', 'Rowing pendlay', true)
  RETURNING id INTO v_winner;
  INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
  VALUES (v_winner, 'Pendlay Row', 'en', public.exercise_normalize_name('Pendlay Row'), 'canonical');
  INSERT INTO public.exercises (name, name_fr, verified)
  VALUES ('Pendlay Barbell Row', 'Rowing pendlay barre', true)
  RETURNING id INTO v_loser;
  INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
  VALUES (
    v_loser,
    'Pendlay Barbell Row',
    'en',
    public.exercise_normalize_name('Pendlay Barbell Row'),
    'canonical'
  );

  INSERT INTO public.workouts (user_id, name, date, completed)
  VALUES ('c5500000-0000-4000-8000-000000000002', 'Old', '2024-01-02', true)
  RETURNING id INTO v_workout;
  INSERT INTO public.workout_exercises (workout_id, name, order_index, catalog_exercise_id)
  VALUES (v_workout, 'Pendlay Barbell Row', 0, v_loser)
  RETURNING id INTO v_ex;
  INSERT INTO public.workout_sets (exercise_id, order_index, weight_kg, reps, completed)
  VALUES (v_ex, 0, 100, 5, true);

  BEGIN
    PERFORM public.merge_exercises(v_winner, v_loser, false);
    RAISE EXCEPTION 'merge without confirm';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'confirmation_required' THEN RAISE; END IF;
  END;

  IF (public.merge_exercises(v_winner, v_loser, true)->>'status') <> 'merged' THEN
    RAISE EXCEPTION 'merge failed';
  END IF;
  v_again := public.merge_exercises(v_winner, v_loser, true);
  IF v_again->>'status' <> 'already_merged' THEN
    RAISE EXCEPTION 'second merge %', v_again;
  END IF;

  SELECT name, catalog_exercise_id INTO v_name, v_catalog
    FROM public.workout_exercises WHERE id = v_ex;
  SELECT count(*) INTO v_sets FROM public.workout_sets WHERE exercise_id = v_ex;
  IF v_name <> 'Pendlay Barbell Row' OR v_catalog IS DISTINCT FROM v_winner OR v_sets <> 1 THEN
    RAISE EXCEPTION 'history changed name=% catalog=% sets=%', v_name, v_catalog, v_sets;
  END IF;
  IF public.resolve_exercise_catalog('Pendlay Barbell Row') IS DISTINCT FROM v_winner THEN
    RAISE EXCEPTION 'loser name did not follow the winner';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exercises WHERE id = v_loser AND merged_into_id IS NULL) THEN
    RAISE EXCEPTION 'loser still active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.search_exercises('Pendlay Barbell Row', 5) s
     WHERE s.id = v_loser
  ) THEN
    RAISE EXCEPTION 'search returned the merged row';
  END IF;
END $$;

\echo p5.3 exercise catalog: alias resolve, proposal pending, merge keeps the written name

ROLLBACK;
