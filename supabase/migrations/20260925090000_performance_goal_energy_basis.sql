-- Audit 3 — an athlete can start with a performance goal from onboarding.
--
-- user_profiles.goal stays the energy basis read by the calorie calculators
-- (cut / maintain / bulk). A performance, health or other goal keeps
-- « maintain » as its energy basis: writing that basis in the profile (the
-- onboarding save, a coach sheet) is not a new goal and must not replace the
-- current one. Any other change of the profile goal is still recorded as
-- before (goal_start_internal), and the goal cycle (start_goal) is unchanged.

CREATE OR REPLACE FUNCTION public.record_profile_goal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_kind text;
BEGIN
  IF COALESCE(current_setting('prometheus.goal_rpc', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  IF NEW.goal IS NULL OR NEW.goal NOT IN ('cut', 'maintain', 'bulk') THEN
    RETURN NULL;
  END IF;
  -- A profile that never finished onboarding has no chosen goal yet (default ≠ choice).
  IF NOT COALESCE(NEW.onboarding_completed, false) THEN
    RETURN NULL;
  END IF;
  SELECT kind INTO v_current_kind
    FROM public.athlete_goals
   WHERE user_id = NEW.id AND status IN ('active', 'maintenance');
  IF v_current_kind IS NOT DISTINCT FROM NEW.goal THEN
    RETURN NULL;
  END IF;
  -- « maintain » is the energy basis of a performance / health / other goal.
  IF NEW.goal = 'maintain' AND v_current_kind IN ('performance', 'health', 'other') THEN
    RETURN NULL;
  END IF;
  PERFORM public.goal_start_internal(NEW.id, NEW.goal, '', NULL, NULL, 'profile', auth.uid(), false);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_profile_goal_change() FROM PUBLIC, anon, authenticated;
