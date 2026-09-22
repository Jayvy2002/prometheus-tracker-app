-- P5.1 Coach CSV import: preview is not a business write; commit is atomic and coach-scoped.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE p51_hold (import_id uuid, sha text, map jsonb);

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
 ('c5100000-0000-4000-8000-000000000005', 'p51-former-a@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c5100000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c5100000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c5100000-0000-4000-8000-000000000003', 'free', 'coach'),
 ('c5100000-0000-4000-8000-000000000004', 'free', 'none'),
 ('c5100000-0000-4000-8000-000000000005', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
INSERT INTO public.coach_client_links(coach_id, client_id, status) VALUES
 ('c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000002', 'active'),
 ('c5100000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000004', 'active'),
 ('c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000005', 'ended');

DO $$ BEGIN
  IF NOT has_function_privilege('authenticated', 'public.preview_coach_import(uuid,text,text,jsonb,text)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.commit_coach_import(uuid,text,jsonb)', 'execute')
     OR has_function_privilege('authenticated', 'public.lock_coach_import(uuid)', 'execute')
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

RESET ROLE;
SELECT 'p5.1 csv import: preview no business write, commit atomic, is_coach_of, retry, no silent Weight' AS result;

ROLLBACK;
