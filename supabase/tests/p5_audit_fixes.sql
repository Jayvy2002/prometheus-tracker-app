-- P5 audit fixes: regression proofs for the contre-expertise F01–F42.
-- BEGIN/ROLLBACK. No durable writes.
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

CREATE FUNCTION pg_temp.as_service() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$;

CREATE FUNCTION pg_temp.clear_jwt() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

INSERT INTO auth.users(id, email) VALUES
 ('c5900000-0000-4000-8000-000000000001', 'p59-coach-a@example.test'),
 ('c5900000-0000-4000-8000-000000000002', 'p59-athlete@example.test'),
 ('c5900000-0000-4000-8000-000000000003', 'p59-op-one@example.test'),
 ('c5900000-0000-4000-8000-000000000004', 'p59-op-two@example.test'),
 ('c5900000-0000-4000-8000-000000000005', 'p59-private@example.test'),
 ('c5900000-0000-4000-8000-000000000006', 'p59-athlete-two@example.test'),
 ('c5900000-0000-4000-8000-000000000007', 'p59-coach-b@example.test'),
 ('c5900000-0000-4000-8000-000000000008', 'p59-op-three@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c5900000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c5900000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c5900000-0000-4000-8000-000000000003', 'free', 'none'),
 ('c5900000-0000-4000-8000-000000000004', 'free', 'none'),
 ('c5900000-0000-4000-8000-000000000005', 'free', 'none'),
 ('c5900000-0000-4000-8000-000000000006', 'free', 'none'),
 ('c5900000-0000-4000-8000-000000000007', 'free', 'coach'),
 ('c5900000-0000-4000-8000-000000000008', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;

-- ---------------------------------------------------------------------------
-- Grants of the new surfaces
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.reserve_ai_usage(uuid,text,integer)', 'execute')
     OR has_function_privilege('authenticated', 'public.resolve_exercise_catalog_as(text,uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.exercise_public_card(uuid,uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.account_deletion_guard()', 'execute')
     OR has_function_privilege('anon', 'public.admin_list_import_incidents(timestamptz,uuid,integer)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.admin_list_import_incidents(timestamptz,uuid,integer)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.record_coach_import_incident(text,text)', 'execute')
     OR has_table_privilege('authenticated', 'public.coach_import_claim_sources', 'select')
     OR has_table_privilege('authenticated', 'public.coach_import_subject_sources', 'select')
     OR has_table_privilege('authenticated', 'public.coach_import_incidents', 'select')
     OR has_table_privilege('authenticated', 'public.platform_operator_departures', 'select')
  THEN
    RAISE EXCEPTION 'p5 audit grants mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass AND tgname = 'account_deletion_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'account_deletion_guard missing on auth.users';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- F42 service_role revoke · F11 last operator · F01 revoked operator deletable
-- ---------------------------------------------------------------------------
DELETE FROM public.platform_operators;
SELECT pg_temp.as_service();
SELECT public.grant_platform_operator('c5900000-0000-4000-8000-000000000003'::uuid, true);
SELECT public.grant_platform_operator('c5900000-0000-4000-8000-000000000004'::uuid, true);
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.admin_revoke_platform_operator('c5900000-0000-4000-8000-000000000004'::uuid, true);
  IF v->>'status' <> 'revoked' THEN RAISE EXCEPTION 'service revoke %', v; END IF;
  BEGIN
    PERFORM public.prepare_account_deletion('c5900000-0000-4000-8000-000000000003'::uuid);
    RAISE EXCEPTION 'last operator passed the preflight';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'last_operator' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_operators
    WHERE user_id = 'c5900000-0000-4000-8000-000000000003' AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'preflight had a side effect';
  END IF;
  v := public.prepare_account_deletion('c5900000-0000-4000-8000-000000000004'::uuid);
  IF (v->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'revoked operator preflight %', v; END IF;
END $$;
SELECT pg_temp.clear_jwt();

-- A revoked operator row no longer blocks the Auth delete.
DELETE FROM auth.users WHERE id = 'c5900000-0000-4000-8000-000000000004';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_operators WHERE user_id = 'c5900000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'revoked operator row survived';
  END IF;
  -- The last active operator cannot be deleted, even directly in Auth.
  BEGIN
    DELETE FROM auth.users WHERE id = 'c5900000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'last operator deleted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'last_operator' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_service();
SELECT public.grant_platform_operator('c5900000-0000-4000-8000-000000000008'::uuid, true);
SELECT pg_temp.clear_jwt();
DELETE FROM auth.users WHERE id = 'c5900000-0000-4000-8000-000000000008';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_operator_departures
    WHERE user_id = 'c5900000-0000-4000-8000-000000000008' AND reason = 'account_deleted'
  ) THEN
    RAISE EXCEPTION 'operator departure not recorded';
  END IF;
  IF (SELECT count(*) FROM public.platform_operators WHERE revoked_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'operator count after deletion';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- F15 set order · F03 revision · F02 access after claim · F27 preview detail
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"set_index":2,"reps":3},"ignored":[]}'::jsonb;
BEGIN
  v := public.create_provisional_dossier('P59 Order');
  v_id := (v->>'id')::uuid;
  v := public.preview_provisional_import(
    v_id, 'order.csv',
    E'Date,Exercise,Set,Reps\n2026-09-24,Deadlift,2,20\n2026-09-24,Deadlift,1,10\n',
    v_map, 'p59-order'
  );
  -- F38: a NULL (or blank) hash on a previewed import is refused, never skipped.
  BEGIN
    PERFORM public.commit_coach_import((v->>'import_id')::uuid, NULL, v_map);
    RAISE EXCEPTION 'NULL hash committed a previewed import';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'file_changed' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.commit_coach_import((v->>'import_id')::uuid, '   ', v_map);
    RAISE EXCEPTION 'blank hash committed a previewed import';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'file_changed' THEN RAISE; END IF;
  END;
  v := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  IF v->>'status' <> 'committed' THEN RAISE EXCEPTION 'order commit %', v; END IF;
  IF (
    SELECT s.reps FROM public.coach_provisional_sets s
    JOIN public.coach_provisional_exercises e ON e.id = s.exercise_id
    JOIN public.coach_provisional_workouts w ON w.id = e.workout_id
    WHERE w.dossier_id = v_id
    ORDER BY s.order_index
    LIMIT 1
  ) <> 10 THEN
    RAISE EXCEPTION 'explicit set_index order lost';
  END IF;
  -- Replay: an already committed import returns its view whatever hash is sent.
  BEGIN
    PERFORM public.commit_coach_import((v->>'import_id')::uuid, NULL, v_map);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'committed import should return its view, got %', SQLERRM;
  END;
  v := public.invite_provisional_dossier(v_id, 'p59-athlete@example.test');
  PERFORM set_config('p59.token', v->>'token', true);
  PERFORM set_config('p59.dossier', v_id::text, true);
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.preview_provisional_claim(current_setting('p59.token'));
  IF char_length(v->>'revision') <> 64 THEN RAISE EXCEPTION 'revision missing %', v; END IF;
  IF jsonb_array_length(v->'sessions'->0->'details'->0->'sets') <> 2 THEN
    RAISE EXCEPTION 'preview hides set detail %', v->'sessions';
  END IF;
  PERFORM set_config('p59.revision', v->>'revision', true);
