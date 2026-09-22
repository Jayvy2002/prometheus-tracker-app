-- P5.1 Coach CSV import: preview is not a business write; commit is atomic and coach-scoped.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE p51_hold (import_id uuid, sha text, map jsonb);
GRANT ALL ON TABLE p51_hold TO authenticated;

CREATE FUNCTION pg_temp.as_user(p uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
END;
$$;

CREATE FUNCTION pg_temp.expect(p_got text, p_want text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'expected %, got %', p_want, p_got;
  END IF;
END;
$$;

INSERT INTO auth.users(id, email) VALUES
 ('c5100000-0000-4000-8000-000000000001', 'p51-coach-a@example.test'),
 ('c5100000-0000-4000-8000-000000000002', 'p51-client-a@example.test'),
 ('c5100000-0000-4000-8000-000000000003', 'p51-coach-b@example.test'),
 ('c5100000-0000-4000-8000-000000000004', 'p51-client-b@example.test'),
 ('c5100000-0000-4000-8000-000000000005', 'p51-former-a@example.test'),
 ('c5100000-0000-4000-8000-000000000006', 'p51-coach-c@example.test'),
 ('c5100000-0000-4000-8000-000000000007', 'p51-client-c@example.test'),
 ('c5100000-0000-4000-8000-000000000008', 'p51-client-a2@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c5100000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c5100000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c5100000-0000-4000-8000-000000000003', 'free', 'coach'),
 ('c5100000-0000-4000-8000-000000000004', 'free', 'none'),
 ('c5100000-0000-4000-8000-000000000005', 'free', 'none'),
 ('c5100000-0000-4000-8000-000000000006', 'free', 'coach'),
 ('c5100000-0000-4000-8000-000000000007', 'free', 'none'),
 ('c5100000-0000-4000-8000-000000000008', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
INSERT INTO public.coach_client_links(coach_id, client_id, status) VALUES
 ('c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000002', 'active'),
 ('c5100000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000004', 'active'),
 ('c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000005', 'ended'),
 ('c5100000-0000-4000-8000-000000000006', 'c5100000-0000-4000-8000-000000000007', 'active'),
 ('c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000008', 'active');

DO $$ BEGIN
  IF NOT has_function_privilege('authenticated', 'public.preview_coach_import(uuid,text,text,jsonb,text)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.commit_coach_import(uuid,text,jsonb)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.cancel_coach_import(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.lock_coach_import(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.coach_import_expire_previews(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.coach_import_purge_stale_previews()', 'execute')
     OR has_function_privilege('authenticated', 'public.lock_coach_import_subject(uuid)', 'execute')
     OR has_function_privilege('anon', 'public.preview_coach_import(uuid,text,text,jsonb,text)', 'execute')
     OR has_table_privilege('authenticated', 'public.coach_imports', 'insert')
  THEN
    RAISE EXCEPTION 'p5.1 grants mismatch';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000002');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.coach_imports (
      coach_id, subject_user_id, status, kind, filename, file_sha256, mapping, mapping_hash, idempotency_key
    ) VALUES (
      auth.uid(), auth.uid(), 'previewed', 'workout', 'x.csv', repeat('a', 64),
      '{}'::jsonb, repeat('b', 64), 'direct'
    );
    RAISE EXCEPTION 'direct insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%insufficient%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.preview_coach_import(
      auth.uid(), 'self.csv', E'Date,Weight\n2026-01-02,80\n',
      '{"kind":"body_weight","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"body_weight":1},"ignored":[]}'::jsonb,
      'athlete-self'
    );
    RAISE EXCEPTION 'athlete previewed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coach_capability_required' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000001', 'empty.csv', '   ',
      '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb,
      'empty'
    );
    RAISE EXCEPTION 'empty accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'file_empty' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000001', 'header.csv', E'Date,Weight\n',
      '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb,
      'header'
    );
    RAISE EXCEPTION 'header-only accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'header_missing' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000001', 'big.csv', repeat('a', 524289),
      '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb,
      'big'
    );
    RAISE EXCEPTION 'oversize accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'file_too_large' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000004', 'stolen.csv',
      E'Date,Exercise,Reps,Weight\n2026-01-02,Squat,5,100\n',
      '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'::jsonb,
      'stolen'
    );
    RAISE EXCEPTION 'imported for other coach client';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_your_client' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000005', 'former.csv',
      E'Date,Exercise,Reps,Weight\n2026-01-02,Squat,5,100\n',
      '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'::jsonb,
      'former'
    );
    RAISE EXCEPTION 'former client import accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_your_client' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000001', 'rows.csv',
      'Date,Exercise,Reps,Weight' || E'\n' || (
        SELECT string_agg('2026-01-02,Squat,5,100', E'\n') FROM generate_series(1, 2001)
      ),
      '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'::jsonb,
      'too-many'
    );
    RAISE EXCEPTION 'too many rows accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'too_many_rows' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE
  v jsonb;
  v_id uuid;
  n int;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002',
    'weight.csv',
    E'Date,Exercise,Reps,Weight\n2026-01-02,Squat,5,100\n2026-01-03,=CMD,5,100\n',
    v_map,
    'ambiguous-weight'
  );
  IF (v->>'error_count')::int < 1 THEN RAISE EXCEPTION 'silent Weight mapping'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = 'c5100000-0000-4000-8000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'preview wrote workouts'; END IF;
  BEGIN
    PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
    RAISE EXCEPTION 'committed unresolved Weight';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'nothing_to_import' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE
  v jsonb;
  v2 jsonb;
  v_id uuid;
  n int;
  sha text;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps,Weight\n2026-01-02,Squat,5,100\n2026-01-03,,5,100\n2026-01-04,Squat,abc,100\n2026-01-05,Squat,5,=CMD\n';
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002',
    'sets.csv',
    v_csv,
    v_map,
    'sets-ok'
  );
  v_id := (v->>'import_id')::uuid;
  IF (v->>'ready_count')::int <> 1 THEN RAISE EXCEPTION 'ready %, expected 1', v->>'ready_count'; END IF;
  IF (v->>'error_count')::int <> 3 THEN RAISE EXCEPTION 'errors %, expected 3', v->>'error_count'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = 'c5100000-0000-4000-8000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'preview wrote workouts'; END IF;

  v2 := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002',
    'sets.csv',
    v_csv,
    v_map,
    'sets-ok'
  );
  IF (v2->>'import_id') <> v->>'import_id' THEN RAISE EXCEPTION 'idempotency key created a second import'; END IF;

  sha := v->>'file_sha256';
  BEGIN
    PERFORM public.commit_coach_import(v_id, repeat('0', 64), v_map);
    RAISE EXCEPTION 'changed file accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'file_changed' THEN RAISE; END IF;
  END;

  v := public.commit_coach_import(v_id, sha, v_map);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'commit status %', v->>'status'; END IF;
  IF (v->>'applied_count')::int <> 1 THEN RAISE EXCEPTION 'applied %', v->>'applied_count'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = 'c5100000-0000-4000-8000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'workout count %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.workouts WHERE user_id = 'c5100000-0000-4000-8000-000000000002' AND program_day_id IS NOT NULL) THEN
    RAISE EXCEPTION 'import stamped program_day_id';
  END IF;

  v2 := public.commit_coach_import(v_id, sha, v_map);
  IF (v2->>'import_id') <> v->>'import_id' THEN RAISE EXCEPTION 'retry opened a new import'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = 'c5100000-0000-4000-8000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'retry duplicated workouts'; END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_id uuid;
  sha text;
  v_map jsonb := '{"kind":"body_weight","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"lb","rpe_mode":"notes","columns":{"date":0,"body_weight":1},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Weight\n2026-01-02,180\n';
  n numeric;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000001',
    'bw.csv',
    v_csv,
    v_map,
    'self-bw'
  );
  v_id := (v->>'import_id')::uuid;
  sha := v->>'file_sha256';
  v := public.commit_coach_import(v_id, sha, v_map);
  SELECT weight_kg INTO n FROM public.weight_measurements
  WHERE user_id = 'c5100000-0000-4000-8000-000000000001' AND measured_at = '2026-01-02';
  IF n IS DISTINCT FROM 81.65 THEN RAISE EXCEPTION 'lb conversion %', n; END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000001',
    'bw.csv',
    v_csv,
    v_map,
    'self-bw-2'
  );
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'fingerprint retry did not return committed'; END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_id uuid;
  sha text;
  n int;
  ts timestamptz;
  notes text;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"set_index":2,"reps":3,"exercise_load":4,"rir":5},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Set,Reps,Load,RIR\n2026-06-01,Blank,1,,,\n2026-06-01,Zero,1,0,0,0\n2026-06-01,Bad,abc,5,10,1\n2026-06-01,Half,1.5,5,10,1\n2026-06-01,High,1,5,10,11\n';
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'nulls.csv', v_csv, v_map, 'nulls-vs-zero'
  );
  IF (v->>'ready_count')::int <> 2 OR (v->>'error_count')::int <> 3 THEN
    RAISE EXCEPTION 'null/zero preview ready % error %', v->>'ready_count', v->>'error_count';
  END IF;
  sha := v->>'file_sha256';
  v := public.commit_coach_import((v->>'import_id')::uuid, sha, v_map);
  IF EXISTS (
    SELECT 1 FROM public.workout_sets s
    JOIN public.workout_exercises e ON e.id = s.exercise_id
    JOIN public.workouts w ON w.id = e.workout_id
    WHERE w.user_id = 'c5100000-0000-4000-8000-000000000002'
      AND e.name = 'Blank'
      AND (s.weight_kg IS NOT NULL OR s.reps IS NOT NULL OR s.rir IS NOT NULL)
  ) THEN RAISE EXCEPTION 'blank cells became zeros'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workout_sets s
    JOIN public.workout_exercises e ON e.id = s.exercise_id
    JOIN public.workouts w ON w.id = e.workout_id
    WHERE w.user_id = 'c5100000-0000-4000-8000-000000000002'
      AND e.name = 'Zero' AND s.weight_kg = 0 AND s.reps = 0 AND s.rir = 0
  ) THEN RAISE EXCEPTION 'explicit zeros were dropped'; END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'baddate-iso.csv',
    E'Date,Exercise\n2026-02-02,Squat\n2026-02-31,Bench\n2026-02-03,Row\n',
    v_map, 'bad-iso'
  );
  IF (v->>'ready_count')::int <> 2 OR (v->>'error_count')::int <> 1 THEN
    RAISE EXCEPTION 'iso impossible date aborted or miscounted %', v;
  END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'baddate-dmy.csv',
    E'Date,Exercise\n02/02/2026,Squat\n31/02/2026,Bench\n03/02/2026,Row\n',
    jsonb_set(v_map, '{date_format}', '"dmy"'), 'bad-dmy'
  );
  IF (v->>'ready_count')::int <> 2 OR (v->>'error_count')::int <> 1 THEN
    RAISE EXCEPTION 'dmy impossible date aborted or miscounted %', v;
  END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'baddate-mdy.csv',
    E'Date,Exercise\n02/02/2026,Squat\n02/31/2026,Bench\n02/03/2026,Row\n',
    jsonb_set(v_map, '{date_format}', '"mdy"'), 'bad-mdy'
  );
  IF (v->>'ready_count')::int <> 2 OR (v->>'error_count')::int <> 1 THEN
    RAISE EXCEPTION 'mdy impossible date aborted or miscounted %', v;
  END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  sha text;
  notes text;
  names text;
  ts timestamptz;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"rpe":3,"notes":4},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps,RPE,Notes\n2026-07-15,Bench,5,8,first\n2026-07-15,Squat,3,9,\n2026-07-15,Bench,4,6,second\n';
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'order.csv', v_csv, v_map, 'order-rpe-noon'
  );
  sha := v->>'file_sha256';
  v := public.commit_coach_import((v->>'import_id')::uuid, sha, v_map);
  SELECT string_agg(e.name, '>' ORDER BY e.order_index) INTO names
  FROM public.workout_exercises e
  JOIN public.workouts w ON w.id = e.workout_id
  WHERE w.user_id = 'c5100000-0000-4000-8000-000000000002' AND w.name = '2026-07-15';
  IF names IS DISTINCT FROM 'Bench>Squat' THEN RAISE EXCEPTION 'exercise order %', names; END IF;
  SELECT e.notes INTO notes
  FROM public.workout_exercises e
  JOIN public.workouts w ON w.id = e.workout_id
  WHERE w.user_id = 'c5100000-0000-4000-8000-000000000002' AND w.name = '2026-07-15' AND e.name = 'Bench';
  IF notes NOT LIKE '%RPE 8%' OR notes NOT LIKE '%RPE 6%' OR notes NOT LIKE '%1 ·%' OR notes NOT LIKE '%2 ·%' THEN
    RAISE EXCEPTION 'per-set RPE notes lost: %', notes;
  END IF;
  SELECT w.date INTO ts FROM public.workouts w
  WHERE w.user_id = 'c5100000-0000-4000-8000-000000000002' AND w.name = '2026-07-15';
  IF (ts AT TIME ZONE 'America/Toronto')::date IS DISTINCT FROM DATE '2026-07-15'
     OR (ts AT TIME ZONE 'Europe/Paris')::date IS DISTINCT FROM DATE '2026-07-15'
     OR (ts AT TIME ZONE 'America/Vancouver')::date IS DISTINCT FROM DATE '2026-07-15'
     OR ts IS DISTINCT FROM (timestamp '2026-07-15 12:00:00' AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'civil date drifted %', ts;
  END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":2},"ignored":[]}'::jsonb;
BEGIN
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000002', 'dup.csv',
      E'Date,Date,Exercise\n2026-08-03,2026-08-04,Squat\n',
      v_map, 'dup-header'
    );
    RAISE EXCEPTION 'duplicate header accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'duplicate_header' THEN RAISE; END IF;
  END;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'dup.csv',
    E'Date,Date,Exercise\n2026-08-03,2026-08-04,Squat\n',
    jsonb_set(v_map, '{ignored}', '[1]'), 'dup-header-resolved'
  );
  IF (v->>'ready_count')::int <> 1 THEN RAISE EXCEPTION 'resolved duplicate header not ready'; END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"notes":2,"set_index":3,"rir":4},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'formula.csv',
    E'Date,Exercise,Notes,Set,RIR\n2026-08-01,=1+1,ok,1,1\n2026-08-01,Squat,=cmd,1,1\n2026-08-01,Squat,ok,=2,1\n2026-08-01,Squat,ok,1,=3\n2026-08-01,Squat,fine,1,2\n',
    v_map, 'formula-text'
  );
  IF (v->>'ready_count')::int <> 1 OR (v->>'error_count')::int <> 4 THEN
    RAISE EXCEPTION 'formula text ready % error %', v->>'ready_count', v->>'error_count';
  END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v2 jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps\n2026-08-10,Squat,5\n';
  v_other text := E'Date,Exercise,Reps\n2026-08-11,Squat,6\n';
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'bound.csv', v_csv, v_map, 'bound-key'
  );
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000008', 'bound.csv', v_csv, v_map, 'bound-key'
    );
    RAISE EXCEPTION 'idempotency key recycled for another subject';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'import_conflict' THEN RAISE; END IF;
  END;
  v2 := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'bound.csv', v_csv,
    jsonb_set(v_map, '{ignored}', '[9]'), 'bound-key'
  );
  IF v2->>'import_id' IS DISTINCT FROM v->>'import_id' THEN
    RAISE EXCEPTION 'same subject preview refused a mapping correction';
  END IF;
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000002', 'bound.csv', v_other, v_map, 'bound-key'
    );
    RAISE EXCEPTION 'file change on key accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'file_changed' THEN RAISE; END IF;
  END;
  v := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', jsonb_set(v_map, '{ignored}', '[9]'));
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000002', 'bound.csv', v_csv, v_map, 'bound-key'
    );
    RAISE EXCEPTION 'committed key accepted a different mapping';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'import_conflict' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE
  v jsonb;
  page jsonb;
  v_id uuid;
  src text;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
