-- P5.4 operator console. BEGIN/ROLLBACK. No durable writes.
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

CREATE FUNCTION pg_temp.clear_jwt() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

INSERT INTO auth.users(id, email) VALUES
 ('c5400000-0000-4000-8000-000000000001', 'p54-operator@example.test'),
 ('c5400000-0000-4000-8000-000000000002', 'p54-coach@example.test'),
 ('c5400000-0000-4000-8000-000000000003', 'p54-athlete@example.test'),
 ('c5400000-0000-4000-8000-000000000004', 'p54-stranger@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c5400000-0000-4000-8000-000000000001', 'free', 'none'),
 ('c5400000-0000-4000-8000-000000000002', 'free', 'coach'),
 ('c5400000-0000-4000-8000-000000000003', 'free', 'none'),
 ('c5400000-0000-4000-8000-000000000004', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
UPDATE public.user_profiles SET full_name = 'Coach Visible'
 WHERE id = 'c5400000-0000-4000-8000-000000000002';

DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.review_coach_qualification(uuid,text,text)', 'execute')
     OR has_function_privilege('authenticated', 'public.review_marketplace_report(uuid,text,text)', 'execute')
     OR has_function_privilege('authenticated', 'public.merge_exercises(uuid,uuid,boolean)', 'execute')
     OR has_function_privilege('anon', 'public.admin_list_pending_qualifications(timestamptz,uuid,integer)', 'execute')
     OR has_function_privilege('anon', 'public.admin_merge_exercises(uuid,uuid,boolean)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.admin_review_qualification(uuid,text,text,boolean)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.admin_list_open_reports(timestamptz,uuid,integer)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.is_platform_operator()', 'execute')
     OR has_table_privilege('authenticated', 'public.platform_operators', 'select')
     OR has_table_privilege('authenticated', 'public.platform_admin_audit', 'select')
     OR has_table_privilege('authenticated', 'public.exercises', 'insert')
     OR has_function_privilege('authenticated', 'public.lock_platform_operators()', 'execute') THEN
    RAISE EXCEPTION 'admin grants mismatch';
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT public.grant_platform_operator('c5400000-0000-4000-8000-000000000001'::uuid, true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000004');
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_list_pending_qualifications();
    RAISE EXCEPTION 'stranger listed qualifications';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_authorized' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.grant_platform_operator('c5400000-0000-4000-8000-000000000004'::uuid, true);
    RAISE EXCEPTION 'stranger granted operator';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_authorized' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.review_coach_qualification('c5400000-0000-4000-8000-000000000099'::uuid, 'verified', NULL);
    RAISE EXCEPTION 'stranger called review directly';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT IN ('not_authorized', 'permission denied for function review_coach_qualification') THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000002');
SELECT public.save_my_coach_profile('{"public_name":"Coach Visible","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true}');
SELECT public.declare_coach_qualification('CSCS', 'certification', 'NSCA');

DO $$
DECLARE
  q public.coach_qualifications;
BEGIN
  SELECT * INTO q FROM public.coach_qualifications WHERE coach_id = auth.uid() ORDER BY declared_at DESC LIMIT 1;
  PERFORM public.save_coach_qualification(
    q.id, q.title, q.qualification_type, q.issuer,
    auth.uid()::text || '/' || q.id::text || '/proof-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf',
    NULL
  );
END $$;

RESET ROLE;
INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
SELECT 'qualification-proofs', q.proof_path, q.coach_id, q.coach_id::text,
       jsonb_build_object('mimetype', 'application/pdf', 'size', 1200)
FROM public.coach_qualifications q
WHERE q.coach_id = 'c5400000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000002');
SELECT public.submit_coach_qualification(id) FROM public.coach_qualifications
 WHERE coach_id = 'c5400000-0000-4000-8000-000000000002';

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000001');
DO $$
DECLARE
  q_id uuid;
  listed text;
  opened jsonb;
  visible int;
BEGIN
  SELECT string_agg(title || coach_label, ',') INTO listed FROM public.admin_list_pending_qualifications();
  IF listed NOT LIKE '%CSCS%' OR listed NOT LIKE '%Coach Visible%' THEN
    RAISE EXCEPTION 'pending qualification missing';
  END IF;
  IF listed LIKE '%@%' OR listed LIKE '%proof-%' THEN
    RAISE EXCEPTION 'qualification list leaked mail or proof path';
  END IF;
  SELECT id INTO q_id FROM public.admin_list_pending_qualifications() LIMIT 1;
  SELECT count(*) INTO visible FROM storage.objects
   WHERE bucket_id = 'qualification-proofs' AND name LIKE '%proof-bbbbbbbb%';
  IF visible <> 0 THEN RAISE EXCEPTION 'proof readable before audited open'; END IF;
  opened := public.admin_open_qualification_proof(q_id);
  IF opened->>'mime' <> 'application/pdf' OR opened->>'proof_path' NOT LIKE '%proof-bbbbbbbb%' THEN
    RAISE EXCEPTION 'proof open incomplete';
  END IF;
  SELECT count(*) INTO visible FROM storage.objects
   WHERE bucket_id = 'qualification-proofs' AND name = opened->>'proof_path';
  IF visible <> 1 THEN RAISE EXCEPTION 'audited proof still hidden'; END IF;
  BEGIN
    PERFORM public.admin_review_qualification(q_id, 'verified', NULL, false);
    RAISE EXCEPTION 'review without confirm';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'confirmation_required' THEN RAISE; END IF;
  END;
  IF (public.admin_review_qualification(q_id, 'verified', NULL, true)->>'verification_status') <> 'verified' THEN
    RAISE EXCEPTION 'qualification not verified';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_list_pending_qualifications() WHERE id = q_id) THEN
    RAISE EXCEPTION 'verified qualification stayed in the queue';
  END IF;
