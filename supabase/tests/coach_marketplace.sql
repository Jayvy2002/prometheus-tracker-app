-- M4–M5 + M4b — annuaire opt-in.
-- Preuve : publication privée, concurrence, consentement, isolation,
-- et une demande acceptée active le lien de coaching sans paiement.
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
 ('a1780000-0000-4000-8000-000000000001', 'market-coach@example.test'),
 ('a1780000-0000-4000-8000-000000000002', 'market-other@example.test'),
 ('a1780000-0000-4000-8000-000000000003', 'market-client@example.test'),
 ('a1780000-0000-4000-8000-000000000004', 'market-stranger@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('a1780000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('a1780000-0000-4000-8000-000000000002', 'free', 'coach'),
 ('a1780000-0000-4000-8000-000000000003', 'free', 'none'),
 ('a1780000-0000-4000-8000-000000000004', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;

DO $$ BEGIN
  IF to_regclass('public.coach_profiles') IS NULL OR to_regclass('public.coach_join_requests') IS NULL THEN
    RAISE EXCEPTION 'marketplace tables missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.coach_profiles'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.coach_join_requests'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled on marketplace tables';
  END IF;
  IF has_table_privilege('authenticated', 'public.coach_profiles', 'insert')
     OR has_table_privilege('authenticated', 'public.coach_profiles', 'update')
     OR has_table_privilege('authenticated', 'public.coach_profiles', 'delete')
     OR has_table_privilege('authenticated', 'public.coach_join_requests', 'insert')
     OR has_table_privilege('authenticated', 'public.coach_join_requests', 'update')
     OR has_table_privilege('authenticated', 'public.coach_join_requests', 'delete') THEN
    RAISE EXCEPTION 'direct marketplace writes granted';
  END IF;
  IF has_table_privilege('anon', 'public.coach_profiles', 'select')
     OR has_table_privilege('anon', 'public.coach_join_requests', 'select') THEN
    RAISE EXCEPTION 'anonymous directory';
  END IF;
  IF has_function_privilege('anon', 'public.request_coaching(uuid,text,text,integer,uuid)', 'execute')
     OR has_function_privilege('anon', 'public.respond_coaching_request(uuid,text)', 'execute')
     OR has_function_privilege('anon', 'public.save_my_coach_profile(jsonb,timestamptz)', 'execute')
     OR has_function_privilege('anon', 'public.activate_coaching_relationship(uuid,uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.activate_coaching_relationship(uuid,uuid)', 'execute') THEN
    RAISE EXCEPTION 'anonymous request surface';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000001');
SELECT public.save_my_coach_profile('{"public_name":"Coach A","introduction":"Experience","method":"Weekly contact","offer":"Service terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.coach_profiles) THEN RAISE EXCEPTION 'unpublished profile exposed'; END IF;
  IF public.marketplace_coach_eligible('a1780000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'private capability exposed'; END IF;
  BEGIN
    PERFORM public.save_my_coach_profile('{"public_name":"Impersonation"}');
    RAISE EXCEPTION 'non coach published';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coach_required' THEN RAISE; END IF;
  END;
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000001');
DO $$ DECLARE p public.coach_profiles; BEGIN
  SELECT * INTO p FROM public.coach_profiles WHERE coach_id = auth.uid();
  PERFORM public.save_my_coach_profile(to_jsonb(p) || '{"published":true,"accepting_clients":true}', p.updated_at);
  BEGIN
    PERFORM public.save_my_coach_profile(to_jsonb(p), p.updated_at);
    RAISE EXCEPTION 'lost update allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'profile_changed' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.coach_profiles SET published = false;
    RAISE EXCEPTION 'direct write allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000003');
DO $$ DECLARE a public.coach_join_requests; b public.coach_join_requests; BEGIN
  IF (SELECT count(*) FROM public.coach_profiles) <> 1 THEN RAISE EXCEPTION 'published profile not readable'; END IF;
  BEGIN
    PERFORM public.request_coaching('a1780000-0000-4000-8000-000000000001', 'Client', 'Only shared summary', NULL, 'a1780000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'missing consent accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'consent_required' THEN RAISE; END IF;
  END;
  a := public.request_coaching('a1780000-0000-4000-8000-000000000001', 'Client', 'Only shared summary', 2, 'a1780000-0000-4000-8000-000000000010');
  b := public.request_coaching('a1780000-0000-4000-8000-000000000001', 'Client', 'Retry must not replace the original summary', 2, 'a1780000-0000-4000-8000-000000000010');
  IF a.id <> b.id OR b.summary <> 'Only shared summary' THEN RAISE EXCEPTION 'duplicate request'; END IF;
  BEGIN
    PERFORM public.respond_coaching_request(a.id, 'accepted');
    RAISE EXCEPTION 'client accepted own request';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_authorized' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.coach_join_requests SET status = 'accepted';
    RAISE EXCEPTION 'direct status write allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.coach_client_links WHERE client_id = 'a1780000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'request activated coaching';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000002');
DO $$ DECLARE p public.coach_profiles; BEGIN
  IF EXISTS (SELECT 1 FROM public.coach_join_requests) THEN RAISE EXCEPTION 'cross coach request leak'; END IF;
  PERFORM public.save_my_coach_profile('{"public_name":"Coach B","introduction":"Experience","method":"Weekly contact","offer":"Service terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
  SELECT * INTO p FROM public.coach_profiles WHERE coach_id = auth.uid();
  PERFORM public.save_my_coach_profile(to_jsonb(p) || '{"published":true,"accepting_clients":true}', p.updated_at);
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000003');
DO $$ BEGIN
  PERFORM public.request_coaching('a1780000-0000-4000-8000-000000000002', 'Client', 'Second coach while waiting', 2, 'a1780000-0000-4000-8000-000000000012');
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000001');
DO $$ DECLARE r public.coach_join_requests; BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE coach_id = auth.uid() AND status = 'pending';
  PERFORM public.respond_coaching_request(r.id, 'accepted');
  PERFORM public.respond_coaching_request(r.id, 'accepted');
  IF NOT public.is_coach_of(r.client_id) THEN RAISE EXCEPTION 'acceptance did not grant dossier access'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coach_client_links WHERE client_id = r.client_id AND coach_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'acceptance did not create a coaching link';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_relationship_consents
    WHERE join_request_id = r.id AND client_id = r.client_id AND source = 'directory_request' AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'directory consent missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_tracking_config
    WHERE coach_id = auth.uid() AND client_id = r.client_id
  ) THEN
    RAISE EXCEPTION 'tracking config missing';
  END IF;
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000002');
DO $$ DECLARE r public.coach_join_requests; BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE coach_id = auth.uid();
  IF r.status <> 'withdrawn' THEN RAISE EXCEPTION 'other pending request not withdrawn'; END IF;
  BEGIN
    PERFORM public.respond_coaching_request(r.id, 'accepted');
    RAISE EXCEPTION 'withdrawn request accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'request_closed' THEN RAISE; END IF;
  END;
  IF public.is_coach_of('a1780000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'other coach gained dossier access';
  END IF;
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000003');
DO $$ DECLARE r public.coach_join_requests; ended jsonb; BEGIN
  SELECT * INTO r FROM public.coach_join_requests WHERE client_id = auth.uid() AND status = 'accepted';
  BEGIN
    PERFORM public.respond_coaching_request(r.id, 'withdrawn');
    RAISE EXCEPTION 'accepted request withdrawn without ending the link';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'request_closed' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.request_coaching('a1780000-0000-4000-8000-000000000002', 'Client', 'Already coached', 2, 'a1780000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'second coach requested while linked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'already_coached' THEN RAISE; END IF;
  END;
  IF (SELECT coaching_role FROM public.user_roles WHERE user_id = auth.uid()) <> 'client' THEN
    RAISE EXCEPTION 'client role not assigned';
  END IF;
  ended := public.client_end_coach_link();
  IF ended->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'directory departure failed'; END IF;
  r := public.request_coaching('a1780000-0000-4000-8000-000000000001', 'Client', 'Only shared summary', 2, 'a1780000-0000-4000-8000-000000000014');
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'new request after departure blocked'; END IF;
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000001');
DO $$ DECLARE p public.coach_profiles; BEGIN
  SELECT * INTO p FROM public.coach_profiles WHERE coach_id = auth.uid();
  PERFORM public.save_my_coach_profile(to_jsonb(p) || '{"published":false}', p.updated_at);
END $$;
SELECT pg_temp.as_user('a1780000-0000-4000-8000-000000000004');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.coach_join_requests) THEN
    RAISE EXCEPTION 'stranger saw another users requests';
  END IF;
  BEGIN
    PERFORM public.request_coaching('a1780000-0000-4000-8000-000000000001', 'Stranger', 'Summary', 2, 'a1780000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'unpublished coach requested';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'coach_unavailable' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'marketplace: publication, consent, isolation, acceptance activates coaching, departure restores a new request'