BEGIN
  SELECT 'Date,Exercise,Reps' || E'\n' || string_agg(
    CASE WHEN g = 1437 THEN '2026-05-01,,5' ELSE '2026-05-01,Squat,5' END,
    E'\n' ORDER BY g
  ) INTO src
  FROM generate_series(1, 2000) g;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002', 'long.csv', src, v_map, 'long-errors'
  );
  v_id := (v->>'import_id')::uuid;
  IF (v->>'row_count')::int <> 2000 OR (v->>'error_count')::int <> 1 THEN
    RAISE EXCEPTION 'long file counts %', v;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 1437
  ) THEN RAISE EXCEPTION 'compact preview included row 1437'; END IF;
  page := public.get_coach_import(v_id, 0, 50, true);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(page->'rows') e
    WHERE (e->>'row_no')::int = 1437 AND e->>'error_code' = 'exercise_required'
  ) THEN RAISE EXCEPTION 'errors page missed row 1437 %', page->'rows'; END IF;
  page := public.get_coach_import(v_id, 1400, 50, false);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(page->'rows') e WHERE (e->>'row_no')::int = 1437
  ) THEN RAISE EXCEPTION 'offset page missed row 1437'; END IF;
END $$;

DO $$
DECLARE
  v_id uuid;
  n int;