END $$;

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000004');
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id = 'qualification-proofs' AND name LIKE '%proof-bbbbbbbb%';
  IF n <> 0 THEN RAISE EXCEPTION 'stranger read qualification proof'; END IF;
END $$;

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000003');
SELECT public.propose_exercise('P54 Zercher Hold', 'back', 'private note from athlete');
SELECT public.propose_exercise('Bench Press', 'chest', 'should match');

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000001');
DO $$
DECLARE
  req uuid;
  bench uuid;
  stamp timestamptz;
  created jsonb;
BEGIN
  IF (SELECT string_agg(description, ' ') FROM public.admin_list_exercise_proposals()) LIKE '%@%' THEN
    RAISE EXCEPTION 'proposal list leaked mail';
  END IF;
  SELECT id, updated_at INTO req, stamp FROM public.admin_list_exercise_proposals() WHERE name = 'P54 Zercher Hold';
  BEGIN
    PERFORM public.admin_approve_exercise_proposal(req, 'P54 Zercher Hold', 'Zercher P54', 'compound', 'barbell', false, stamp);
    RAISE EXCEPTION 'approve without confirm';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'confirmation_required' THEN RAISE; END IF;
  END;
  created := public.admin_approve_exercise_proposal(req, 'P54 Zercher Hold', 'Zercher P54', 'compound', 'barbell', true, stamp);
  IF created->>'status' <> 'approved' THEN RAISE EXCEPTION 'proposal not approved'; END IF;
  BEGIN
    PERFORM public.admin_approve_exercise_proposal(req, 'P54 Zercher Hold', 'Zercher P54', 'compound', 'barbell', true, stamp);
    RAISE EXCEPTION 'second approve wrote again';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'request_closed' THEN RAISE; END IF;
  END;
  SELECT id INTO bench FROM public.exercises WHERE name = 'Bench Press' AND merged_into_id IS NULL;
  SELECT id, updated_at INTO req, stamp FROM public.admin_list_exercise_proposals() WHERE name = 'Bench Press';
  IF (public.admin_match_exercise_proposal(req, bench, true, stamp)->>'status') <> 'matched' THEN
    RAISE EXCEPTION 'proposal not matched';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exercises WHERE name = 'P54 Zercher Hold' AND verified AND created_by IS NULL) THEN
    RAISE EXCEPTION 'approved exercise missing';
  END IF;
END $$;

RESET ROLE;
INSERT INTO public.exercises (name, name_fr, verified) VALUES
  ('P54 Alpha Curl', 'Alpha P54', true),
  ('P54 Alpha Curls', 'Alphas P54', true);
INSERT INTO public.workouts (user_id, name, completed)
VALUES ('c5400000-0000-4000-8000-000000000003', 'Seance P54', true);
INSERT INTO public.workout_exercises (workout_id, name, catalog_exercise_id)
SELECT w.id, 'Nom historique P54', e.id
FROM public.workouts w
JOIN public.exercises e ON e.name = 'P54 Alpha Curls'
WHERE w.user_id = 'c5400000-0000-4000-8000-000000000003' AND w.name = 'Seance P54';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000001');
SELECT public.admin_merge_exercises(
  (SELECT id FROM public.exercises WHERE name = 'P54 Alpha Curl'),
  (SELECT id FROM public.exercises WHERE name = 'P54 Alpha Curls'),
  true
);

RESET ROLE;
DO $$ BEGIN
  IF (SELECT name FROM public.workout_exercises WHERE name = 'Nom historique P54') IS DISTINCT FROM 'Nom historique P54' THEN
    RAISE EXCEPTION 'merge rewrote the written name';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workout_exercises we
    JOIN public.exercises winner ON winner.name = 'P54 Alpha Curl'
    WHERE we.name = 'Nom historique P54' AND we.catalog_exercise_id = winner.id
  ) THEN
    RAISE EXCEPTION 'merge did not repoint the catalog link';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000003');
