-- Per-client tracking variables (training / nutrition / check-in) + coach defaults
-- + coach-editable client-visible profile fields.
-- Coaching copy only: phyuijjekxtjvipjtdfv. Do not apply to live tracker or backup.

ALTER TABLE public.client_tracking_config
  ADD COLUMN IF NOT EXISTS training_vars jsonb NOT NULL DEFAULT '{
    "sets": true,
    "reps": true,
    "reps_range": true,
    "rir": true,
    "load": true,
    "rest": true
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_vars jsonb NOT NULL DEFAULT '{
    "calories": true,
    "protein": true,
    "carbs": true,
    "fat": true,
    "water": true,
    "steps": true
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS checkin_vars jsonb NOT NULL DEFAULT '{
    "sleep_hours": true,
    "sleep_quality": true,
    "energy": true,
    "mood": true,
    "motivation": true,
    "hunger": true,
    "fatigue": true,
    "stress": true,
    "soreness": true,
    "joint_pain": true,
    "notes": true
  }'::jsonb;

ALTER TABLE public.coach_settings
  ADD COLUMN IF NOT EXISTS default_tracking jsonb NOT NULL DEFAULT '{
    "track_weight": true,
    "track_checkins": true,
    "track_nutrition": true,
    "track_workouts": true,
    "workout_focus": "",
    "training": {
      "sets": true, "reps": true, "reps_range": true, "rir": true, "load": true, "rest": true
    },
    "nutrition": {
      "calories": true, "protein": true, "carbs": true, "fat": true, "water": true, "steps": true
    },
    "checkin": {
      "sleep_hours": true, "sleep_quality": true, "energy": true, "mood": true,
      "motivation": true, "hunger": true, "fatigue": true, "stress": true,
      "soreness": true, "joint_pain": true, "notes": true
    }
  }'::jsonb;

ALTER TABLE public.coach_settings
  DROP CONSTRAINT IF EXISTS coach_settings_tabs_ok;

ALTER TABLE public.coach_settings
  ADD CONSTRAINT coach_settings_tabs_ok CHECK (
    visible_tabs <@ ARRAY['overview', 'profile', 'training', 'progress', 'checkins', 'health', 'notes']::text[]
    AND cardinality(visible_tabs) >= 1
  );

ALTER TABLE public.program_day_exercises
  ADD COLUMN IF NOT EXISTS default_weight_kg numeric;

ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS prescribed_reps_min integer,
  ADD COLUMN IF NOT EXISTS prescribed_rir integer,
  ADD COLUMN IF NOT EXISTS prescribed_rest_seconds integer,
  ADD COLUMN IF NOT EXISTS prescribed_weight_kg numeric;

-- Client live: hide/show tracking as soon as the coach confirms.
DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_tracking_config;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip client_tracking_config';
END;
$pub$;

