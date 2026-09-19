-- P1.5 commercial durations. Candidate only: apply in isolated CI, not production.
-- Unique SQL definitions: Solo trial = 14 days, Coach grace = 7 days.
-- Prices remain undecided. No billing wall, no coach_grace_ends_at (P6).
-- Historical 30-day stamps in earlier migrations stay as history.

CREATE OR REPLACE FUNCTION public.solo_trial_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$ SELECT interval '14 days' $$;

CREATE OR REPLACE FUNCTION public.coach_grace_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$ SELECT interval '7 days' $$;

COMMENT ON FUNCTION public.solo_trial_interval() IS
  'P1.5 unique SQL definition: Solo trial after a coaching link ends is 14 days. Billing wall is P6.';
COMMENT ON FUNCTION public.coach_grace_interval() IS
  'P1.5 unique SQL definition: Coach payment grace is 7 days. No column or billing wall until P6.';

REVOKE ALL ON FUNCTION public.solo_trial_interval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coach_grace_interval() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_trial_interval() TO service_role;
GRANT EXECUTE ON FUNCTION public.coach_grace_interval() TO service_role;

COMMENT ON COLUMN public.user_profiles.solo_trial_ends_at IS
  'End of the unique lifetime Solo trial started when a coaching link first ended (14 days). A later unlink keeps this timestamp, even if it already expired. Billing gate is P6 — no hard wall until then.';

CREATE OR REPLACE FUNCTION public.transition_client_to_solo(p_coach_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_coach_id IS NULL OR p_client_id IS NULL OR p_coach_id = p_client_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pair');
  END IF;

  PERFORM 1 FROM public.user_roles WHERE user_id = p_client_id FOR UPDATE;

  PERFORM 1
  FROM public.coach_client_links
  WHERE coach_id = p_coach_id
    AND client_id = p_client_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  UPDATE public.program_assignments
  SET status = 'paused', updated_at = now()
  WHERE client_id = p_client_id
    AND assigned_by = p_coach_id
    AND status = 'active';

  UPDATE public.coach_client_links
  SET status = 'ended', updated_at = now()
  WHERE coach_id = p_coach_id
    AND client_id = p_client_id
    AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  UPDATE public.user_roles
  SET coaching_role = 'none', updated_at = now()
  WHERE user_id = p_client_id
    AND coaching_role = 'client';

  DELETE FROM public.client_tracking_config
  WHERE client_id = p_client_id
    AND coach_id = p_coach_id;

  UPDATE public.user_profiles
  SET coach_link_ended_at = now(),
      solo_trial_ends_at = COALESCE(solo_trial_ends_at, now() + public.solo_trial_interval()),
      updated_at = now()
  WHERE id = p_client_id;

  IF auth.uid() = p_client_id THEN
    INSERT INTO public.coach_relationship_notices (coach_id, client_id, client_name)
    SELECT p_coach_id, p_client_id, COALESCE(
      (SELECT full_name FROM public.user_profiles WHERE id = p_client_id),
      ''
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_client_to_solo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_client_to_solo(uuid, uuid) TO service_role;
