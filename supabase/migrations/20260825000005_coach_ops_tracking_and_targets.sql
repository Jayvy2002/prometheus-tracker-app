-- Coach-ops: per-client tracking config + narrow RPC to set nutrition targets.
-- Alerts stay as batched client queries (RLS via is_coach_of). This RPC exists
-- so a coach cannot UPDATE arbitrary user_profiles columns.

CREATE TABLE IF NOT EXISTS client_tracking_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_weight boolean NOT NULL DEFAULT true,
  track_checkins boolean NOT NULL DEFAULT true,
  track_nutrition boolean NOT NULL DEFAULT true,
  track_workouts boolean NOT NULL DEFAULT true,
  workout_focus text NOT NULL DEFAULT '',
  setup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id),
  CHECK (coach_id <> client_id)
);

CREATE INDEX IF NOT EXISTS client_tracking_config_client_idx
  ON client_tracking_config (client_id);

ALTER TABLE client_tracking_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches manage tracking for their clients" ON client_tracking_config;
CREATE POLICY "Coaches manage tracking for their clients"
  ON client_tracking_config FOR ALL TO authenticated
  USING (coach_id = (select auth.uid()) AND public.is_coach_of(client_id))
  WITH CHECK (coach_id = (select auth.uid()) AND public.is_coach_of(client_id));

DROP POLICY IF EXISTS "Clients can read their tracking config" ON client_tracking_config;
CREATE POLICY "Clients can read their tracking config"
  ON client_tracking_config FOR SELECT TO authenticated
  USING (client_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_tracking_config TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_set_client_nutrition_targets(
  p_client_id uuid,
  p_calories integer,
  p_protein integer,
  p_carbs integer,
  p_fat integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_coach_of(p_client_id) THEN
    RAISE EXCEPTION 'Not this client''s coach';
  END IF;
  IF p_calories IS NULL OR p_calories < 800 OR p_calories > 8000 THEN
    RAISE EXCEPTION 'Invalid calorie target';
  END IF;
  IF p_protein IS NULL OR p_protein < 0 OR p_protein > 500
     OR p_carbs IS NULL OR p_carbs < 0 OR p_carbs > 800
     OR p_fat IS NULL OR p_fat < 0 OR p_fat > 400 THEN
    RAISE EXCEPTION 'Invalid macro target';
  END IF;

  UPDATE user_profiles
  SET
    daily_calorie_target = p_calories,
    protein_target = p_protein,
    carbs_target = p_carbs,
    fat_target = p_fat,
    updated_at = now()
  WHERE id = p_client_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_set_client_nutrition_targets(uuid, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_set_client_nutrition_targets(uuid, integer, integer, integer, integer) TO authenticated;