END $$;

-- The coach changes the dossier after the athlete looked at it.
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
BEGIN
  v := public.preview_provisional_import(
    current_setting('p59.dossier')::uuid, 'late.csv',
    E'Date,Exercise,Reps\n2026-09-25,Squat,5\n', v_map, 'p59-late'
  );
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v jsonb;
BEGIN
  BEGIN
    PERFORM public.confirm_provisional_claim(current_setting('p59.token'), true, false, current_setting('p59.revision'), false);
    RAISE EXCEPTION 'stale revision attached data';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'content_changed' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.confirm_provisional_claim(current_setting('p59.token'), true, false, NULL, false);
    RAISE EXCEPTION 'claim without preview attached data';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'content_changed' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.workouts WHERE user_id = 'c5900000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'refused confirm wrote workouts';
  END IF;
  v := public.preview_provisional_claim(current_setting('p59.token'));
  IF (v->>'workout_count')::int <> 2 THEN RAISE EXCEPTION 'fresh preview %', v->>'workout_count'; END IF;
  v := public.confirm_provisional_claim(current_setting('p59.token'), true, false, v->>'revision', false);
  IF (v->>'workout_count')::int <> 2 THEN RAISE EXCEPTION 'claim copied %', v->>'workout_count'; END IF;
END $$;