BEGIN
  SELECT id INTO v_id FROM public.coach_imports
  WHERE idempotency_key = 'sets-ok' AND coach_id = auth.uid();
  IF public.get_coach_import(v_id)->>'import_id' IS NULL THEN
    RAISE EXCEPTION 'active coach could not read client import';
  END IF;
  SELECT count(*) INTO n FROM public.coach_import_rows r
  JOIN public.coach_imports i ON i.id = r.import_id
  WHERE i.subject_user_id = 'c5100000-0000-4000-8000-000000000002';
  IF n < 1 THEN RAISE EXCEPTION 'active coach could not read provenance rows'; END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps,Weight\n2026-02-02,Bench,5,60\n';
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000002',
    'leave.csv',
    v_csv,
    v_map,
    'leave-client'
  );
  INSERT INTO p51_hold(import_id, sha, map)
  VALUES ((v->>'import_id')::uuid, v->>'file_sha256', v_map);
END $$;

RESET ROLE;
UPDATE public.coach_client_links
   SET status = 'ended'
 WHERE coach_id = 'c5100000-0000-4000-8000-000000000001'
   AND client_id = 'c5100000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000001');
DO $$
DECLARE
  h p51_hold;
BEGIN
  SELECT * INTO h FROM p51_hold;
  BEGIN
    PERFORM public.commit_coach_import(h.import_id, h.sha, h.map);
    RAISE EXCEPTION 'commit after client left';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_your_client' THEN RAISE; END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id = 'c5100000-0000-4000-8000-000000000002' AND name = '2026-02-02'
  ) THEN
    RAISE EXCEPTION 'left-client commit wrote a workout';
  END IF;
