-- Vision §24.1: import CSV « pour moi ». Same engine as the Coach import:
-- preview first, atomic commit, same file never twice. Self needs no Coach
-- capability; anyone else still does.
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

-- 1 Solo, 2 coached athlete, 3 their Coach, 4 stranger.
INSERT INTO auth.users(id, email) VALUES
 ('c7b00000-0000-4000-8000-000000000001', 'c7b-solo@example.test'),
 ('c7b00000-0000-4000-8000-000000000002', 'c7b-athlete@example.test'),
 ('c7b00000-0000-4000-8000-000000000003', 'c7b-coach@example.test'),
 ('c7b00000-0000-4000-8000-000000000004', 'c7b-stranger@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c7b00000-0000-4000-8000-000000000001', 'free', 'none'),
 ('c7b00000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c7b00000-0000-4000-8000-000000000003', 'free', 'coach'),
 ('c7b00000-0000-4000-8000-000000000004', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
INSERT INTO public.coach_client_links(coach_id, client_id, status) VALUES
 ('c7b00000-0000-4000-8000-000000000003', 'c7b00000-0000-4000-8000-000000000002', 'active');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.user_capabilities WHERE user_id = 'c7b00000-0000-4000-8000-000000000001' AND capability = 'coach') THEN
    RAISE EXCEPTION 'fixture: the Solo must not be a Coach';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

-- Solo: preview writes nothing, commit writes their sessions, retry is a no-op.
SELECT pg_temp.as_user('c7b00000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v jsonb;
  v2 jsonb;
  n int;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps,Load\n2026-03-02,Squat,5,100\n2026-03-02,Squat,5,102.5\n2026-03-04,Bench,8,60\n';
BEGIN
  v := public.preview_coach_import(auth.uid(), 'mes-seances.csv', v_csv, v_map, 'solo-sets');
  IF (v->>'ready_count')::int <> 3 THEN RAISE EXCEPTION 'solo ready %, expected 3', v->>'ready_count'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = auth.uid();
  IF n <> 0 THEN RAISE EXCEPTION 'solo preview wrote workouts'; END IF;

  v := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'solo commit status %', v->>'status'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = auth.uid();
  IF n <> 2 THEN RAISE EXCEPTION 'solo workouts %, expected 2 sessions', n; END IF;

  v2 := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = auth.uid();
  IF n <> 2 THEN RAISE EXCEPTION 'solo retry duplicated sessions'; END IF;

  -- The same file again (new key) is never imported twice: the engine
  -- answers with the committed import, or refuses it.
  BEGIN
    v2 := public.preview_coach_import(auth.uid(), 'mes-seances.csv', v_csv, v_map, 'solo-sets-again');
    IF (v2->>'status') = 'previewed' THEN
      v2 := public.commit_coach_import((v2->>'import_id')::uuid, v2->>'file_sha256', v_map);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'already_imported' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = auth.uid();
  IF n <> 2 THEN RAISE EXCEPTION 'same file imported twice (% sessions)', n; END IF;

  -- Own import is readable and listed.
  IF (public.get_coach_import((v->>'import_id')::uuid)->>'status') <> 'committed' THEN
    RAISE EXCEPTION 'solo cannot read own import';
  END IF;
  IF jsonb_array_length(public.list_coach_imports()) < 1 THEN RAISE EXCEPTION 'solo import not listed'; END IF;
  PERFORM set_config('c7b.import', v->>'import_id', true);
END $$;

-- Solo: body weight history lands in their weigh-ins.
DO $$
DECLARE
  v jsonb;
  n int;
  v_map jsonb := '{"kind":"body_weight","delimiter":";","date_format":"dmy","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"body_weight":1},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(auth.uid(), 'poids.csv', E'Date;Poids\n02/03/2026;80,4\n09/03/2026;79,8\n', v_map, 'solo-weight');
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  SELECT count(*) INTO n FROM public.weight_measurements WHERE user_id = auth.uid();
  IF n <> 2 THEN RAISE EXCEPTION 'solo weigh-ins %, expected 2', n; END IF;
END $$;

-- Solo: never for someone else; failure traces are allowed (code only).
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_coach_import(
      'c7b00000-0000-4000-8000-000000000004', 'x.csv', E'Date,Poids\n2026-03-02,80\n',
      '{"kind":"body_weight","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"body_weight":1},"ignored":[]}'::jsonb,
      'solo-other'
    );
    RAISE EXCEPTION 'solo imported for a stranger';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coach_capability_required' THEN RAISE; END IF;
  END;
  IF (public.record_coach_import_incident('workout', 'malformed_csv')->>'status') <> 'recorded' THEN
    RAISE EXCEPTION 'solo incident not recorded';
  END IF;
  BEGIN
    PERFORM public.record_coach_import_incident('workout', 'free text with the csv');
    RAISE EXCEPTION 'free text accepted as incident';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_target' THEN RAISE; END IF;
  END;
END $$;

-- Stranger cannot read the Solo's import.
SELECT pg_temp.as_user('c7b00000-0000-4000-8000-000000000004');
DO $$ BEGIN
  BEGIN
    PERFORM public.get_coach_import(current_setting('c7b.import')::uuid);
    RAISE EXCEPTION 'stranger read solo import';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_found' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.coach_imports WHERE subject_user_id = 'c7b00000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'stranger sees solo import rows';
  END IF;
END $$;

-- Coached athlete imports their own history; their Coach sees the sessions
-- (active relationship) but not the athlete's import job.
SELECT pg_temp.as_user('c7b00000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_coach_import(auth.uid(), 'avant.csv', E'Date,Exercise,Reps\n2026-02-10,Deadlift,3\n', v_map, 'athlete-self');
  v := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'coached athlete self import %', v->>'status'; END IF;
  PERFORM set_config('c7b.athlete_import', v->>'import_id', true);
END $$;

SELECT pg_temp.as_user('c7b00000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workouts WHERE user_id = 'c7b00000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'coach does not see the imported sessions';
  END IF;
  BEGIN
    PERFORM public.get_coach_import(current_setting('c7b.athlete_import')::uuid);
    RAISE EXCEPTION 'coach read the athlete import job';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_found' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
\echo 'personal csv import: solo previews and commits own history, never twice, never for others, coach sees sessions not the job'