-- F02: no coaching consent, so the coach no longer reads the transferred copy.
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.coach_provisional_workouts WHERE dossier_id = current_setting('p59.dossier')::uuid)
     OR EXISTS (SELECT 1 FROM public.coach_provisional_sets)
     OR EXISTS (SELECT 1 FROM public.coach_imports WHERE provisional_dossier_id = current_setting('p59.dossier')::uuid)
     OR EXISTS (
       SELECT 1 FROM public.coach_import_rows r
       JOIN public.coach_imports i ON i.id = r.import_id
       WHERE i.provisional_dossier_id = current_setting('p59.dossier')::uuid
     )
  THEN
    RAISE EXCEPTION 'coach still reads a claimed dossier without coaching';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- F10 claimed bytes cannot be committed again directly · F02 with coaching
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000007');
DO $$
DECLARE
  v jsonb;
  v_id uuid;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'::jsonb;
BEGIN
  v := public.create_provisional_dossier('P59 Dedup');
  v_id := (v->>'id')::uuid;
  v := public.preview_provisional_import(
    v_id, 'history.csv', E'Date,Exercise,Reps\n2026-08-01,Row,8\n', v_map, 'p59-dedup'
  );
  PERFORM public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
  v := public.invite_provisional_dossier(v_id, 'p59-athlete-two@example.test');
  PERFORM set_config('p59.token2', v->>'token', true);
  PERFORM set_config('p59.dossier2', v_id::text, true);
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000006');
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.preview_provisional_claim(current_setting('p59.token2'));
  v := public.confirm_provisional_claim(current_setting('p59.token2'), true, true, v->>'revision', false);
  IF v->>'coaching_status' <> 'active' THEN RAISE EXCEPTION 'coaching %', v->>'coaching_status'; END IF;
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000007');
DO $$
DECLARE
  v jsonb;
  v_map jsonb := '{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[],"acknowledge_duplicates":true}'::jsonb;
  v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.coach_provisional_workouts WHERE dossier_id = current_setting('p59.dossier2')::uuid) THEN
    RAISE EXCEPTION 'active coach lost the claimed copy';
  END IF;
  BEGIN
    v := public.preview_coach_import(
      'c5900000-0000-4000-8000-000000000006'::uuid, 'history.csv',
      E'Date,Exercise,Reps\n2026-08-01,Row,8\n', v_map, 'p59-dedup-direct'
    );
    v := public.commit_coach_import((v->>'import_id')::uuid, v->>'file_sha256', v_map);
    RAISE EXCEPTION 'claimed bytes committed again: %', v->>'status';
  EXCEPTION WHEN OTHERS THEN
    v_code := SQLERRM;
    IF v_code <> 'already_imported' THEN RAISE; END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- F01 athlete deletion after claim · F05 provenance survives the coach
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT pg_temp.clear_jwt();
DELETE FROM auth.users WHERE id = 'c5900000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF (SELECT status FROM public.coach_provisional_dossiers WHERE id = current_setting('p59.dossier')::uuid) <> 'revoked'
     OR EXISTS (SELECT 1 FROM public.coach_provisional_workouts WHERE dossier_id = current_setting('p59.dossier')::uuid)
     OR EXISTS (
       SELECT 1 FROM public.coach_import_rows r
       JOIN public.coach_imports i ON i.id = r.import_id
       WHERE i.provisional_dossier_id = current_setting('p59.dossier')::uuid
     )
  THEN
    RAISE EXCEPTION 'deleted athlete left a readable copy';
  END IF;
  IF (SELECT count(*) FROM public.coach_import_claim_sources WHERE dossier_id = current_setting('p59.dossier')::uuid) <> 2 THEN
    RAISE EXCEPTION 'claim provenance lost';
  END IF;
END $$;