END $$;

SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.coach_imports
    WHERE coach_id = 'c5100000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'coach B saw coach A imports';
  END IF;
END $$;

SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000001');
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.coach_imports
  WHERE subject_user_id = 'c5100000-0000-4000-8000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'former coach still sees client imports'; END IF;
  SELECT count(*) INTO n FROM public.coach_import_rows r
  WHERE EXISTS (
    SELECT 1 FROM public.coach_imports i
    WHERE i.id = r.import_id
      AND i.subject_user_id = 'c5100000-0000-4000-8000-000000000002'
  );
  IF n <> 0 THEN RAISE EXCEPTION 'former coach still sees client provenance rows'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_imports
    WHERE subject_user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'self import hidden after another relationship ended'; END IF;
END $$;

RESET ROLE;
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.coach_imports WHERE idempotency_key = 'sets-ok';
  IF v_id IS NULL THEN RAISE EXCEPTION 'provenance row deleted on relationship end'; END IF;
  INSERT INTO p51_hold(import_id, sha, map)
  VALUES (v_id, repeat('c', 64), '{}'::jsonb);
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_id uuid;
  listed jsonb;
BEGIN
  SELECT import_id INTO v_id FROM p51_hold WHERE sha = repeat('c', 64);
  BEGIN
    PERFORM public.get_coach_import(v_id);
    RAISE EXCEPTION 'get_coach_import still returned a former client import';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_found' THEN RAISE; END IF;
  END;
  listed := public.list_coach_imports();
  IF listed @> jsonb_build_array(jsonb_build_object('import_id', v_id)) THEN
    RAISE EXCEPTION 'list_coach_imports still lists a former client import';
  END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000006');
