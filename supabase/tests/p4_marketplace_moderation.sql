-- P4.4 moderation: report queue, directory hold, new requests blocked, in-flight continues.
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
 ('c4400000-0000-4000-8000-000000000001', 'p44-coach@example.test'),
 ('c4400000-0000-4000-8000-000000000002', 'p44-athlete@example.test'),
 ('c4400000-0000-4000-8000-000000000003', 'p44-stranger@example.test'),
 ('c4400000-0000-4000-8000-000000000004', 'p44-inflight@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c4400000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c4400000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c4400000-0000-4000-8000-000000000003', 'free', 'none'),
 ('c4400000-0000-4000-8000-000000000004', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;

DO $$ BEGIN
  IF to_regclass('public.marketplace_reports') IS NULL
     OR to_regclass('public.marketplace_moderation_actions') IS NULL THEN
    RAISE EXCEPTION 'moderation tables missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.marketplace_reports'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.marketplace_moderation_actions'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled on moderation tables';
  END IF;
  IF has_table_privilege('authenticated', 'public.marketplace_reports', 'insert')
     OR has_table_privilege('authenticated', 'public.marketplace_reports', 'update')
     OR has_table_privilege('authenticated', 'public.marketplace_reports', 'delete')
     OR has_table_privilege('authenticated', 'public.marketplace_moderation_actions', 'select')
     OR has_table_privilege('authenticated', 'public.marketplace_moderation_actions', 'insert')
     OR has_function_privilege('authenticated', 'public.review_marketplace_report(uuid,text,text)', 'execute')
     OR has_function_privilege('anon', 'public.submit_marketplace_report(uuid,text,text,text,uuid)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.submit_marketplace_report(uuid,text,text,text,uuid)', 'execute')
     OR NOT has_function_privilege('service_role', 'public.review_marketplace_report(uuid,text,text)', 'execute') THEN
    RAISE EXCEPTION 'moderation grants mismatch';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000001');
SELECT public.save_my_coach_profile('{"public_name":"Moderation Coach","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["powerlifting"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true}');
SELECT public.declare_coach_qualification('CSCS', 'certification', 'NSCA');
DO $$
DECLARE q public.coach_qualifications;
BEGIN
  SELECT * INTO q FROM public.coach_qualifications WHERE coach_id = auth.uid();
  q := public.save_coach_qualification(q.id, q.title, q.qualification_type, q.issuer, auth.uid()::text || '/' || q.id::text || '/proof.pdf', NULL);
  PERFORM public.submit_coach_qualification(q.id);
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000002');
SELECT public.save_marketplace_search_intent('{"discipline":"powerlifting","language":"fr","format":"online"}');
SELECT public.request_coaching('c4400000-0000-4000-8000-000000000001', 'Athlete', 'Looking for a coach', 2, 'c4400000-0000-4000-8000-000000000010');

DO $$
DECLARE
  v_rows jsonb;
BEGIN
  v_rows := public.explain_marketplace_matches();
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rows) e
    WHERE e->>'coach_id' = 'c4400000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'eligible coach missing from matching'; END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM public.submit_marketplace_report(auth.uid(), 'profile', 'spam', 'cannot report myself');
    RAISE EXCEPTION 'self report accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_target' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_marketplace_report(
      'c4400000-0000-4000-8000-000000000001',
      'behavior',
      'spam',
      'unrelated request',
      'c4400000-0000-4000-8000-000000009999'
    );
    RAISE EXCEPTION 'unrelated request attached';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'request_mismatch' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000001');
DO $$
DECLARE
  r public.coach_join_requests;
BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE coach_id = auth.uid();
  PERFORM public.respond_coaching_request(r.id, 'accepted');
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000002');
DO $$
DECLARE
  r public.coach_join_requests;
  report public.marketplace_reports;
BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE client_id = auth.uid();
  PERFORM public.respond_coaching_request(r.id, 'confirmed');
  IF NOT public.is_client_of('c4400000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'confirm did not activate relationship';
  END IF;
  report := public.submit_marketplace_report(
    'c4400000-0000-4000-8000-000000000001',
    'behavior',
    'harassment',
    'Unwanted messages after accept.',
    r.id
  );
  IF report.status <> 'open' OR report.reporter_id <> auth.uid() THEN
    RAISE EXCEPTION 'report not recorded';
  END IF;
  BEGIN
    INSERT INTO public.marketplace_reports (reporter_id, target_user_id, subject_type, category, context)
    VALUES (auth.uid(), 'c4400000-0000-4000-8000-000000000001', 'profile', 'spam', 'direct write');
    RAISE EXCEPTION 'direct report write allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.review_marketplace_report(report.id, 'acknowledge', 'nope');
    RAISE EXCEPTION 'authenticated reviewed report';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT IN ('not_authorized', 'permission denied for function review_marketplace_report') THEN
      IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
    END IF;
  END;
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000004');
SELECT public.request_coaching('c4400000-0000-4000-8000-000000000001', 'Inflight', 'Already talking', 2, 'c4400000-0000-4000-8000-000000000014');

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.marketplace_reports
    WHERE target_user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'target read reporter identity'; END IF;
  BEGIN
    PERFORM 1 FROM public.marketplace_moderation_actions;
    RAISE EXCEPTION 'moderation actions leaked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.marketplace_reports) THEN
    RAISE EXCEPTION 'stranger read reports';
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

DO $$
DECLARE
  report public.marketplace_reports;
  q public.coach_qualifications;
BEGIN
  SELECT * INTO q FROM public.coach_qualifications
  WHERE coach_id = 'c4400000-0000-4000-8000-000000000001';
  q := public.review_coach_qualification(q.id, 'verified', NULL);
  IF q.reviewer_ref IS DISTINCT FROM 'role:service_role' THEN
    RAISE EXCEPTION 'qualification reviewer_ref missing: %', q.reviewer_ref;
  END IF;
  SELECT * INTO report FROM public.marketplace_reports
  WHERE reporter_id = 'c4400000-0000-4000-8000-000000000002';
  report := public.review_marketplace_report(report.id, 'acknowledge', 'queue opened');
  IF report.status <> 'in_review' THEN RAISE EXCEPTION 'acknowledge did not open review'; END IF;
  report := public.review_marketplace_report(report.id, 'suspend_directory', 'visibility hold');
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_profiles
    WHERE coach_id = 'c4400000-0000-4000-8000-000000000001' AND directory_suspended
  ) THEN RAISE EXCEPTION 'directory was not suspended'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_moderation_actions
    WHERE report_id = report.id
      AND action = 'suspend_directory'
      AND actor = 'role:service_role'
  ) THEN RAISE EXCEPTION 'suspend action not audited with durable actor'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE coach_id = 'c4400000-0000-4000-8000-000000000001'
      AND client_id = 'c4400000-0000-4000-8000-000000000002'
      AND status = 'active'
  ) THEN RAISE EXCEPTION 'suspend ended coaching link'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_rows jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.coach_profiles
    WHERE coach_id = 'c4400000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'suspended profile leaked'; END IF;
  v_rows := public.explain_marketplace_matches();
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rows) e
    WHERE e->>'coach_id' = 'c4400000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'suspended coach remained in matching'; END IF;
  IF NOT public.is_client_of('c4400000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'suspend ended coaching link';
  END IF;
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    PERFORM public.request_coaching(
      'c4400000-0000-4000-8000-000000000001',
      'Stranger',
      'New request after hold',
      2,
      'c4400000-0000-4000-8000-000000000013'
    );
    RAISE EXCEPTION 'new request reached suspended coach';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coach_unavailable' THEN RAISE; END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.list_public_coach_qualifications('c4400000-0000-4000-8000-000000000001')
  ) THEN RAISE EXCEPTION 'suspended qualification badge leaked'; END IF;
  IF public.coach_has_verified_qualification('c4400000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'suspended verified badge leaked';
  END IF;
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000004');
DO $$
DECLARE
  r public.coach_join_requests;
BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE client_id = auth.uid() AND status = 'pending';
  IF NOT public.marketplace_open_prospect(r.coach_id, auth.uid()) THEN
    RAISE EXCEPTION 'in-flight pending prospect closed by suspend';
  END IF;
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key)
  VALUES (r.coach_id, auth.uid(), auth.uid(), 'still talking', 'reply');
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000001');
DO $$
DECLARE
  r public.coach_join_requests;
  p public.coach_profiles;
BEGIN
  SELECT * INTO p FROM public.coach_profiles WHERE coach_id = auth.uid();
  IF NOT p.directory_suspended THEN RAISE EXCEPTION 'owner lost suspended profile'; END IF;
  p := public.save_my_coach_profile(to_jsonb(p) || '{"directory_suspended":false,"published":true,"accepting_clients":true}', p.updated_at);
  IF NOT p.directory_suspended THEN RAISE EXCEPTION 'client flipped directory_suspended'; END IF;
  IF NOT public.is_coach_of('c4400000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'suspend ended coaching link';
  END IF;
  SELECT * INTO r FROM public.coach_join_requests
    WHERE coach_id = auth.uid() AND client_id = 'c4400000-0000-4000-8000-000000000004';
  PERFORM public.respond_coaching_request(r.id, 'accepted');
END $$;

SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000004');
DO $$
DECLARE
  r public.coach_join_requests;
BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE client_id = auth.uid() AND status = 'coach_accepted';
  PERFORM public.respond_coaching_request(r.id, 'confirmed');
  IF NOT public.is_client_of('c4400000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'in-flight confirm blocked by suspend';
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

DO $$
DECLARE
  report public.marketplace_reports;
BEGIN
  SELECT * INTO report FROM public.marketplace_reports
  WHERE reporter_id = 'c4400000-0000-4000-8000-000000000002';
  report := public.review_marketplace_report(report.id, 'restore_directory', 'hold lifted');
  PERFORM public.review_marketplace_report(report.id, 'resolve', 'closed');
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_profiles
    WHERE coach_id = 'c4400000-0000-4000-8000-000000000001' AND NOT directory_suspended
  ) THEN RAISE EXCEPTION 'directory was not restored'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c4400000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_rows jsonb;
  report public.marketplace_reports;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_profiles
    WHERE coach_id = 'c4400000-0000-4000-8000-000000000001' AND published
  ) THEN RAISE EXCEPTION 'restored profile still hidden'; END IF;
  v_rows := public.explain_marketplace_matches();
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rows) e
    WHERE e->>'coach_id' = 'c4400000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'restored coach missing from matching'; END IF;
  SELECT * INTO report FROM public.marketplace_reports WHERE reporter_id = auth.uid();
  IF report.status <> 'resolved' THEN RAISE EXCEPTION 'reporter lost status'; END IF;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
\echo 'p4.4 moderation: report queue, suspend directory, no ratings, no relationship end'
ROLLBACK;