-- Deleting a coach cascades to their dossiers. Rows inserted in this very
-- transaction re-check every foreign key on update, so the test deletes the
-- dossier itself: the same cascade the coach deletion runs.
DELETE FROM public.coach_provisional_dossiers WHERE coach_id = 'c5900000-0000-4000-8000-000000000007';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_imports
    WHERE coach_ref = 'user:c5900000-0000-4000-8000-000000000007'
      AND provisional_dossier_id IS NULL
      AND status = 'committed'
  ) THEN
    RAISE EXCEPTION 'coach deletion erased import provenance';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_import_claim_sources
    WHERE coach_ref = 'user:c5900000-0000-4000-8000-000000000007'
  ) THEN
    RAISE EXCEPTION 'coach deletion erased claim provenance';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Catalog: F09 visibility · F12 collisions · F14 rename · F22 insert guard
-- ---------------------------------------------------------------------------
INSERT INTO public.exercises (name, name_fr, verified, created_by) VALUES
 ('P59 Private Lift', '', false, 'c5900000-0000-4000-8000-000000000005'),
 ('P59 Audit Squat', '', true, NULL),
 ('P59-Audit-Squat', '', true, NULL),
 ('P59 Bench Unique', '', true, NULL),
 ('P59 Row Unique', '', true, NULL);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000006');
DO $$
DECLARE
  v_w uuid;
  v_e uuid;
  v_bench uuid := (SELECT id FROM public.exercises WHERE name = 'P59 Bench Unique');
  v_row uuid := (SELECT id FROM public.exercises WHERE name = 'P59 Row Unique');
BEGIN
  IF public.resolve_exercise_catalog('P59 Private Lift') IS NOT NULL THEN
    RAISE EXCEPTION 'private exercise of another user resolved';
  END IF;
  IF public.resolve_exercise_catalog('p59 audit squat') IS NOT NULL THEN
    RAISE EXCEPTION 'ambiguous name resolved arbitrarily';
  END IF;
  INSERT INTO public.workouts (user_id, name, date, completed)
  VALUES ('c5900000-0000-4000-8000-000000000006', 'P59', now(), false)
  RETURNING id INTO v_w;
  INSERT INTO public.workout_exercises (workout_id, name, order_index)
  VALUES (v_w, 'P59 Bench Unique', 0)
  RETURNING id INTO v_e;
  IF (SELECT catalog_exercise_id FROM public.workout_exercises WHERE id = v_e) IS DISTINCT FROM v_bench THEN
    RAISE EXCEPTION 'insert did not link';
  END IF;
  UPDATE public.workout_exercises SET name = 'P59 Row Unique' WHERE id = v_e;
  IF (SELECT catalog_exercise_id FROM public.workout_exercises WHERE id = v_e) IS DISTINCT FROM v_row THEN
    RAISE EXCEPTION 'replacement kept the old identity';
  END IF;
  UPDATE public.workout_exercises SET name = 'My heavy rows' WHERE id = v_e;
  IF (SELECT catalog_exercise_id FROM public.workout_exercises WHERE id = v_e) IS DISTINCT FROM v_row THEN
    RAISE EXCEPTION 'custom label lost the identity';
  END IF;
  UPDATE public.workout_exercises SET catalog_exercise_id = v_bench WHERE id = v_e;
  IF (SELECT catalog_exercise_id FROM public.workout_exercises WHERE id = v_e) IS DISTINCT FROM v_bench THEN
    RAISE EXCEPTION 'explicit choice ignored';
  END IF;

  BEGIN
    INSERT INTO public.exercise_requests (user_id, name, status)
    VALUES ('c5900000-0000-4000-8000-000000000006', 'P59 Self Approved', 'approved');
    RAISE EXCEPTION 'request inserted as approved';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.exercise_requests (user_id, name, muscles, status)
  VALUES ('c5900000-0000-4000-8000-000000000006', 'P59 Zercher Carry', 'core', 'pending');
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000005');
DO $$ BEGIN
  IF public.resolve_exercise_catalog('P59 Private Lift') IS NULL THEN
    RAISE EXCEPTION 'owner lost their own exercise';
  END IF;
END $$;

