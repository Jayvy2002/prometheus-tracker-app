-- Presentation preference only. Capabilities and active links remain authoritative.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS entry_intent text
 CHECK(entry_intent IN ('solo','find_coach','coach'));
-- Existing accounts keep their current experience. Do not mark a questionnaire as completed.
UPDATE public.user_profiles p SET entry_intent=CASE
 WHEN r.coaching_role='coach' THEN 'coach'
 WHEN r.coaching_role='client' THEN 'find_coach' ELSE 'solo' END
FROM public.user_roles r WHERE r.user_id=p.id AND p.entry_intent IS NULL;

CREATE OR REPLACE FUNCTION public.choose_account_intent(p_intent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid:=auth.uid(); v_role text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_intent IS NULL OR p_intent NOT IN ('solo','find_coach','coach') THEN RAISE EXCEPTION 'invalid_intent'; END IF;
 IF p_intent='coach' THEN
   v_role:=public.set_coaching_role('coach');
   IF v_role<>'coach' THEN RAISE EXCEPTION 'coach_capability_unavailable'; END IF;
 ELSE
   SELECT coaching_role INTO v_role FROM public.user_roles WHERE user_id=v_uid;
 END IF;
 UPDATE public.user_profiles SET entry_intent=p_intent,onboarding_completed=true,updated_at=clock_timestamp() WHERE id=v_uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
 RETURN jsonb_build_object('user_id',v_uid,'intent',p_intent,'coaching_role',coalesce(v_role,'none'));
END $$;
REVOKE ALL ON FUNCTION public.choose_account_intent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_account_intent(text) TO authenticated;
