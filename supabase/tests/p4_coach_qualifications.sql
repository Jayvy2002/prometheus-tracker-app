-- P4.1 qualifications: declare/submit/review, owner vs public surfaces, proof path binding.
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
 ('c4100000-0000-4000-8000-000000000001', 'p41-coach@example.test'),
 ('c4100000-0000-4000-8000-000000000002', 'p41-other@example.test'),
 ('c4100000-0000-4000-8000-000000000003', 'p41-client@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c4100000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c4100000-0000-4000-8000-000000000002', 'free', 'coach'),
 ('c4100000-0000-4000-8000-000000000003', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;

DO $$ BEGIN
  IF to_regclass('public.coach_qualifications') IS NULL THEN
    RAISE EXCEPTION 'qualifications table missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.coach_qualifications'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled on qualifications';
  END IF;
  IF has_table_privilege('authenticated', 'public.coach_qualifications', 'insert')
     OR has_table_privilege('authenticated', 'public.coach_qualifications', 'update')
     OR has_table_privilege('authenticated', 'public.coach_qualifications', 'delete')
     OR has_table_privilege('anon', 'public.coach_qualifications', 'select') THEN
    RAISE EXCEPTION 'direct qualification writes granted';
  END IF;
  IF has_function_privilege('authenticated', 'public.review_coach_qualification(uuid,text,text)', 'execute')
     OR has_function_privilege('anon', 'public.declare_coach_qualification(text,text,text,text,date)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.declare_coach_qualification(text,text,text,text,date)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.list_public_coach_qualifications(uuid)', 'execute')
     OR has_function_privilege('anon', 'public.list_public_coach_qualifications(uuid)', 'execute')
     OR NOT has_function_privilege('service_role', 'public.review_coach_qualification(uuid,text,text)', 'execute') THEN
    RAISE EXCEPTION 'qualification grants mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'qualification-proofs' AND NOT public) THEN
    RAISE EXCEPTION 'qualification proofs bucket missing';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c4100000-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    PERFORM public.declare_coach_qualification('CSCS', 'certification', 'NSCA');
    RAISE EXCEPTION 'non coach declared';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coach_required' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c4100000-0000-4000-8000-000000000001');
SELECT public.save_my_coach_profile('{"public_name":"Qual Coach","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true}');
SELECT public.declare_coach_qualification('CSCS', 'certification', 'NSCA', 'stolen-on-declare.pdf', NULL);

DO $$
DECLARE
  q public.coach_qualifications;
BEGIN
  SELECT * INTO q FROM public.coach_qualifications WHERE coach_id = auth.uid();
  IF q.proof_path IS NOT NULL THEN RAISE EXCEPTION 'declare accepted client proof_path'; END IF;
  BEGIN
    PERFORM public.submit_coach_qualification(q.id);
    RAISE EXCEPTION 'submit without proof';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_coach_qualification(q.id, q.title, q.qualification_type, q.issuer, 'c4100000-0000-4000-8000-000000000002/' || q.id::text || '/proof.pdf', NULL);
    RAISE EXCEPTION 'foreign proof_path accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_proof_path' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_coach_qualification(q.id, q.title, q.qualification_type, q.issuer, auth.uid()::text || '/00000000-0000-4000-8000-000000000099/proof.pdf', NULL);
    RAISE EXCEPTION 'wrong qualification proof_path accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_proof_path' THEN RAISE; END IF;
  END;
  q := public.save_coach_qualification(q.id, q.title, q.qualification_type, q.issuer, auth.uid()::text || '/' || q.id::text || '/proof.pdf', NULL);
  q := public.submit_coach_qualification(q.id);
  IF q.verification_status <> 'pending' THEN RAISE EXCEPTION 'submit did not pending'; END IF;
  BEGIN
    PERFORM public.review_coach_qualification(q.id, 'verified', NULL);
    RAISE EXCEPTION 'client reviewed qualification';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT IN ('not_authorized', 'permission denied for function review_coach_qualification') THEN
      IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
    END IF;
  END;