DO $$
DECLARE
  v jsonb;
  sha text;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000007', 'survive.csv',
    E'Date,Exercise,Reps,Weight\n2026-09-01,Deadlift,3,140\n',
    v_map, 'survive-delete'
  );
  sha := v->>'file_sha256';
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, sha, v_map);
  INSERT INTO p51_hold(import_id, sha, map)
  VALUES ((v->>'import_id')::uuid, 'survive-marker', v_map);
END $$;

RESET ROLE;
DO $$
DECLARE
  v_id uuid;
  n int;
  v_ref text := 'user:c5100000-0000-4000-8000-000000000006';
BEGIN
  SELECT import_id INTO v_id FROM p51_hold WHERE sha = 'survive-marker';
  IF NOT EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id = 'c5100000-0000-4000-8000-000000000007' AND name = '2026-09-01'
  ) THEN RAISE EXCEPTION 'client workout missing before coach delete'; END IF;
  DELETE FROM auth.identities WHERE user_id = 'c5100000-0000-4000-8000-000000000006';
  DELETE FROM public.user_profiles WHERE id = 'c5100000-0000-4000-8000-000000000006';
  DELETE FROM auth.users WHERE id = 'c5100000-0000-4000-8000-000000000006';
  IF NOT EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id = 'c5100000-0000-4000-8000-000000000007' AND name = '2026-09-01'
  ) THEN RAISE EXCEPTION 'coach delete removed client workouts'; END IF;
  SELECT count(*) INTO n FROM public.coach_imports
  WHERE id = v_id AND coach_id IS NULL AND coach_ref = v_ref
    AND subject_user_id = 'c5100000-0000-4000-8000-000000000007';
  IF n <> 1 THEN RAISE EXCEPTION 'provenance not interpretable after coach delete'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_import_rows WHERE import_id = v_id AND raw IS NOT NULL
  ) THEN RAISE EXCEPTION 'provenance rows lost after coach delete'; END IF;
  INSERT INTO p51_hold(import_id, sha, map) VALUES (v_id, repeat('d', 64), '{}'::jsonb);
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000006');
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT import_id INTO v_id FROM p51_hold WHERE sha = repeat('d', 64);
  IF EXISTS (SELECT 1 FROM public.coach_imports WHERE id = v_id) THEN
    RAISE EXCEPTION 'deleted coach account can still read provenance';
  END IF;
  BEGIN
    PERFORM public.get_coach_import(v_id);
    RAISE EXCEPTION 'deleted coach get_coach_import leaked provenance';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_found' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000003');

