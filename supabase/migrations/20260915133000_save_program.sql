-- UX20 / lot 3 : une seule opération (métadonnées + jours + révision).
-- Échec ≠ nom à jour et jours à moitié. p_expected_updated_at refuse le stale.

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
  'UX20: metadata + days + revision in one transaction. Refuses stale expected_updated_at.';

REVOKE ALL ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program(uuid, text, text, int, jsonb, timestamptz) TO authenticated;
