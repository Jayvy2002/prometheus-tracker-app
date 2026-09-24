-- P5.2 provisional dossier: no Auth user, no coach_client_links until coaching consent,
-- import stays provisional, claim is atomic and idempotent.
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
 ('c5300000-0000-4000-8000-000000000001', 'p52-coach-a@example.test'),
 ('c5300000-0000-4000-8000-000000000002', 'p52-athlete@example.test'),
 ('c5300000-0000-4000-8000-000000000003', 'p52-other@example.test'),
 ('c5300000-0000-4000-8000-000000000004', 'p52-coach-b@example.test'),
 ('c5300000-0000-4000-8000-000000000005', 'p52-solo-coach@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c5300000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c5300000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c5300000-0000-4000-8000-000000000003', 'free', 'none'),
 ('c5300000-0000-4000-8000-000000000004', 'free', 'coach'),
 ('c5300000-0000-4000-8000-000000000005', 'free', 'coach')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
INSERT INTO public.coach_client_links(coach_id, client_id, status) VALUES
 ('c5300000-0000-4000-8000-000000000004', 'c5300000-0000-4000-8000-000000000005', 'active');

CREATE TEMP TABLE p52_auth_before AS SELECT id FROM auth.users;

DO $$ BEGIN
  IF NOT has_function_privilege('authenticated', 'public.create_provisional_dossier(text)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.preview_provisional_import(uuid,text,text,jsonb,text)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.preview_coach_import(uuid,text,text,jsonb,text)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.confirm_provisional_claim(text,boolean,boolean,text,boolean)', 'execute')
     OR to_regprocedure('public.confirm_provisional_claim(text,boolean,boolean)') IS NOT NULL
     OR has_function_privilege('authenticated', 'public.lock_coach_import_provisional(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.coach_import_assert_dossier(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.preview_coach_import(uuid,text,text,jsonb,text,uuid)', 'execute')
     OR has_function_privilege('anon', 'public.create_provisional_dossier(text)', 'execute')
     OR has_table_privilege('authenticated', 'public.coach_provisional_dossiers', 'insert')
     OR has_table_privilege('authenticated', 'public.coach_provisional_workouts', 'insert')
  THEN
    RAISE EXCEPTION 'p5.2 grants mismatch';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000002');
DO $$ BEGIN
  BEGIN
    PERFORM public.create_provisional_dossier('No coach');
    RAISE EXCEPTION 'athlete created a dossier';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coach_capability_required' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps\n2026-09-24,Deadlift,5\n';
  sha text;
  token text;
BEGIN
  v := public.create_provisional_dossier('Alex');
  v_id := (v->>'id')::uuid;
  v := public.preview_provisional_import(v_id, 'deadlift.csv', v_csv, v_map, 'p52-preview');
  IF (v->>'ready_count')::int <> 1 THEN RAISE EXCEPTION 'ready %', v->>'ready_count'; END IF;
  IF (SELECT count(*) FROM public.coach_provisional_workouts WHERE dossier_id = v_id) <> 0 THEN
    RAISE EXCEPTION 'preview wrote provisional workouts';
  END IF;
  sha := v->>'file_sha256';
  v := public.commit_coach_import((v->>'import_id')::uuid, sha, v_map);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'status %', v->>'status'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id IN (
      'c5300000-0000-4000-8000-000000000001',
      'c5300000-0000-4000-8000-000000000002'
    )
  ) THEN RAISE EXCEPTION 'commit wrote a real workout'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.weight_measurements
    WHERE user_id = 'c5300000-0000-4000-8000-000000000002'
  ) THEN RAISE EXCEPTION 'commit wrote a weight'; END IF;
  IF (SELECT count(*) FROM public.coach_provisional_workouts WHERE dossier_id = v_id) <> 1 THEN
    RAISE EXCEPTION 'provisional workout missing';
  END IF;
  v := public.commit_coach_import((v->>'import_id')::uuid, sha, v_map);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'retry status %', v->>'status'; END IF;

  v := public.preview_provisional_import(v_id, 'deadlift.csv', v_csv, v_map, 'p52-again');
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'same source status %', v->>'status'; END IF;
  v_map := jsonb_set(v_map, '{load_unit}', '"lb"');
  BEGIN
    PERFORM public.preview_provisional_import(v_id, 'deadlift.csv', v_csv, v_map, 'p52-remap');
    RAISE EXCEPTION 'different mapping of a committed file was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'already_imported' THEN RAISE; END IF;
  END;
  v_map := jsonb_set(v_map, '{load_unit}', '"kg"');

  v := public.invite_provisional_dossier(v_id, 'P52-Athlete@example.test');
  token := v->>'token';
  IF token IS NULL OR char_length(token) < 32 THEN RAISE EXCEPTION 'token missing'; END IF;
  PERFORM set_config('p52.token', token, true);
  PERFORM set_config('p52.dossier', v_id::text, true);
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_provisional_claim(current_setting('p52.token'));
    RAISE EXCEPTION 'wrong email saw the dossier';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invite_email_mismatch' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v jsonb;
  n int;