-- F32: the operator reviewed an older version.
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000003');
SELECT set_config('p59.req_stamp', (SELECT updated_at::text FROM public.admin_list_exercise_proposals() WHERE name = 'P59 Zercher Carry'), true);
SELECT set_config('p59.req_id', (SELECT id::text FROM public.admin_list_exercise_proposals() WHERE name = 'P59 Zercher Carry'), true);
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000006');
UPDATE public.exercise_requests SET muscles = 'core, traps' WHERE name = 'P59 Zercher Carry';
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v jsonb;
  v_stamp timestamptz;
BEGIN
  BEGIN
    PERFORM public.admin_approve_exercise_proposal(
      current_setting('p59.req_id')::uuid, 'P59 Zercher Carry', 'Porté Zercher P59',
      'compound', 'barbell', true, current_setting('p59.req_stamp')::timestamptz
    );
    RAISE EXCEPTION 'stale approval applied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'request_changed' THEN RAISE; END IF;
  END;
  SELECT updated_at INTO v_stamp FROM public.admin_list_exercise_proposals() WHERE name = 'P59 Zercher Carry';
  -- F13: a French name already in the catalog is refused, not swallowed.
  BEGIN
    PERFORM public.admin_approve_exercise_proposal(
      current_setting('p59.req_id')::uuid, 'P59 Zercher Carry', 'P59 Row Unique',
      'compound', 'barbell', true, v_stamp
    );
    RAISE EXCEPTION 'colliding French name accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'name_taken' THEN RAISE; END IF;
  END;
  v := public.admin_approve_exercise_proposal(
    current_setting('p59.req_id')::uuid, 'P59 Zercher Carry', 'Porté Zercher P59',
    'compound', 'barbell', true, v_stamp
  );
  IF v->>'status' <> 'approved' THEN RAISE EXCEPTION 'approve %', v; END IF;
  -- F40: muscles are split, not stored as one string.
  IF (SELECT primary_muscles FROM public.exercises WHERE name = 'P59 Zercher Carry') <> ARRAY['core', 'traps'] THEN
    RAISE EXCEPTION 'muscles not normalised %', (SELECT primary_muscles FROM public.exercises WHERE name = 'P59 Zercher Carry');
  END IF;
END $$;

-- F06: a closed request cannot be reopened by any path.
RESET ROLE;
DO $$ BEGIN
  BEGIN
    UPDATE public.exercise_requests SET status = 'pending' WHERE name = 'P59 Zercher Carry';
    RAISE EXCEPTION 'closed request reopened';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'request_closed' THEN RAISE; END IF;
  END;
END $$;

-- F29: duplicates are one row per pair and can be dismissed.
INSERT INTO public.exercises (name, name_fr, verified) VALUES
 ('P59 Cable Crossover', '', true),
 ('P59 Cable Crossovers', '', true);
INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
SELECT e.id, a.alias, 'und', public.exercise_normalize_name(a.alias), 'seed'
FROM public.exercises e
JOIN (VALUES
  ('P59 Cable Crossover', 'P59 Cable Crossover'),
  ('P59 Cable Crossover', 'P59 Cable Cross Over'),
  ('P59 Cable Crossovers', 'P59 Cable Crossovers'),
  ('P59 Cable Crossovers', 'P59 Cable Cross Overs')
) AS a(target, alias) ON a.target = e.name
ON CONFLICT DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_left uuid;
  v_right uuid;
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.admin_list_exercise_duplicates(100, 0)
   WHERE left_name LIKE 'P59 Cable%' AND right_name LIKE 'P59 Cable%';
  IF n <> 1 THEN RAISE EXCEPTION 'duplicate pair listed % times', n; END IF;
  SELECT left_id, right_id INTO v_left, v_right FROM public.admin_list_exercise_duplicates(100, 0)
   WHERE left_name LIKE 'P59 Cable%';
  PERFORM public.admin_dismiss_exercise_duplicate(v_right, v_left, true);
  IF EXISTS (SELECT 1 FROM public.admin_list_exercise_duplicates(100, 0) WHERE left_name LIKE 'P59 Cable%') THEN
    RAISE EXCEPTION 'dismissed pair came back';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Imports: F16 quota on reactivation · F18 acknowledgement fingerprint · F31
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v jsonb;
  v_first uuid;
  v_map jsonb := '{"kind":"body_weight","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"body_weight":1},"ignored":[]}'::jsonb;
  i int;
