\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('c0750000-0000-4000-8000-000000000001','consent-coach@example.test'),
 ('c0750000-0000-4000-8000-000000000002','consent-client@example.test'),
 ('c0750000-0000-4000-8000-000000000003','consent-other@example.test');
INSERT INTO public.user_roles(user_id,role,coaching_role) VALUES
 ('c0750000-0000-4000-8000-000000000001','free','coach'),
 ('c0750000-0000-4000-8000-000000000002','free','none'),
 ('c0750000-0000-4000-8000-000000000003','free','none')
 ON CONFLICT(user_id) DO UPDATE SET coaching_role=excluded.coaching_role;
INSERT INTO public.coach_invites(id,coach_id,token,expires_at,max_uses)
 VALUES('c0750000-0000-4000-8000-000000000010','c0750000-0000-4000-8000-000000000001','consent-token',now()+interval '1 hour',1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c0750000-0000-4000-8000-000000000002',true);
DO $$ DECLARE result jsonb; BEGIN
 result:=public.accept_coach_invite('consent-token',2,ARRAY['profile']);
 IF result->>'error' IS DISTINCT FROM 'consent_version_required' THEN RAISE EXCEPTION 'obsolete consent accepted'; END IF;
 result:=public.accept_coach_invite('consent-token',1,ARRAY['profile']);
 IF result->>'error' IS DISTINCT FROM 'invalid_consent_scope' THEN RAISE EXCEPTION 'partial scope accepted'; END IF;
 BEGIN
  PERFORM public.accept_coach_invite('consent-token');
  RAISE EXCEPTION 'legacy acceptance bypass allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 result:=public.accept_coach_invite('consent-token',1,ARRAY['checkins','messages','nutrition','profile','program','progress_photos','questionnaire','workouts']);
 IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'consent_version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'valid consent rejected'; END IF;
 IF (SELECT count(*) FROM public.coaching_relationship_consents)<>1 THEN RAISE EXCEPTION 'client cannot read own consent'; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c0750000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.coaching_relationship_consents)<>0 THEN RAISE EXCEPTION 'consent exposed to third party'; END IF;
END $$;
RESET ROLE;
UPDATE public.coach_client_links SET status='ended' WHERE client_id='c0750000-0000-4000-8000-000000000002';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.coaching_relationship_consents WHERE revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'departure did not revoke consent'; END IF;
END $$;
ROLLBACK;
\echo 'relationship consent: version, complete scope, isolation, legacy lock and revocation passed'
