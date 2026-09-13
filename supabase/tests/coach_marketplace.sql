\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('a1780000-0000-4000-8000-000000000001','market-coach@example.test'),
 ('a1780000-0000-4000-8000-000000000002','market-other@example.test'),
 ('a1780000-0000-4000-8000-000000000003','market-client@example.test'),
 ('a1780000-0000-4000-8000-000000000004','market-stranger@example.test');
UPDATE public.user_roles SET coaching_role='coach' WHERE user_id IN ('a1780000-0000-4000-8000-000000000001','a1780000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000001',true);
SELECT public.save_my_coach_profile('{"public_name":"Coach A","introduction":"Experience","method":"Weekly contact","offer":"Service terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.coach_profiles) THEN RAISE EXCEPTION 'unpublished profile exposed'; END IF;
 IF public.marketplace_coach_eligible('a1780000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'private capability exposed'; END IF;
 BEGIN PERFORM public.save_my_coach_profile('{"public_name":"Impersonation"}'); RAISE EXCEPTION 'non coach published';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'coach_required' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000001',true);
DO $$ DECLARE p public.coach_profiles; BEGIN
 SELECT * INTO p FROM public.coach_profiles WHERE coach_id=auth.uid();
 PERFORM public.save_my_coach_profile(to_jsonb(p)||'{"published":true,"accepting_clients":true}',p.updated_at);
 BEGIN PERFORM public.save_my_coach_profile(to_jsonb(p),p.updated_at); RAISE EXCEPTION 'lost update allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'profile_changed' THEN RAISE; END IF; END;
 BEGIN UPDATE public.coach_profiles SET published=false; RAISE EXCEPTION 'direct write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000003',true);
DO $$ DECLARE a public.coach_join_requests; b public.coach_join_requests; BEGIN
 IF (SELECT count(*) FROM public.coach_profiles)<>1 THEN RAISE EXCEPTION 'published profile not readable'; END IF;
 BEGIN PERFORM public.request_coaching('a1780000-0000-4000-8000-000000000001','Client','Only shared summary',NULL); RAISE EXCEPTION 'missing consent accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'consent_required' THEN RAISE; END IF; END;
 a:=public.request_coaching('a1780000-0000-4000-8000-000000000001','Client','Only shared summary',1);
 b:=public.request_coaching('a1780000-0000-4000-8000-000000000001','Client','Retry must not replace the original summary',1);
 IF a.id<>b.id OR b.summary<>'Only shared summary' THEN RAISE EXCEPTION 'duplicate request'; END IF;
 BEGIN PERFORM public.respond_coaching_request(a.id,'accepted'); RAISE EXCEPTION 'client accepted own request';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'not_authorized' THEN RAISE; END IF; END;
 BEGIN UPDATE public.coach_join_requests SET status='accepted'; RAISE EXCEPTION 'direct status write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.coach_client_links WHERE client_id='a1780000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'request activated coaching'; END IF;
 IF has_function_privilege('anon','public.request_coaching(uuid,text,text,integer)','execute') THEN RAISE EXCEPTION 'anonymous request surface'; END IF;
 IF has_table_privilege('anon','public.coach_profiles','select') THEN RAISE EXCEPTION 'anonymous directory'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.coach_join_requests) THEN RAISE EXCEPTION 'cross coach request leak'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000001',true);
DO $$ DECLARE r public.coach_join_requests; BEGIN
 SELECT * INTO r FROM public.coach_join_requests WHERE coach_id=auth.uid();
 PERFORM public.respond_coaching_request(r.id,'accepted');
 PERFORM public.respond_coaching_request(r.id,'accepted');
 IF public.is_coach_of(r.client_id) THEN RAISE EXCEPTION 'agreement granted dossier access'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_profiles WHERE id=r.client_id) THEN RAISE EXCEPTION 'prospect private profile exposed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000003',true);
DO $$ DECLARE r public.coach_join_requests; BEGIN
 SELECT * INTO r FROM public.coach_join_requests WHERE client_id=auth.uid();
 r:=public.respond_coaching_request(r.id,'withdrawn');
 IF r.status<>'withdrawn' THEN RAISE EXCEPTION 'accepted request cannot be withdrawn'; END IF;
 PERFORM public.respond_coaching_request(r.id,'withdrawn');
END $$;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000001',true);
DO $$ DECLARE p public.coach_profiles; BEGIN
 SELECT * INTO p FROM public.coach_profiles WHERE coach_id=auth.uid();
 PERFORM public.save_my_coach_profile(to_jsonb(p)||'{"published":false}',p.updated_at);
END $$;
SELECT set_config('request.jwt.claim.sub','a1780000-0000-4000-8000-000000000004',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.coach_profiles) OR EXISTS(SELECT 1 FROM public.coach_join_requests) THEN RAISE EXCEPTION 'withdrawal or request isolation failed'; END IF;
 BEGIN PERFORM public.request_coaching('a1780000-0000-4000-8000-000000000001','Stranger','Summary',1); RAISE EXCEPTION 'unpublished coach requested';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'coach_unavailable' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'marketplace: publication, optimistic concurrency, consent, idempotency, isolation and agreement without dossier access passed'
