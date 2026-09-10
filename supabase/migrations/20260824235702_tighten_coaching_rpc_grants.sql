-- Invite preview stays public (landing page before signup).
GRANT EXECUTE ON FUNCTION public.get_coach_invite_preview(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_coaching_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_coaching_role(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_coach_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_coach_invite(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_coach_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_of(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_client_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_client_of(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;