END $$;

SELECT pg_temp.as_user('c4100000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.coach_qualifications
    WHERE coach_id = 'c4100000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'stranger selected owner qualification table'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.list_public_coach_qualifications('c4100000-0000-4000-8000-000000000001')
    WHERE verification_status = 'pending'
  ) THEN RAISE EXCEPTION 'pending hidden from directory reader'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_public_coach_qualifications('c4100000-0000-4000-8000-000000000001') card
    WHERE to_jsonb(card) ? 'proof_path'
       OR to_jsonb(card) ? 'reviewer_id'
       OR to_jsonb(card) ? 'reviewer_ref'
       OR to_jsonb(card) ? 'review_note'
  ) THEN RAISE EXCEPTION 'public qualification leaked internal fields'; END IF;
  IF public.coach_has_verified_qualification('c4100000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'unverified badge shown';
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

DO $$
DECLARE
  q public.coach_qualifications;
BEGIN
  SELECT * INTO q FROM public.coach_qualifications
  WHERE coach_id = 'c4100000-0000-4000-8000-000000000001';
  q := public.review_coach_qualification(q.id, 'verified', NULL);
  IF q.verification_status <> 'verified' OR q.verified_at IS NULL THEN
    RAISE EXCEPTION 'review did not verify';
  END IF;
  IF q.reviewer_ref IS DISTINCT FROM 'role:service_role' THEN
    RAISE EXCEPTION 'reviewer_ref was not durable: %', q.reviewer_ref;
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c4100000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF NOT public.coach_has_verified_qualification('c4100000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'verified badge missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_public_coach_qualifications('c4100000-0000-4000-8000-000000000001')
    WHERE verification_status = 'rejected'
  ) THEN RAISE EXCEPTION 'rejected leaked'; END IF;
END $$;

SELECT pg_temp.as_user('c4100000-0000-4000-8000-000000000001');
DO $$
DECLARE
  p public.coach_profiles;
  q public.coach_qualifications;
BEGIN
  SELECT * INTO p FROM public.coach_profiles WHERE coach_id = auth.uid();
  p := public.save_my_coach_profile(to_jsonb(p) || '{"published":true,"accepting_clients":true}', p.updated_at);
  IF NOT p.published THEN RAISE EXCEPTION 'publish required a verified badge'; END IF;
  SELECT * INTO q FROM public.coach_qualifications WHERE coach_id = auth.uid();
  IF q.proof_path IS NULL OR q.reviewer_ref <> 'role:service_role' THEN
    RAISE EXCEPTION 'owner lost internal qualification fields';
  END IF;
END $$;

SELECT pg_temp.as_user('c4100000-0000-4000-8000-000000000002');
SELECT public.save_my_coach_profile('{"public_name":"Other","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["powerlifting"],"languages":["en"],"formats":["online"],"published":true,"accepting_clients":true}');
DO $$
DECLARE
  stolen text;
  q public.coach_qualifications;
BEGIN
  IF public.coach_has_verified_qualification('c4100000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'empty coach has badge';
  END IF;
  SELECT proof_path INTO stolen
  FROM public.coach_qualifications
  WHERE coach_id = 'c4100000-0000-4000-8000-000000000001';
  IF stolen IS NOT NULL THEN RAISE EXCEPTION 'other coach read proof_path'; END IF;
  q := public.declare_coach_qualification('CSCS', 'certification', 'NSCA');
  BEGIN
    PERFORM public.save_coach_qualification(
      q.id, q.title, q.qualification_type, q.issuer,
      'c4100000-0000-4000-8000-000000000001/' || q.id::text || '/proof.pdf',
      NULL
    );
    RAISE EXCEPTION 'other coach reused foreign folder';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_proof_path' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
\echo 'p4.1 qualifications: declare/submit/review, badge optional, no publish gate'
ROLLBACK;