BEGIN
  FOR i IN 1..20 LOOP
    v := public.preview_coach_import(
      'c5900000-0000-4000-8000-000000000001'::uuid, 'w' || i || '.csv',
      'Date,Weight' || E'\n' || to_char(date '2026-01-01' + i, 'YYYY-MM-DD') || ',80',
      v_map, 'p59-quota-' || i
    );
    IF i = 1 THEN v_first := (v->>'import_id')::uuid; END IF;
  END LOOP;
  PERFORM public.cancel_coach_import(v_first);
  v := public.preview_coach_import(
    'c5900000-0000-4000-8000-000000000001'::uuid, 'w21.csv',
    E'Date,Weight\n2026-03-01,80', v_map, 'p59-quota-21'
  );
  BEGIN
    PERFORM public.preview_coach_import(
      'c5900000-0000-4000-8000-000000000001'::uuid, 'w1.csv',
      E'Date,Weight\n2026-01-02,80', v_map, 'p59-quota-1'
    );
    RAISE EXCEPTION 'cancelled preview reopened above quota';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'preview_quota' THEN RAISE; END IF;
  END;
  FOR i IN 2..21 LOOP
    PERFORM public.cancel_coach_import(id) FROM public.coach_imports
     WHERE idempotency_key = 'p59-quota-' || i AND coach_id = 'c5900000-0000-4000-8000-000000000001';
  END LOOP;

  v := public.preview_coach_import(
    'c5900000-0000-4000-8000-000000000001'::uuid, 'bad.csv',
    E'Date,Weight\nnot-a-date,80\n2026-02-01,80', v_map, 'p59-ack'
  );
  IF (v->>'error_count')::int < 1 THEN RAISE EXCEPTION 'expected an error row %', v; END IF;
  PERFORM set_config('p59.ack', v->>'import_id', true);

  v := public.record_coach_import_incident('workout', 'malformed_csv');
  IF v->>'status' <> 'recorded' THEN RAISE EXCEPTION 'incident %', v; END IF;
  BEGIN
    PERFORM public.record_coach_import_incident('workout', 'Free text <b>');
    RAISE EXCEPTION 'free text incident accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_target' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000003');
SELECT public.admin_acknowledge_problem_import(current_setting('p59.ack')::uuid, 'seen', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_list_problem_imports() WHERE id = current_setting('p59.ack')::uuid) THEN
    RAISE EXCEPTION 'acknowledged import still listed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_list_import_incidents()
    WHERE error_code = 'malformed_csv' AND kind = 'workout'
  ) THEN
    RAISE EXCEPTION 'incident not readable by the operator';
  END IF;
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000001');
-- Same key and bytes, new mapping: the problem changed, the fingerprint too.
SELECT public.preview_coach_import(
  'c5900000-0000-4000-8000-000000000001'::uuid, 'bad.csv',
  E'Date,Weight\nnot-a-date,80\n2026-02-01,80', '{"kind":"body_weight","delimiter":",","date_format":"dmy","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"body_weight":1},"ignored":[]}'::jsonb,
  'p59-ack'
) IS NOT NULL;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_list_problem_imports() WHERE id = current_setting('p59.ack')::uuid) THEN
    RAISE EXCEPTION 'a changed problem stayed hidden behind the old acknowledgement';
  END IF;
END $$;

SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000006');
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.admin_list_import_incidents();
    RAISE EXCEPTION 'non operator read incidents';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_authorized' THEN RAISE; END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- F19 proof access is bound to the exact object · F17 holds stay reachable
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT pg_temp.clear_jwt();
INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata) VALUES
 ('qualification-proofs', 'c5900000-0000-4000-8000-000000000001/c5900000-0000-4000-8000-0000000000aa/current.pdf', 'c5900000-0000-4000-8000-000000000001', 'c5900000-0000-4000-8000-000000000001', '{"mimetype":"application/pdf","size":10}'),
 ('qualification-proofs', 'c5900000-0000-4000-8000-000000000001/c5900000-0000-4000-8000-0000000000aa/old.pdf', 'c5900000-0000-4000-8000-000000000001', 'c5900000-0000-4000-8000-000000000001', '{"mimetype":"application/pdf","size":10}');