BEGIN
  BEGIN
    PERFORM public.confirm_provisional_claim(current_setting('p52.token'), false, false, NULL, false);
    RAISE EXCEPTION 'unconfirmed claim wrote data';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'confirmation_required' THEN RAISE; END IF;
  END;
  v := public.preview_provisional_claim(current_setting('p52.token'));
  IF (v->>'workout_count')::int <> 1 THEN RAISE EXCEPTION 'preview count %', v->>'workout_count'; END IF;
  IF v->'sessions'->0->'exercises'->>0 <> 'Deadlift' THEN RAISE EXCEPTION 'preview name %', v->'sessions'; END IF;
  IF v->'sessions'->0->>'date' <> '2026-09-24' THEN RAISE EXCEPTION 'preview date %', v->'sessions'; END IF;
  v := public.confirm_provisional_claim(current_setting('p52.token'), true, false, v->>'revision', false);
  IF (v->>'workout_count')::int <> 1 THEN RAISE EXCEPTION 'claim count %', v->>'workout_count'; END IF;
  IF v->>'coaching_status' <> 'not_requested' THEN RAISE EXCEPTION 'coaching %', v->>'coaching_status'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = 'c5300000-0000-4000-8000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'athlete workouts %', n; END IF;
  IF (SELECT count(*) FROM public.coach_client_links WHERE client_id = 'c5300000-0000-4000-8000-000000000002') <> 0 THEN
    RAISE EXCEPTION 'claim created a link without consent';
  END IF;
  v := public.confirm_provisional_claim(current_setting('p52.token'), true, true, NULL, false);
  IF (v->>'already_attached')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'retry not idempotent'; END IF;
  SELECT count(*) INTO n FROM public.workouts WHERE user_id = 'c5300000-0000-4000-8000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'retry duplicated workouts %', n; END IF;
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_id uuid := current_setting('p52.dossier')::uuid;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
BEGIN
  BEGIN
    PERFORM public.preview_provisional_import(v_id, 'more.csv', E'Date,Exercise,Reps\n2026-09-25,Squat,5\n', v_map, 'p52-more');
    RAISE EXCEPTION 'attached dossier accepted an import';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'dossier_closed' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.delete_provisional_dossier(v_id);
    RAISE EXCEPTION 'attached dossier deleted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'dossier_attached' THEN RAISE; END IF;
  END;
END $$;