SELECT public.submit_marketplace_report(
  'c5400000-0000-4000-8000-000000000002'::uuid,
  'behavior',
  'spam',
  'Contexte de signalement sans identite affichee'
);

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000001');
DO $$
DECLARE
  report uuid;
  listed text;
  reviewed jsonb;
BEGIN
  SELECT string_agg(context || target_label, ' ') INTO listed FROM public.admin_list_open_reports();
  IF listed NOT LIKE '%Coach Visible%' OR listed NOT LIKE '%signalement%' THEN
    RAISE EXCEPTION 'report queue missing';
  END IF;
  IF listed LIKE '%p54-athlete%' OR listed LIKE '%reporter%' THEN
    RAISE EXCEPTION 'report list leaked reporter';
  END IF;
  SELECT id INTO report FROM public.admin_list_open_reports() LIMIT 1;
  BEGIN
    PERFORM public.admin_review_marketplace_report(report, 'suspend_directory', 'hold', false);
    RAISE EXCEPTION 'suspend without confirm';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'confirmation_required' THEN RAISE; END IF;
  END;
  reviewed := public.admin_review_marketplace_report(report, 'suspend_directory', 'Annuaire retenu', true);
  IF reviewed->>'directory_hold_active' <> 'true' THEN RAISE EXCEPTION 'directory hold missing'; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_profiles
    WHERE coach_id = 'c5400000-0000-4000-8000-000000000002' AND directory_suspended
  ) THEN
    RAISE EXCEPTION 'directory flag not derived';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE coach_id = 'c5400000-0000-4000-8000-000000000002'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'suspend created or kept an unexpected active link';
  END IF;
END $$;
INSERT INTO public.coach_imports (
  coach_id, coach_ref, subject_user_id, status, kind, filename, file_sha256,
  mapping, mapping_hash, idempotency_key, error_count, row_count
) VALUES (
  'c5400000-0000-4000-8000-000000000002',
  'user:c5400000-0000-4000-8000-000000000002',
  'c5400000-0000-4000-8000-000000000003',
  'failed',
  'workout',
  'secret-athlete.csv',
  repeat('ab', 32),
  '{"secret":"mapping"}'::jsonb,
  repeat('cd', 32),
  'p54-admin-import',
  1,
  2
);
INSERT INTO public.coach_import_rows (import_id, row_no, raw, status, error_code)
SELECT id, 1, '{"private":"weight-99"}'::jsonb, 'error', 'bad_date'
FROM public.coach_imports WHERE idempotency_key = 'p54-admin-import';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000001');
DO $$
DECLARE
  listed text;
  import_id uuid;
  before_status text;
BEGIN
  SELECT string_agg(kind || status || coalesce(array_to_string(error_codes, ','), '') || coach_label, ' ')
    INTO listed
  FROM public.admin_list_problem_imports();
  IF listed NOT LIKE '%failed%' OR listed NOT LIKE '%bad_date%' OR listed NOT LIKE '%Coach Visible%' THEN
    RAISE EXCEPTION 'problem import missing';
  END IF;
  IF listed LIKE '%secret-athlete%' OR listed LIKE '%weight-99%' OR listed LIKE '%mapping%' OR listed LIKE '%@%' THEN
    RAISE EXCEPTION 'import list leaked private fields';
  END IF;
  SELECT id, status INTO import_id, before_status FROM public.admin_list_problem_imports() LIMIT 1;
  IF before_status IS DISTINCT FROM 'failed' THEN RAISE EXCEPTION 'problem import status missing'; END IF;
  PERFORM public.admin_acknowledge_problem_import(import_id, 'Vu, sans reecriture', true);
  IF EXISTS (SELECT 1 FROM public.admin_list_problem_imports() WHERE id = import_id) THEN
    RAISE EXCEPTION 'acknowledged import stayed in the queue';
  END IF;
END $$;

RESET ROLE;
DO $$ BEGIN
  IF (SELECT status FROM public.coach_imports WHERE idempotency_key = 'p54-admin-import') IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'acknowledge mutated the import';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_revoke_platform_operator(auth.uid(), true);
    RAISE EXCEPTION 'last operator revoked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'last_operator' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT public.grant_platform_operator('c5400000-0000-4000-8000-000000000004'::uuid, true);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c5400000-0000-4000-8000-000000000001');
SELECT public.admin_revoke_platform_operator('c5400000-0000-4000-8000-000000000004'::uuid, true);

SELECT 'p5.4 minimal admin: operator queues, no public review grant, confirm required, private fields omitted' AS result;
ROLLBACK;