INSERT INTO public.coach_qualifications (id, coach_id, title, qualification_type, issuer, proof_path, verification_status)
VALUES ('c5900000-0000-4000-8000-0000000000aa', 'c5900000-0000-4000-8000-000000000001', 'P59 Cert', 'certification', 'P59 Board',
        'c5900000-0000-4000-8000-000000000001/c5900000-0000-4000-8000-0000000000aa/current.pdf', 'pending');
INSERT INTO public.marketplace_reports (id, target_user_id, subject_type, category, context)
VALUES ('c5900000-0000-4000-8000-0000000000bb', 'c5900000-0000-4000-8000-000000000001', 'profile', 'spam', 'P59 context');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5900000-0000-4000-8000-000000000003');
DO $$ BEGIN
  PERFORM public.admin_open_qualification_proof('c5900000-0000-4000-8000-0000000000aa'::uuid);
  IF NOT public.admin_proof_access_allowed('c5900000-0000-4000-8000-000000000001/c5900000-0000-4000-8000-0000000000aa/current.pdf') THEN
    RAISE EXCEPTION 'audited proof not readable';
  END IF;
  IF public.admin_proof_access_allowed('c5900000-0000-4000-8000-000000000001/c5900000-0000-4000-8000-0000000000aa/old.pdf') THEN
    RAISE EXCEPTION 'sibling object readable';
  END IF;
  PERFORM public.admin_review_marketplace_report('c5900000-0000-4000-8000-0000000000bb'::uuid, 'suspend_directory', 'hold', true);
  PERFORM public.admin_review_marketplace_report('c5900000-0000-4000-8000-0000000000bb'::uuid, 'resolve', 'done', true);
  IF NOT EXISTS (SELECT 1 FROM public.admin_list_directory_holds() WHERE id = 'c5900000-0000-4000-8000-0000000000bb') THEN
    RAISE EXCEPTION 'hold on a resolved report is unreachable';
  END IF;
  PERFORM public.admin_review_marketplace_report('c5900000-0000-4000-8000-0000000000bb'::uuid, 'restore_directory', 'lifted', true);
  IF EXISTS (SELECT 1 FROM public.admin_list_directory_holds() WHERE id = 'c5900000-0000-4000-8000-0000000000bb') THEN
    RAISE EXCEPTION 'restored hold still listed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- F37 parser contract shared with src/features/imports/domain/csvParse.ts
-- ---------------------------------------------------------------------------
RESET ROLE;
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  -- BOM, quoted delimiter and escaped quote, blank line, NBSP trim, short row padded.
  FOR r IN SELECT * FROM public.coach_import_parse_csv(
    E'﻿Date,Exercise,Notes\n\n2026-01-01,"Squat, pause","say ""hi"""\n  2026-01-02  ,Row\n', ','
  ) LOOP
    n := n + 1;
    IF n = 1 AND r.cells <> ARRAY['Date', 'Exercise', 'Notes'] THEN RAISE EXCEPTION 'header %', r.cells; END IF;
    IF n = 2 AND r.cells <> ARRAY['2026-01-01', 'Squat, pause', 'say "hi"'] THEN RAISE EXCEPTION 'quoted %', r.cells; END IF;
    IF n = 3 AND r.cells <> ARRAY['2026-01-02', 'Row', ''] THEN RAISE EXCEPTION 'padded %', r.cells; END IF;
  END LOOP;
  IF n <> 3 THEN RAISE EXCEPTION 'rows %', n; END IF;
  -- A lone EF byte is content, not a BOM.
  IF (SELECT cells[1] FROM public.coach_import_parse_csv(E'ïx,y\n1,2', ',') WHERE row_no = 1) <> E'ïx' THEN
    RAISE EXCEPTION 'non-BOM leading character stripped';
  END IF;
  BEGIN
    PERFORM public.coach_import_parse_csv('a,b' || E'\n' || '"' || repeat('x', 401) || '",1', ',');
    RAISE EXCEPTION 'long cell accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'cell_too_long' THEN RAISE; END IF;
  END;
END $$;

SELECT 'p5 audit fixes: deletion, access after claim, revision, dedup, catalog identity, quotas, operator queues, parser' AS result;
ROLLBACK;