-- Second coach, same athlete email, explicit coaching consent, then a rival.
SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps\n2026-09-26,Bench,8\n';
BEGIN
  v := public.create_provisional_dossier('Sam');
  v_id := (v->>'id')::uuid;
  v := public.preview_provisional_import(v_id, 'bench.csv', v_csv, v_map, 'p52-bench');
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  v := public.invite_provisional_dossier(v_id, 'p52-athlete@example.test');
  PERFORM set_config('p52.token_b', v->>'token', true);
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.preview_provisional_claim(current_setting('p52.token_b'));
  v := public.confirm_provisional_claim(current_setting('p52.token_b'), true, true, v->>'revision', false);
  IF v->>'coaching_status' <> 'active' THEN RAISE EXCEPTION 'coaching status %', v->>'coaching_status'; END IF;
  IF (SELECT count(*) FROM public.coach_client_links WHERE coach_id = 'c5300000-0000-4000-8000-000000000004' AND client_id = 'c5300000-0000-4000-8000-000000000002' AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'consent did not activate the link';
  END IF;
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Exercise,Reps\n2026-09-27,Row,8\n';
BEGIN
  v := public.create_provisional_dossier('Rival');
  v_id := (v->>'id')::uuid;
  v := public.preview_provisional_import(v_id, 'row.csv', v_csv, v_map, 'p52-row');
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  v := public.invite_provisional_dossier(v_id, 'p52-athlete@example.test');
  PERFORM set_config('p52.token_c', v->>'token', true);
  v := public.create_provisional_dossier('Later');
  v := public.invite_provisional_dossier((v->>'id')::uuid, 'p52-athlete@example.test');
  PERFORM set_config('p52.revoked_token', v->>'token', true);
  PERFORM public.revoke_provisional_invite((v->>'dossier_id')::uuid);
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000002');
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_provisional_claim(current_setting('p52.revoked_token'));
    RAISE EXCEPTION 'revoked invite previewed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invite_revoked' THEN RAISE; END IF;
  END;
END $$;

-- Revocation is checked by status, not by replaying the raw token. Expire a fresh invite.
SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000005');
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.create_provisional_dossier('Expire me');
  v := public.invite_provisional_dossier((v->>'id')::uuid, 'p52-other@example.test');
  PERFORM set_config('p52.expire_token', v->>'token', true);
  PERFORM set_config('p52.expire_dossier', v->>'dossier_id', true);
END $$;

RESET ROLE;
UPDATE public.coach_provisional_invites
   SET expires_at = clock_timestamp() - interval '1 minute'
 WHERE dossier_id = current_setting('p52.expire_dossier')::uuid
   AND status = 'pending';
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_provisional_claim(current_setting('p52.expire_token'));
    RAISE EXCEPTION 'expired invite previewed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invite_expired' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v jsonb;
  n int;
BEGIN
  v := public.preview_provisional_claim(current_setting('p52.token_c'));
  v := public.confirm_provisional_claim(current_setting('p52.token_c'), true, true, v->>'revision', false);
  IF v->>'coaching_status' <> 'already_coached' THEN RAISE EXCEPTION 'rival coaching %', v->>'coaching_status'; END IF;
  SELECT count(*) INTO n
  FROM public.workout_exercises e
  JOIN public.workouts w ON w.id = e.workout_id
  WHERE w.user_id = 'c5300000-0000-4000-8000-000000000002'
    AND e.name = 'Row';
  IF n <> 1 THEN RAISE EXCEPTION 'rival data not attached %', n; END IF;
  IF (SELECT status FROM public.coach_client_links WHERE coach_id = 'c5300000-0000-4000-8000-000000000004' AND client_id = 'c5300000-0000-4000-8000-000000000002') <> 'active' THEN
    RAISE EXCEPTION 'rival replaced the active coach';
  END IF;
END $$;

-- An existing weigh-in is kept. Changing the account email refuses the preview.
RESET ROLE;
INSERT INTO public.weight_measurements (user_id, weight_kg, measured_at, notes)
VALUES ('c5300000-0000-4000-8000-000000000003', 80, '2026-09-28', 'existing');
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  v_map jsonb := '{"kind":"body_weight","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"body_weight":1},"ignored":[]}'::jsonb;
  v_csv text := E'Date,Weight\n2026-09-28,70\n';
BEGIN
  v := public.create_provisional_dossier('Weight');
  v_id := (v->>'id')::uuid;
  v := public.preview_provisional_import(v_id, 'weight.csv', v_csv, v_map, 'p52-weight');
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  v := public.invite_provisional_dossier(v_id, 'p52-other@example.test');
  PERFORM set_config('p52.weight_token', v->>'token', true);
END $$;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.preview_provisional_claim(current_setting('p52.weight_token'));
  IF (v->>'weight_count')::int <> 1 THEN RAISE EXCEPTION 'weight preview %', v->>'weight_count'; END IF;
END $$;

RESET ROLE;
UPDATE auth.users
   SET email = 'p52-other-changed@example.test'
 WHERE id = 'c5300000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_provisional_claim(current_setting('p52.weight_token'));
    RAISE EXCEPTION 'changed email saw the dossier';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invite_email_mismatch' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
UPDATE auth.users
   SET email = 'p52-other@example.test'
 WHERE id = 'c5300000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v jsonb;
  kg numeric;
BEGIN
  v := public.preview_provisional_claim(current_setting('p52.weight_token'));
  v := public.confirm_provisional_claim(current_setting('p52.weight_token'), true, false, v->>'revision', true);
  IF (v->>'skipped_weight_count')::int <> 1 OR (v->>'weight_count')::int <> 0 THEN
    RAISE EXCEPTION 'weight collision %', v;
  END IF;
  SELECT weight_kg INTO kg
  FROM public.weight_measurements
  WHERE user_id = 'c5300000-0000-4000-8000-000000000003'
    AND measured_at = '2026-09-28';
  IF kg <> 80 THEN RAISE EXCEPTION 'existing weight overwritten %', kg; END IF;
END $$;

-- Coach who is themselves coached can still prepare a dossier.
SELECT pg_temp.as_user('c5300000-0000-4000-8000-000000000005');
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.create_provisional_dossier('Own prep');
  IF v->>'status' <> 'preparing' THEN RAISE EXCEPTION 'coached coach dossier %', v; END IF;
  PERFORM public.delete_provisional_dossier((v->>'id')::uuid);
  IF EXISTS (SELECT 1 FROM public.coach_provisional_dossiers WHERE id = (v->>'id')::uuid) THEN
    RAISE EXCEPTION 'delete left the dossier';
  END IF;
END $$;

RESET ROLE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM p52_auth_before b WHERE b.id = u.id)
  ) THEN
    RAISE EXCEPTION 'an auth user was created';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE coach_id = 'c5300000-0000-4000-8000-000000000001'
      AND client_id = 'c5300000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'coach A gained a link without being the consented coach';
  END IF;
END $$;

SELECT 'p5.2 provisional dossier: no auth user, provisional rows, claim atomic, no active link without consent' AS result;

ROLLBACK;