DO $$
DECLARE
  v jsonb;
  row jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"exercise_load":2,"unit":3},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Weight,Unit\n2026-09-15,Bench,225,lb\n2026-09-15,Squat,100,\n2026-09-15,Row,10,stone\n';
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'unit.csv', v_csv, v_map, 'unit-column'
  );
  SELECT e INTO row FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 1;
  IF (row->'planned'->>'load_kg')::numeric IS DISTINCT FROM 102.06
     OR row->'planned'->>'source_unit' IS DISTINCT FROM 'lb' THEN
    RAISE EXCEPTION 'unit column ignored %', row;
  END IF;
  SELECT e INTO row FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 2;
  IF (row->'planned'->>'load_kg')::numeric IS DISTINCT FROM 100
     OR row->'planned'->>'source_unit' IS DISTINCT FROM 'kg' THEN
    RAISE EXCEPTION 'blank unit did not use kg %', row;
  END IF;
  SELECT e INTO row FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 3;
  IF row->>'error_code' IS DISTINCT FROM 'invalid_unit' THEN
    RAISE EXCEPTION 'invalid unit accepted %', row;
  END IF;
  IF (v->>'ready_count')::int <> 2 THEN RAISE EXCEPTION 'unit file ready %', v->>'ready_count'; END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"convert_to_rir","columns":{"date":0,"exercise":1,"rir":2,"rpe":3},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,RIR,RPE\n2026-09-16,Bench,3,8\n';
BEGIN
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000004', 'effort.csv', v_csv, v_map, 'effort-missing'
    );
    RAISE EXCEPTION 'rir and rpe converted without a choice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rir_rpe_conflict' THEN RAISE; END IF;
  END;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'effort.csv', v_csv,
    jsonb_set(v_map, '{effort_source}', '"rir"'), 'effort-rir'
  );
  IF (v->'rows'->0->'planned'->>'rir')::int IS DISTINCT FROM 3
     OR position('RPE 8' IN coalesce(v->'rows'->0->'planned'->>'notes', '')) = 0 THEN
    RAISE EXCEPTION 'explicit RIR was replaced %', v->'rows'->0;
  END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'effort-rpe.csv', v_csv,
    jsonb_set(v_map, '{effort_source}', '"rpe"'), 'effort-rpe'
  );
  IF (v->'rows'->0->'planned'->>'rir')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'chosen RPE was not converted %', v->'rows'->0;
  END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'effort-notes.csv', v_csv,
    jsonb_set(v_map, '{rpe_mode}', '"notes"'), 'effort-notes'
  );
  IF (v->'rows'->0->'planned'->>'rir')::int IS DISTINCT FROM 3
     OR position('RPE 8' IN coalesce(v->'rows'->0->'planned'->>'notes', '')) = 0 THEN
    RAISE EXCEPTION 'notes mode dropped RIR or RPE %', v->'rows'->0;
  END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  n int;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
  v_file text := E'Date,Exercise,Reps\n2026-10-01,Bench,5\n';
  v_overlap text := E'Date,Exercise,Reps\n2026-10-01,Bench,8\n';
  v_other text := E'Date,Session,Exercise,Reps\n2026-10-01,Evening,Row,6\n';
  v_other_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"session_name":1,"exercise":2,"reps":3},"ignored":[]}'::jsonb;
  v_acked jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'source-a.csv', v_file, v_map, 'source-a'
  );
  v := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'first source commit %', v->>'status'; END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'source-a.csv', v_file, v_map, 'source-a-again'
  );
  IF v->>'status' <> 'committed' THEN
    RAISE EXCEPTION 'same source opened another preview %', v->>'status';
  END IF;
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000004', 'source-a.csv', v_file,
      jsonb_set(v_map, '{ignored}', '[9]'), 'source-a-remap'
    );
    RAISE EXCEPTION 'committed source accepted another mapping';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'already_imported' THEN RAISE; END IF;
  END;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'source-b.csv', v_overlap, v_map, 'source-b'
  );
  IF NOT (v->'issues' ? 'potential_duplicate') THEN
    RAISE EXCEPTION 'overlap was silent %', v->'issues';
  END IF;
  BEGIN
    PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
    RAISE EXCEPTION 'overlap committed without confirmation';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'potential_duplicate' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.workouts
  WHERE user_id = 'c5100000-0000-4000-8000-000000000004';
  IF n <> 1 THEN RAISE EXCEPTION 'unacked overlap wrote workouts %', n; END IF;
  v_acked := jsonb_set(v_map, '{acknowledge_duplicates}', 'true');
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'source-b.csv', v_overlap, v_acked, 'source-b'
  );
  IF v->'issues' ? 'potential_duplicate' THEN
    RAISE EXCEPTION 'acknowledgement still blocked %', v->'issues';
  END IF;
  IF jsonb_array_length(v->'potential_duplicates') < 1 THEN
    RAISE EXCEPTION 'acknowledgement hid the existing session';
  END IF;
  v := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_acked);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'acked overlap status %', v->>'status'; END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000004', 'source-c.csv', v_other, v_other_map, 'source-c'
  );
  IF v->'issues' ? 'potential_duplicate' THEN
    RAISE EXCEPTION 'distinct same-day session flagged %', v->'issues';
  END IF;
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_other_map);
  SELECT count(*) INTO n FROM public.workouts
  WHERE user_id = 'c5100000-0000-4000-8000-000000000004';
  IF n <> 3 THEN RAISE EXCEPTION 'session count %', n; END IF;
  INSERT INTO p51_hold(import_id, sha, map) VALUES (NULL, 'source-a-body', to_jsonb(v_file));
