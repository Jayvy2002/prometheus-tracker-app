-- P4.3 prospect messaging: conversation after coach_accepted, no dossier.
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
 ('c4300000-0000-4000-8000-000000000001', 'p43-coach@example.test'),
 ('c4300000-0000-4000-8000-000000000002', 'p43-athlete@example.test'),
 ('c4300000-0000-4000-8000-000000000003', 'p43-stranger@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c4300000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c4300000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c4300000-0000-4000-8000-000000000003', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;

DO $$ BEGIN
  IF NOT has_function_privilege('authenticated', 'public.marketplace_open_prospect(uuid,uuid)', 'execute')
     OR has_function_privilege('anon', 'public.marketplace_open_prospect(uuid,uuid)', 'execute') THEN
    RAISE EXCEPTION 'prospect helper grants mismatch';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000001');
SELECT public.save_my_coach_profile('{"public_name":"Prospect Coach","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true}');

SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000002');
SELECT public.request_coaching('c4300000-0000-4000-8000-000000000001', 'Athlete', 'Looking for a coach', 2, 'c4300000-0000-4000-8000-000000000010');

DO $$ BEGIN
  BEGIN
    INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key)
    VALUES ('c4300000-0000-4000-8000-000000000001', auth.uid(), auth.uid(), 'too early', 'reply');
    RAISE EXCEPTION 'pending athlete messaged';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%row-level security%' AND SQLERRM NOT LIKE 'new row violates%' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000001');
DO $$
DECLARE
  r public.coach_join_requests;
BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE coach_id = auth.uid();
  PERFORM public.respond_coaching_request(r.id, 'accepted');
  IF public.is_coach_of(r.client_id) THEN RAISE EXCEPTION 'prospect gained is_coach_of'; END IF;
  BEGIN
    INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key)
    VALUES (auth.uid(), r.client_id, auth.uid(), 'nudge', 'missed_training');
    RAISE EXCEPTION 'prospect sent tracking nudge';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%row-level security%' AND SQLERRM NOT LIKE 'new row violates%' THEN RAISE; END IF;
  END;
  IF NOT public.marketplace_open_prospect(auth.uid(), r.client_id) THEN
    RAISE EXCEPTION 'open prospect helper false after accept';
  END IF;
  BEGIN
    PERFORM 1 FROM public.fetch_thread_messages(r.client_id) AS thread_row;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'empty prospect thread unauthorized';
  END;
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key)
  VALUES (auth.uid(), r.client_id, auth.uid(), 'Hello prospect', 'prospect');
END $$;

SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000002');
DO $$
DECLARE
  n int;
BEGIN
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key)
  VALUES ('c4300000-0000-4000-8000-000000000001', auth.uid(), auth.uid(), 'Hello coach', 'reply');
  SELECT count(*) INTO n FROM public.coach_messages
    WHERE coach_id = 'c4300000-0000-4000-8000-000000000001' AND client_id = auth.uid();
  IF n <> 2 THEN RAISE EXCEPTION 'thread did not keep both messages'; END IF;
  INSERT INTO public.progress_photos(user_id, kind, storage_path) VALUES (auth.uid(), 'front', auth.uid()::text || '/p.jpg');
END $$;

SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.progress_photos WHERE user_id = 'c4300000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'prospect coach read photos';
  END IF;
  IF public.is_coach_of('c4300000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'is_coach_of true before confirm';
  END IF;
END $$;

SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key)
    VALUES ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002', auth.uid(), 'intrusion', 'reply');
    RAISE EXCEPTION 'stranger inserted into prospect thread';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%row-level security%' AND SQLERRM NOT LIKE 'new row violates%' AND SQLERRM NOT LIKE 'permission denied%' THEN
      IF SQLERRM LIKE 'violates check constraint%' THEN NULL; ELSE RAISE; END IF;
    END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.coach_messages) THEN RAISE EXCEPTION 'stranger read prospect thread'; END IF;
END $$;

SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000002');
DO $$
DECLARE
  r public.coach_join_requests;
  n int;
BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE client_id = auth.uid() AND status = 'coach_accepted';
  PERFORM public.respond_coaching_request(r.id, 'confirmed');
  SELECT count(*) INTO n FROM public.coach_messages
    WHERE coach_id = 'c4300000-0000-4000-8000-000000000001' AND client_id = auth.uid();
  IF n <> 2 THEN RAISE EXCEPTION 'activation dropped prospect thread'; END IF;
END $$;

SELECT pg_temp.as_user('c4300000-0000-4000-8000-000000000001');
DO $$
DECLARE
  n int;
BEGIN
  IF NOT public.is_coach_of('c4300000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'confirm did not grant is_coach_of';
  END IF;
  SELECT count(*) INTO n FROM public.fetch_thread_messages('c4300000-0000-4000-8000-000000000002');
  IF n <> 2 THEN RAISE EXCEPTION 'active thread lost prospect messages'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.progress_photos WHERE user_id = 'c4300000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'active coach still cannot read photos';
  END IF;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
\echo 'p4.3 prospect messaging: conversation after accept, no dossier until confirm'
ROLLBACK;
