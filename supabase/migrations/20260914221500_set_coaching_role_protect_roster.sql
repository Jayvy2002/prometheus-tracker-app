-- UX78 / lot 2 : refuser set_coaching_role('none') tant qu’un lien actif
-- coach_id = moi existe. Sinon le roster devient orphelin (plus de coach_capability).

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

  IF p_role = 'none' AND EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE coach_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'coach_has_active_clients';
  END IF;

  INSERT INTO user_roles (user_id, role, coaching_role)
  VALUES (v_uid, 'free', p_role)
  ON CONFLICT (user_id) DO UPDATE
    SET coaching_role = CASE
      WHEN user_roles.coaching_role = 'client' THEN 'client'
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

COMMENT ON FUNCTION public.set_coaching_role(text) IS
  'Write source for user_roles.coaching_role. Refuses none while the caller has active coach_id links.';

REVOKE ALL ON FUNCTION public.set_coaching_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_coaching_role(text) TO authenticated;