END $$;

RESET ROLE;
UPDATE public.coach_client_links
   SET status = 'ended'
 WHERE coach_id = 'c5100000-0000-4000-8000-000000000003'
   AND client_id = 'c5100000-0000-4000-8000-000000000004';
INSERT INTO public.coach_client_links(coach_id, client_id, status)
VALUES ('c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000004', 'active');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_file text;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
  n int;
BEGIN
  SELECT map #>> '{}' INTO v_file FROM p51_hold WHERE sha = 'source-a-body';
  BEGIN
    PERFORM public.preview_coach_import(
      'c5100000-0000-4000-8000-000000000004', 'source-a.csv', v_file, v_map, 'source-a-new-coach'
    );
    RAISE EXCEPTION 'new coach reimported the same source';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'already_imported' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.workouts
  WHERE user_id = 'c5100000-0000-4000-8000-000000000004' AND name = '2026-10-01';
  IF n <> 2 THEN RAISE EXCEPTION 'new coach changed workout count %', n; END IF;
END $$;

SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  n int;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000003', 'cancel.csv',
    E'Date,Exercise\n2026-11-01,Press\n', v_map, 'cancel-me'
  );
  v_id := (v->>'import_id')::uuid;
  v := public.cancel_coach_import(v_id);
  IF v->>'status' <> 'cancelled' THEN RAISE EXCEPTION 'cancel status %', v->>'status'; END IF;
  SELECT count(*) INTO n FROM public.coach_import_rows WHERE import_id = v_id;
  IF n <> 0 THEN RAISE EXCEPTION 'cancel kept raw rows %', n; END IF;
  INSERT INTO p51_hold(import_id, sha, map) VALUES (v_id, 'cancel-marker', '{}'::jsonb);
END $$;

SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT import_id INTO v_id FROM p51_hold WHERE sha = 'cancel-marker';
  BEGIN
    PERFORM public.cancel_coach_import(v_id);
    RAISE EXCEPTION 'other coach cancelled the preview';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_found' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000003', 'stale.csv',
    E'Date,Exercise\n2026-11-02,Press\n', v_map, 'stale-preview'
  );
  INSERT INTO p51_hold(import_id, sha, map)
  VALUES ((v->>'import_id')::uuid, 'stale-marker', '{}'::jsonb);
END $$;

RESET ROLE;
UPDATE public.coach_imports
   SET created_at = clock_timestamp() - interval '8 days'
 WHERE id = (SELECT import_id FROM p51_hold WHERE sha = 'stale-marker');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_id uuid;
  n int;
  v_status text;
BEGIN
  SELECT import_id INTO v_id FROM p51_hold WHERE sha = 'stale-marker';
  PERFORM public.list_coach_imports();
  SELECT status INTO v_status FROM public.coach_imports WHERE id = v_id;
  SELECT count(*) INTO n FROM public.coach_import_rows WHERE import_id = v_id;
  IF v_status IS DISTINCT FROM 'cancelled' OR n <> 0 THEN
    RAISE EXCEPTION 'stale preview status % rows %', v_status, n;
  END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  row jsonb;
  v_load jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"exercise_load":2,"unit":3},"ignored":[]}'::jsonb;
  v_body jsonb := '{"kind":"body_weight","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"body_weight":1,"unit":2},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000003', 'lb-load.csv',
    E'Date,Exercise,Weight,Unit\n2026-09-22,Bench,3000,lb\n2026-09-22,Squat,5000,lb\n',
    v_load, 'lb-load'
  );
  SELECT e INTO row FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 1;
  IF row->>'status' IS DISTINCT FROM 'ready'
     OR (row->'planned'->>'load_kg')::numeric IS DISTINCT FROM 1360.78 THEN
    RAISE EXCEPTION '3000 lb was not converted before the cap %', row;
  END IF;
  SELECT e INTO row FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 2;
  IF row->>'error_code' IS DISTINCT FROM 'invalid_number' THEN
    RAISE EXCEPTION '5000 lb stayed under the kg cap %', row;
  END IF;
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000003', 'lb-body.csv',
    E'Date,Weight,Unit\n2026-09-20,501,lb\n2026-09-21,1103,lb\n',
    v_body, 'lb-body'
  );
  SELECT e INTO row FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 1;
  IF row->>'status' IS DISTINCT FROM 'ready'
     OR (row->'planned'->>'body_weight_kg')::numeric IS DISTINCT FROM 227.25 THEN
    RAISE EXCEPTION '501 lb was rejected before conversion %', row;
  END IF;
  SELECT e INTO row FROM jsonb_array_elements(v->'rows') e WHERE (e->>'row_no')::int = 2;
  IF row->>'error_code' IS DISTINCT FROM 'invalid_number' THEN
    RAISE EXCEPTION '1103 lb was accepted as body weight %', row;
  END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","acknowledge_duplicates":true,"columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000003', 'ack.csv',
    E'Date,Exercise\n2026-06-20,Press\n', v_map, 'ack-snapshot'
  );
  INSERT INTO p51_hold(import_id, sha, map)
  VALUES ((v->>'import_id')::uuid, v->>'file_sha256', v_map || '{"marker":"ack-snapshot"}'::jsonb);
