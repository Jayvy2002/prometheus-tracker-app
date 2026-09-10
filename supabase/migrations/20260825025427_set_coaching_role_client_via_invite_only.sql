-- Client coaching_role is assigned only by accept_coach_invite.
-- Public auth may still claim 'coach' from the coach picker; it must not
-- create a stray client with no coach via set_coaching_role('client').

CREATE OR REPLACE FUNCTION public.set_coaching_role(p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_role NOT IN ('none', 'coach') THEN
    RAISE EXCEPTION 'Invalid coaching role';
  END IF;

  INSERT INTO user_roles (user_id, role, coaching_role)
  VALUES (v_uid, 'free', p_role)
  ON CONFLICT (user_id) DO UPDATE
    SET coaching_role = CASE
      WHEN user_roles.coaching_role = 'client' AND p_role = 'none' THEN 'client'
      WHEN p_role = 'coach' THEN 'coach'
      WHEN user_roles.coaching_role = 'coach' AND p_role = 'none' THEN
        CASE WHEN EXISTS (
          SELECT 1 FROM coach_client_links
          WHERE client_id = v_uid AND status = 'active'
        ) THEN 'client' ELSE 'none' END
      ELSE p_role
    END,
    updated_at = now()
  RETURNING coaching_role INTO v_current;

  RETURN v_current;
END;
$$;

REVOKE ALL ON FUNCTION public.set_coaching_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_coaching_role(text) TO authenticated;
