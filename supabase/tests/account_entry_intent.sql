\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('a1790000-0000-4000-8000-000000000001','intent-a@example.test'),
 ('a1790000-0000-4000-8000-000000000002','intent-b@example.test');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1790000-0000-4000-8000-000000000001',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.choose_account_intent('find_coach');
 IF r->>'coaching_role'<>'none' THEN RAISE EXCEPTION 'search granted a role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND entry_intent='find_coach' AND onboarding_completed) THEN RAISE EXCEPTION 'intention not persisted'; END IF;
 IF EXISTS(SELECT 1 FROM public.coach_client_links WHERE client_id=auth.uid()) THEN RAISE EXCEPTION 'search created coaching link'; END IF;
 r:=public.choose_account_intent('coach');
 IF r->>'coaching_role'<>'coach' THEN RAISE EXCEPTION 'coach capability missing'; END IF;
 r:=public.choose_account_intent('solo');
 IF r->>'coaching_role'<>'coach' THEN RAISE EXCEPTION 'preference removed professional capability'; END IF;
 BEGIN PERFORM public.choose_account_intent('admin'); RAISE EXCEPTION 'invalid intention granted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'invalid_intent' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
CREATE FUNCTION public.intent_injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id='a1790000-0000-4000-8000-000000000002' AND NEW.entry_intent='coach' THEN RAISE EXCEPTION 'injected_profile_failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER intent_injected_failure BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.intent_injected_failure();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1790000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 BEGIN PERFORM public.choose_account_intent('coach'); RAISE EXCEPTION 'injection did not fail';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'injected_profile_failure' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'partial capability grant'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND entry_intent IS NOT NULL) THEN RAISE EXCEPTION 'partial profile change'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.choose_account_intent(text)','execute') THEN RAISE EXCEPTION 'anonymous intention write exposed'; END IF;
 IF (SELECT coaching_role FROM public.user_roles WHERE user_id='a1790000-0000-4000-8000-000000000002')<>'none' THEN RAISE EXCEPTION 'partial role update'; END IF;
END $$;
ROLLBACK;
\echo 'entry intention: identity preference, no synthetic client link, preserved capability and atomic rollback passed'