CREATE OR REPLACE FUNCTION public.coach_set_client_visible_profile(
  p_client_id uuid,
  p_patch jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal text;
  v_target_weight numeric;
  v_calories integer;
  v_protein integer;
  v_carbs integer;
  v_fat integer;
  v_water integer;
  v_steps integer;
  v_experience text;
  v_frequency integer;
  v_focus text;
  v_injuries text;
  v_diet text;
  v_allergies text[];
  v_sleep numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_coach_of(p_client_id) THEN
    RAISE EXCEPTION 'Not this client''s coach';
  END IF;
  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'Empty patch';
  END IF;

  IF p_patch ? 'goal' THEN
    v_goal := lower(trim(p_patch->>'goal'));
    IF v_goal NOT IN ('cut', 'maintain', 'bulk') THEN
      RAISE EXCEPTION 'Invalid goal';
    END IF;
  END IF;
  IF p_patch ? 'target_weight_kg' THEN
    v_target_weight := (p_patch->>'target_weight_kg')::numeric;
    IF v_target_weight IS NULL OR v_target_weight < 30 OR v_target_weight > 300 THEN
      RAISE EXCEPTION 'Invalid target weight';
    END IF;
  END IF;
  IF p_patch ? 'daily_calorie_target' THEN
    v_calories := (p_patch->>'daily_calorie_target')::integer;
    IF v_calories IS NULL OR v_calories < 800 OR v_calories > 8000 THEN
      RAISE EXCEPTION 'Invalid calorie target';
    END IF;
  END IF;
  IF p_patch ? 'protein_target' THEN
    v_protein := (p_patch->>'protein_target')::integer;
    IF v_protein IS NULL OR v_protein < 0 OR v_protein > 500 THEN
      RAISE EXCEPTION 'Invalid protein target';
    END IF;
  END IF;
  IF p_patch ? 'carbs_target' THEN
    v_carbs := (p_patch->>'carbs_target')::integer;
    IF v_carbs IS NULL OR v_carbs < 0 OR v_carbs > 800 THEN
      RAISE EXCEPTION 'Invalid carbs target';
    END IF;
  END IF;
  IF p_patch ? 'fat_target' THEN
    v_fat := (p_patch->>'fat_target')::integer;
    IF v_fat IS NULL OR v_fat < 0 OR v_fat > 400 THEN
      RAISE EXCEPTION 'Invalid fat target';
    END IF;
  END IF;
  IF p_patch ? 'daily_water_target_ml' THEN
    v_water := (p_patch->>'daily_water_target_ml')::integer;
    IF v_water IS NULL OR v_water < 500 OR v_water > 10000 THEN
      RAISE EXCEPTION 'Invalid water target';
    END IF;
  END IF;
  IF p_patch ? 'daily_steps_target' THEN
    v_steps := (p_patch->>'daily_steps_target')::integer;
    IF v_steps IS NULL OR v_steps < 0 OR v_steps > 100000 THEN
      RAISE EXCEPTION 'Invalid steps target';
    END IF;
  END IF;
  IF p_patch ? 'training_experience' THEN
    v_experience := trim(p_patch->>'training_experience');
    IF v_experience NOT IN ('beginner', 'intermediate', 'advanced', 'elite') THEN
      RAISE EXCEPTION 'Invalid training experience';
    END IF;
  END IF;
  IF p_patch ? 'training_frequency' THEN
    v_frequency := (p_patch->>'training_frequency')::integer;
    IF v_frequency IS NULL OR v_frequency < 1 OR v_frequency > 14 THEN
      RAISE EXCEPTION 'Invalid training frequency';
    END IF;
  END IF;
  IF p_patch ? 'training_focus' THEN
    v_focus := trim(p_patch->>'training_focus');
    IF v_focus NOT IN ('hypertrophy', 'strength', 'endurance', 'powerlifting', 'crossfit', 'calisthenics', 'mixed') THEN
      RAISE EXCEPTION 'Invalid training focus';
    END IF;
  END IF;
  IF p_patch ? 'injuries_limitations' THEN
    v_injuries := coalesce(p_patch->>'injuries_limitations', '');
    IF char_length(v_injuries) > 2000 THEN
      RAISE EXCEPTION 'Injuries text too long';
    END IF;
  END IF;
  IF p_patch ? 'diet_type' THEN
    v_diet := trim(p_patch->>'diet_type');
    IF v_diet NOT IN ('omnivore', 'vegetarian', 'vegan', 'pescatarian', 'paleo', 'keto', 'carnivore', 'mediterranean', 'halal', 'gluten_free') THEN
      RAISE EXCEPTION 'Invalid diet type';
    END IF;
  END IF;
  IF p_patch ? 'food_allergies' THEN
    IF jsonb_typeof(p_patch->'food_allergies') <> 'array' THEN
      RAISE EXCEPTION 'Invalid allergies';
    END IF;
    SELECT coalesce(array_agg(x), ARRAY[]::text[])
      INTO v_allergies
    FROM (
      SELECT jsonb_array_elements_text(p_patch->'food_allergies') AS x
      LIMIT 20
    ) s;
  END IF;
  IF p_patch ? 'sleep_hours_average' THEN
    v_sleep := (p_patch->>'sleep_hours_average')::numeric;
    IF v_sleep IS NULL OR v_sleep < 0 OR v_sleep > 24 THEN
      RAISE EXCEPTION 'Invalid sleep average';
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET
    goal = CASE WHEN p_patch ? 'goal' THEN v_goal ELSE goal END,
    target_weight_kg = CASE WHEN p_patch ? 'target_weight_kg' THEN v_target_weight ELSE target_weight_kg END,
    daily_calorie_target = CASE WHEN p_patch ? 'daily_calorie_target' THEN v_calories ELSE daily_calorie_target END,
    protein_target = CASE WHEN p_patch ? 'protein_target' THEN v_protein ELSE protein_target END,
    carbs_target = CASE WHEN p_patch ? 'carbs_target' THEN v_carbs ELSE carbs_target END,
    fat_target = CASE WHEN p_patch ? 'fat_target' THEN v_fat ELSE fat_target END,
    daily_water_target_ml = CASE WHEN p_patch ? 'daily_water_target_ml' THEN v_water ELSE daily_water_target_ml END,
    daily_steps_target = CASE WHEN p_patch ? 'daily_steps_target' THEN v_steps ELSE daily_steps_target END,
    training_experience = CASE WHEN p_patch ? 'training_experience' THEN v_experience ELSE training_experience END,
    training_frequency = CASE WHEN p_patch ? 'training_frequency' THEN v_frequency ELSE training_frequency END,
    training_focus = CASE WHEN p_patch ? 'training_focus' THEN v_focus ELSE training_focus END,
    injuries_limitations = CASE WHEN p_patch ? 'injuries_limitations' THEN v_injuries ELSE injuries_limitations END,
    diet_type = CASE WHEN p_patch ? 'diet_type' THEN v_diet ELSE diet_type END,
    food_allergies = CASE WHEN p_patch ? 'food_allergies' THEN coalesce(v_allergies, ARRAY[]::text[]) ELSE food_allergies END,
    sleep_hours_average = CASE WHEN p_patch ? 'sleep_hours_average' THEN v_sleep ELSE sleep_hours_average END,
    updated_at = now()
  WHERE id = p_client_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_set_client_visible_profile(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_set_client_visible_profile(uuid, jsonb) TO authenticated;
