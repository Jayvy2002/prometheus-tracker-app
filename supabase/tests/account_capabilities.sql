\set ON_ERROR_STOP on
BEGIN;
-- Backfill matches the existing professional capability, never an admin/subscription role.
DO $$ BEGIN
 IF EXISTS(
  SELECT user_id FROM public.user_roles WHERE coaching_role='coach'
  EXCEPT SELECT user_id FROM public.user_capabilities WHERE capability='coach'
 ) THEN RAISE EXCEPTION 'coach backfill missing'; END IF;
 IF EXISTS(
  SELECT user_id FROM public.user_capabilities WHERE capability='coach'
  EXCEPT SELECT user_id FROM public.user_roles WHERE coaching_role='coach'
 ) THEN RAISE EXCEPTION 'unexpected coach capability'; END IF;
 IF has_function_privilege('anon','public.get_my_account_context()','execute') THEN RAISE EXCEPTION 'anonymous context exposed'; END IF;
 IF has_function_privilege('authenticated','public.sync_legacy_coach_capability()','execute') THEN RAISE EXCEPTION 'sync helper exposed'; END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('a1760000-0000-4000-8000-000000000001','capability-a@example.test'),
 ('a1760000-0000-4000-8000-000000000002','capability-b@example.test');
INSERT INTO public.user_roles(user_id,role,coaching_role) VALUES
 ('a1760000-0000-4000-8000-000000000001','free','coach'),
 ('a1760000-0000-4000-8000-000000000002','free','coach')
 ON CONFLICT(user_id) DO UPDATE SET coaching_role=excluded.coaching_role;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1760000-0000-4000-8000-000000000001',true);
DO $$ DECLARE context jsonb; BEGIN
 context:=public.get_my_account_context();
 IF context->>'user_id' IS DISTINCT FROM 'a1760000-0000-4000-8000-000000000001'
 OR context->>'coach_capability' IS DISTINCT FROM 'true' OR context->>'active_coach_id' IS NOT NULL
 THEN RAISE EXCEPTION 'independent coach context invalid'; END IF;
 IF (SELECT count(*) FROM public.user_capabilities)<>1 THEN RAISE EXCEPTION 'another account capability visible'; END IF;
 BEGIN
  INSERT INTO public.user_capabilities(user_id,capability) VALUES(auth.uid(),'coach');
  RAISE EXCEPTION 'capability forgery allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.coach_client_links(coach_id,client_id,status) VALUES
 ('a1760000-0000-4000-8000-000000000002','a1760000-0000-4000-8000-000000000001','active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1760000-0000-4000-8000-000000000001',true);
DO $$ DECLARE context jsonb; BEGIN
 context:=public.get_my_account_context();
 IF context->>'coach_capability' IS DISTINCT FROM 'true'
 OR context->>'active_coach_id' IS DISTINCT FROM 'a1760000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'professional and personal roles conflated'; END IF;
END $$;
RESET ROLE;
UPDATE public.coach_client_links SET status='ended' WHERE client_id='a1760000-0000-4000-8000-000000000001';
UPDATE public.user_roles SET coaching_role='none' WHERE user_id='a1760000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1760000-0000-4000-8000-000000000001',true);
DO $$ DECLARE context jsonb; BEGIN
 context:=public.get_my_account_context();
 IF context->>'coach_capability' IS DISTINCT FROM 'false' OR context->>'active_coach_id' IS NOT NULL
 THEN RAISE EXCEPTION 'legacy disable not synchronized'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'account capabilities: backfill, isolation, independent relationship and legacy sync passed'
