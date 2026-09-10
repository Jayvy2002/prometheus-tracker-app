-- docs/VISION.md point 4: « Un client dont le lien est coupé redevient solo, historique intact. »
--
-- Until now end_coach_client_link only ended the link and paused the program: the athlete kept
-- coaching_role = 'client' with no coach — a coached UI with nobody behind it (no copilot, stats
-- redirected, Messages pointing to nothing). Now the RPC hands the account back to solo and starts
-- the solo trial the product will later gate on (billing is not built yet — no hard wall here).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS coach_link_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS solo_trial_ends_at timestamptz;

COMMENT ON COLUMN public.user_profiles.coach_link_ended_at IS
  'Last time a coach ended the link. Drives the « ton coach a mis fin au lien » notice on the solo home. Cleared by the client-side ack only visually (localStorage), kept here as history.';
COMMENT ON COLUMN public.user_profiles.solo_trial_ends_at IS
  'End of the solo trial started when a coach ended the link (30 days, never shortened by a later unlink). Billing gate to come — no hard wall until then.';

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

  -- Pause the coach's programs while is_coach_of still holds (RLS WITH CHECK).
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

  -- Back to solo: role, then the coach's tracking config (solo = every module on).
  UPDATE public.user_roles
  SET coaching_role = 'none', updated_at = now()
  WHERE user_id = p_client_id
    AND coaching_role = 'client';

  DELETE FROM public.client_tracking_config
  WHERE client_id = p_client_id
    AND coach_id = v_uid;

  -- Notice + trial. Targets, history, photos, paused program: all kept.
  UPDATE public.user_profiles
  SET coach_link_ended_at = now(),
      solo_trial_ends_at = COALESCE(solo_trial_ends_at, now() + interval '30 days'),
      updated_at = now()
  WHERE id = p_client_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.end_coach_client_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_coach_client_link(uuid) TO authenticated;
