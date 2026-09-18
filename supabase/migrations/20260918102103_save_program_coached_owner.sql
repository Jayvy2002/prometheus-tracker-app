-- P1.2: ownership is not enough to edit an assigned plan while coached.
-- accept_coach_invite / activate_coaching_relationship do not pause a leftover
-- Solo self-assignment, so save_program must refuse that write on the server.

CREATE OR REPLACE FUNCTION public.save_program(
  p_program_id uuid,
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_seen timestamptz;
  v_name text;
  v_weeks int;
  v_days int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  v_weeks := GREATEST(1, LEAST(52, COALESCE(p_duration_weeks, 8)));

  SELECT p.owner_id, p.updated_at
    INTO v_owner, v_seen
  FROM public.programs p
  WHERE p.id = p_program_id
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.coach_client_links l
    WHERE l.client_id = v_uid
      AND l.status = 'active'
  ) AND EXISTS (
    SELECT 1
    FROM public.program_assignments a
    WHERE a.program_id = p_program_id
      AND a.client_id = v_uid
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Coached client cannot edit assigned program';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_seen IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stale';
  END IF;

  UPDATE public.programs
  SET
    name = v_name,
    description = COALESCE(p_description, ''),
    duration_weeks = v_weeks
  WHERE id = p_program_id;

  -- sync_program_days met à jour updated_at et fige une révision.
  v_days := public.sync_program_days(p_program_id, p_days);
  RETURN v_days;
END;
$$;

COMMENT ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) IS
  'UX20 + P1.2: metadata + days + revision. Owner write refused while the caller is coached on this active assignment.';

REVOKE ALL ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) TO authenticated;
