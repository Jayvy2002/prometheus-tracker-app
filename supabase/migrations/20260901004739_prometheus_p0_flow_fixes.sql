-- P0 product-flow fixes: atomic workout creation, coach-local alert timing,
-- and a program-derived training frequency in the fleet dossier.

ALTER TABLE public.coach_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Toronto',
  ADD COLUMN IF NOT EXISTS missed_workout_cutoff_hour smallint NOT NULL DEFAULT 21;

ALTER TABLE public.coach_settings
  DROP CONSTRAINT IF EXISTS coach_settings_missed_workout_cutoff_hour_check;
ALTER TABLE public.coach_settings
  ADD CONSTRAINT coach_settings_missed_workout_cutoff_hour_check
  CHECK (missed_workout_cutoff_hour BETWEEN 0 AND 23);

CREATE OR REPLACE FUNCTION public.start_workout_from_template(
  p_name text,
  p_date timestamptz,
  p_routine_id uuid DEFAULT NULL,
  p_program_assignment_id uuid DEFAULT NULL,
  p_program_day_id uuid DEFAULT NULL,
  p_exercises jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_workout_id uuid;
  v_exercise_id uuid;
  v_item jsonb;
  v_position bigint;
  v_set_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'workout_name_required';
  END IF;
  IF jsonb_typeof(COALESCE(p_exercises, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_exercises, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'invalid_workout_template';
  END IF;
  IF p_routine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.routines r WHERE r.id = p_routine_id AND r.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'invalid_routine';
  END IF;
  IF p_program_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.program_assignments pa
    WHERE pa.id = p_program_assignment_id AND pa.client_id = v_user_id AND pa.status = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid_program_assignment';
  END IF;
  IF p_program_day_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.program_days pd
    JOIN public.program_assignments pa ON pa.program_id = pd.program_id
    WHERE pd.id = p_program_day_id
      AND pa.id = p_program_assignment_id
      AND pa.client_id = v_user_id
      AND pa.status = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid_program_day';
  END IF;

  INSERT INTO public.workouts (
    user_id, name, date, routine_id, program_assignment_id, program_day_id
  ) VALUES (
    v_user_id, btrim(p_name), COALESCE(p_date, now()), p_routine_id,
    p_program_assignment_id, p_program_day_id
  )
  RETURNING id INTO v_workout_id;

  FOR v_item, v_position IN
    SELECT value, ordinality
    FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    IF NULLIF(btrim(v_item->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'exercise_name_required';
    END IF;
    v_set_count := COALESCE((v_item->>'default_sets')::integer, 0);
    IF v_set_count < 0 OR v_set_count > 20 THEN
      RAISE EXCEPTION 'invalid_set_count';
    END IF;

    INSERT INTO public.workout_exercises (
      workout_id, name, order_index,
      prescribed_sets, prescribed_reps, prescribed_reps_min, prescribed_rir,
      prescribed_rest_seconds, prescribed_weight_kg
    ) VALUES (
      v_workout_id,
      btrim(v_item->>'name'),
      COALESCE((v_item->>'order_index')::integer, (v_position - 1)::integer),
      v_set_count,
      COALESCE((v_item->>'default_reps')::integer, 0),
      NULLIF(v_item->>'default_reps_min', '')::integer,
      NULLIF(v_item->>'default_rir', '')::integer,
      NULLIF(v_item->>'default_rest_seconds', '')::integer,
      NULLIF(v_item->>'default_weight_kg', '')::numeric
    )
    RETURNING id INTO v_exercise_id;

    INSERT INTO public.workout_sets (exercise_id, order_index)
    SELECT v_exercise_id, set_index
    FROM generate_series(0, v_set_count - 1) AS set_index;
  END LOOP;

  RETURN v_workout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workout_from_template(text, timestamptz, uuid, uuid, uuid, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.triage_coach_fleet(p_coach_id uuid DEFAULT NULL)
RETURNS TABLE (coach_id uuid, client_id uuid, dossier jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := CURRENT_DATE - 13;
  v_coach uuid := p_coach_id;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF v_coach IS NULL THEN v_coach := auth.uid(); END IF;
    IF auth.uid() <> v_coach THEN RAISE EXCEPTION 'Not this coach'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND coaching_role = 'coach'
    ) THEN
      RAISE EXCEPTION 'not_coach';
    END IF;
  END IF;

  RETURN QUERY
  WITH links AS (
    SELECT ccl.coach_id, ccl.client_id, ccl.created_at AS linked_at
    FROM public.coach_client_links ccl
    WHERE ccl.status = 'active' AND (v_coach IS NULL OR ccl.coach_id = v_coach)
  ),
  program_frequency AS (
    SELECT pa.client_id, COUNT(DISTINCT pd.weekday)::int AS training_frequency
    FROM public.program_assignments pa
    JOIN public.program_days pd ON pd.program_id = pa.program_id
    JOIN links l ON l.client_id = pa.client_id
    WHERE pa.status = 'active'
    GROUP BY pa.client_id
  ),
  nutrition_days AS (
    SELECT nl.user_id, nl.logged_at::date AS d, SUM(nl.calories)::numeric AS kcal
    FROM public.nutrition_logs nl JOIN links l ON l.client_id = nl.user_id
    WHERE nl.logged_at >= v_from
    GROUP BY nl.user_id, nl.logged_at::date
  ),
  nutrition_agg AS (
    SELECT user_id, COUNT(*)::int AS logged_nutrition_days,
      COALESCE(AVG(kcal), 0)::numeric AS avg_calories, MAX(d)::text AS last_nutrition_at
    FROM nutrition_days GROUP BY user_id
  ),
  workout_agg AS (
    SELECT w.user_id, COUNT(*) FILTER (WHERE COALESCE(w.completed, true))::int AS workout_count,
      MAX(w.date)::text AS last_workout_at
    FROM public.workouts w JOIN links l ON l.client_id = w.user_id
    WHERE w.date >= v_from::timestamptz GROUP BY w.user_id
  ),
  checkin_agg AS (
    SELECT c.user_id, COUNT(*)::int AS checkin_count, MAX(c.checked_at)::text AS last_checkin_at,
      AVG(c.adherence_nutrition)::numeric AS avg_adherence_nutrition,
      AVG(c.adherence_training)::numeric AS avg_adherence_training
    FROM public.daily_checkins c JOIN links l ON l.client_id = c.user_id
    WHERE c.checked_at >= v_from GROUP BY c.user_id
  ),
  weight_ord AS (
    SELECT wm.user_id, wm.weight_kg, wm.measured_at,
      ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at ASC) AS rn_asc,
      ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at DESC) AS rn_desc
    FROM public.weight_measurements wm JOIN links l ON l.client_id = wm.user_id
    WHERE wm.measured_at >= v_from
  ),
  weight_agg AS (
    SELECT a.user_id, a.weight_kg AS weight_start_kg, b.weight_kg AS weight_end_kg,
      ROUND((b.weight_kg - a.weight_kg)::numeric, 1) AS weight_delta_kg
    FROM weight_ord a JOIN weight_ord b ON b.user_id = a.user_id AND b.rn_desc = 1
    WHERE a.rn_asc = 1
  ),
  last_msg AS (
    SELECT m.client_id, MAX(m.created_at)::text AS last_message_at
    FROM public.coach_messages m
    JOIN links l ON l.client_id = m.client_id AND l.coach_id = m.coach_id
    GROUP BY m.client_id
  )
  SELECT l.coach_id, l.client_id,
    jsonb_build_object(
      'coach_id', l.coach_id, 'client_id', l.client_id,
      'full_name', COALESCE(p.full_name, ''), 'goal', COALESCE(p.goal, ''),
      'onboarding_completed', COALESCE(p.onboarding_completed, false),
      'has_program', EXISTS (
        SELECT 1 FROM public.program_assignments pa
        WHERE pa.client_id = l.client_id AND pa.status = 'active'
      ),
      'setup_completed', EXISTS (
        SELECT 1 FROM public.client_tracking_config t
        WHERE t.client_id = l.client_id AND t.coach_id = l.coach_id
          AND t.setup_completed_at IS NOT NULL
      ),
      'linked_days', GREATEST(0, (CURRENT_DATE - l.linked_at::date)),
      'training_frequency', COALESCE(NULLIF(pf.training_frequency, 0), NULLIF(p.training_frequency, 0), 3),
      'calorie_target', COALESCE(p.daily_calorie_target, 0),
      'protein_target', COALESCE(p.protein_target, 0),
      'carbs_target', COALESCE(p.carbs_target, 0),
      'fat_target', COALESCE(p.fat_target, 0), 'weight_kg', COALESCE(p.weight_kg, 0),
      'logged_nutrition_days', COALESCE(n.logged_nutrition_days, 0),
      'avg_calories', ROUND(COALESCE(n.avg_calories, 0)),
      'last_nutrition_at', n.last_nutrition_at,
      'workout_count', COALESCE(w.workout_count, 0), 'last_workout_at', w.last_workout_at,
      'checkin_count', COALESCE(c.checkin_count, 0), 'last_checkin_at', c.last_checkin_at,
      'avg_adherence_nutrition', CASE WHEN c.avg_adherence_nutrition IS NULL THEN NULL ELSE ROUND(c.avg_adherence_nutrition, 1) END,
      'avg_adherence_training', CASE WHEN c.avg_adherence_training IS NULL THEN NULL ELSE ROUND(c.avg_adherence_training, 1) END,
      'weight_start_kg', wt.weight_start_kg, 'weight_end_kg', wt.weight_end_kg,
      'weight_delta_kg', wt.weight_delta_kg, 'last_message_at', m.last_message_at
    ) AS dossier
  FROM links l
  JOIN public.user_profiles p ON p.id = l.client_id
  LEFT JOIN program_frequency pf ON pf.client_id = l.client_id
  LEFT JOIN nutrition_agg n ON n.user_id = l.client_id
  LEFT JOIN workout_agg w ON w.user_id = l.client_id
  LEFT JOIN checkin_agg c ON c.user_id = l.client_id
  LEFT JOIN weight_agg wt ON wt.user_id = l.client_id
  LEFT JOIN last_msg m ON m.client_id = l.client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.triage_coach_fleet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_coach_fleet(uuid) TO authenticated, service_role;
