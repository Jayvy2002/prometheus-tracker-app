-- Audit 3: a catalog exercise says how it is measured (reps or time).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  -- Every exercise has a measurement; reps is the default.
  IF EXISTS (SELECT 1 FROM public.exercises WHERE measurement IS NULL) THEN
    RAISE EXCEPTION 'measurement missing';
  END IF;
  IF (SELECT measurement FROM public.exercises WHERE name = 'Plank' AND merged_into_id IS NULL LIMIT 1) <> 'time' THEN
    RAISE EXCEPTION 'plank not timed';
  END IF;
  IF (SELECT measurement FROM public.exercises WHERE name = 'Bench Press' AND merged_into_id IS NULL LIMIT 1) <> 'reps' THEN
    RAISE EXCEPTION 'bench press not reps';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exercises WHERE name = 'Farmer Walk' AND measurement <> 'reps') THEN
    RAISE EXCEPTION 'farmer walk given a default';
  END IF;
  -- Only reps or time.
  BEGIN
    INSERT INTO public.exercises (name, name_fr, verified, measurement)
    VALUES ('Measurement test exercise', 'Test', true, 'distance');
    RAISE EXCEPTION 'unknown measurement accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- A new exercise is measured in reps unless said otherwise.
  INSERT INTO public.exercises (name, name_fr, verified) VALUES ('Measurement default exercise', 'Test', true);
  IF (SELECT measurement FROM public.exercises WHERE name = 'Measurement default exercise') <> 'reps' THEN
    RAISE EXCEPTION 'default not reps';
  END IF;
  -- Athletes read it, they do not write the catalog.
  IF NOT has_column_privilege('authenticated', 'public.exercises', 'measurement', 'select')
     OR has_table_privilege('authenticated', 'public.exercises', 'update')
     OR has_table_privilege('authenticated', 'public.exercises', 'insert') THEN
    RAISE EXCEPTION 'measurement grants mismatch';
  END IF;
END $$;

ROLLBACK;
\echo 'exercise measurement: plank timed, reps default, only reps/time, read-only for athletes'
