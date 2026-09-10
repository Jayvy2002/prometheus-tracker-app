-- Coach-initiated roster unlink (soft). Does NOT delete auth.users, user_profiles,
-- or the coach's own profile. Demo/test clients are the same pattern: end the
-- assignment, keep the personal account.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to the live / backup project.

CREATE OR REPLACE FUNCTION public.end_coach_client_link(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Never unlink yourself / never touch the coach's own profile via this RPC.
  IF p_client_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_end_self');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.coach_client_links
    WHERE coach_id = v_uid
      AND client_id = p_client_id
      AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  -- Pause programs while is_coach_of still holds. Direct UPDATE of assignments
  -- after ending the link fails RLS WITH CHECK (is_coach_of).
  UPDATE public.program_assignments
  SET status = 'paused', updated_at = now()
  WHERE client_id = p_client_id
    AND assigned_by = v_uid
    AND status = 'active';

  UPDATE public.coach_client_links
  SET status = 'ended', updated_at = now()
  WHERE coach_id = v_uid
    AND client_id = p_client_id
    AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.end_coach_client_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_coach_client_link(uuid) TO authenticated;