END $$;

RESET ROLE;
INSERT INTO public.workouts(user_id, name, date, completed, notes)
VALUES (
  'c5100000-0000-4000-8000-000000000003',
  'Other',
  (timestamp '2026-06-20 12:00:00' AT TIME ZONE 'UTC'),
  true,
  ''
);
INSERT INTO public.workout_exercises(workout_id, name, order_index, notes)
SELECT id, 'Press', 1, ''
FROM public.workouts
WHERE user_id = 'c5100000-0000-4000-8000-000000000003'
  AND name = 'Other';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000003');
DO $$
DECLARE
  h p51_hold;
  n int;
BEGIN
  SELECT * INTO h FROM p51_hold WHERE map->>'marker' = 'ack-snapshot';
  BEGIN
    PERFORM public.commit_coach_import(h.import_id, h.sha, h.map);
    RAISE EXCEPTION 'ack committed a duplicate that was not in the preview';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'duplicates_changed' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.workouts
  WHERE user_id = 'c5100000-0000-4000-8000-000000000003' AND name = 'Other';
  IF n <> 1 THEN RAISE EXCEPTION 'changed duplicate list wrote % workouts', n; END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000003', 'purge.csv',
    E'Date,Exercise\n2026-11-03,Press\n', v_map, 'purge-me'
  );
  INSERT INTO p51_hold(import_id, sha, map)
  VALUES ((v->>'import_id')::uuid, 'purge-marker', '{}'::jsonb);
END $$;

RESET ROLE;
UPDATE public.coach_imports
   SET created_at = clock_timestamp() - interval '8 days'
 WHERE id = (SELECT import_id FROM p51_hold WHERE sha = 'purge-marker');
SELECT public.coach_import_purge_stale_previews();

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5100000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_id uuid;
  n int;
  v_status text;
BEGIN
  SELECT import_id INTO v_id FROM p51_hold WHERE sha = 'purge-marker';
  SELECT status INTO v_status FROM public.coach_imports WHERE id = v_id;
  SELECT count(*) INTO n FROM public.coach_import_rows WHERE import_id = v_id;
  IF v_status IS DISTINCT FROM 'cancelled' OR n <> 0 THEN
    RAISE EXCEPTION 'hourly purge left status % rows %', v_status, n;
  END IF;
END $$;

DO $$
DECLARE
  i int;
  v_hit boolean := false;
  v_id uuid;
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1},"ignored":[]}'::jsonb;
BEGIN
  FOR i IN 1..25 LOOP
    BEGIN
      PERFORM public.preview_coach_import(
        'c5100000-0000-4000-8000-000000000003',
        'quota-' || i::text || '.csv',
        'Date,Exercise' || E'\n' || '2026-12-01,Quota' || i::text,
        v_map,
        'quota-' || i::text
      );
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'preview_quota' THEN
        v_hit := true;
        EXIT;
      END IF;
      RAISE;
    END;
  END LOOP;
  IF NOT v_hit THEN RAISE EXCEPTION 'preview quota was not enforced'; END IF;
  SELECT id INTO v_id FROM public.coach_imports
  WHERE coach_id = auth.uid() AND status = 'previewed'
  ORDER BY created_at DESC
  LIMIT 1;
  PERFORM public.cancel_coach_import(v_id);
  v := public.preview_coach_import(
    'c5100000-0000-4000-8000-000000000003', 'quota-after.csv',
    E'Date,Exercise\n2026-12-02,AfterQuota\n', v_map, 'quota-after'
  );
  IF v->>'status' IS DISTINCT FROM 'previewed' THEN
    RAISE EXCEPTION 'quota did not free a slot %', v->>'status';
  END IF;
END $$;

RESET ROLE;
SELECT 'p5.1 csv import: preview no business write, commit atomic, is_coach_of, retry, no silent Weight' AS result;

ROLLBACK;
