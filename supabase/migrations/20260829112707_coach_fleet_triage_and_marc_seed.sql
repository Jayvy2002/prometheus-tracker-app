-- Dump exact de supabase_migrations.statements (prod).
-- Déjà applied : ne pas rejouer. Timestamp Git = version Production.

CREATE OR REPLACE FUNCTION public.triage_coach_fleet(p_coach_id uuid DEFAULT NULL)
RETURNS TABLE (
  coach_id uuid,
  client_id uuid,
  dossier jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := CURRENT_DATE - 13;
  v_coach uuid := p_coach_id;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF v_coach IS NULL THEN
      v_coach := auth.uid();
    END IF;
    IF auth.uid() <> v_coach THEN
      RAISE EXCEPTION 'Not this coach';
    END IF;
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
    WHERE ccl.status = 'active'
      AND (v_coach IS NULL OR ccl.coach_id = v_coach)
  ),
  nutrition_days AS (
    SELECT nl.user_id, nl.logged_at::date AS d, SUM(nl.calories)::numeric AS kcal
    FROM public.nutrition_logs nl
    JOIN links l ON l.client_id = nl.user_id
    WHERE nl.logged_at >= v_from
    GROUP BY nl.user_id, nl.logged_at::date
  ),
  nutrition_agg AS (
    SELECT
      user_id,
      COUNT(*)::int AS logged_nutrition_days,
      COALESCE(AVG(kcal), 0)::numeric AS avg_calories,
      MAX(d)::text AS last_nutrition_at
    FROM nutrition_days
    GROUP BY user_id
  ),
  workout_agg AS (
    SELECT
      w.user_id,
      COUNT(*) FILTER (WHERE COALESCE(w.completed, true))::int AS workout_count,
      MAX(w.date)::text AS last_workout_at
    FROM public.workouts w
    JOIN links l ON l.client_id = w.user_id
    WHERE w.date >= v_from::timestamptz
    GROUP BY w.user_id
  ),
  checkin_agg AS (
    SELECT
      c.user_id,
      COUNT(*)::int AS checkin_count,
      MAX(c.checked_at)::text AS last_checkin_at,
      AVG(c.adherence_nutrition)::numeric AS avg_adherence_nutrition,
      AVG(c.adherence_training)::numeric AS avg_adherence_training
    FROM public.daily_checkins c
    JOIN links l ON l.client_id = c.user_id
    WHERE c.checked_at >= v_from
    GROUP BY c.user_id
  ),
  weight_ord AS (
    SELECT
      wm.user_id,
      wm.weight_kg,
      wm.measured_at,
      ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at ASC) AS rn_asc,
      ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at DESC) AS rn_desc
    FROM public.weight_measurements wm
    JOIN links l ON l.client_id = wm.user_id
    WHERE wm.measured_at >= v_from
  ),
  weight_agg AS (
    SELECT
      a.user_id,
      a.weight_kg AS weight_start_kg,
      b.weight_kg AS weight_end_kg,
      ROUND((b.weight_kg - a.weight_kg)::numeric, 1) AS weight_delta_kg
    FROM weight_ord a
    JOIN weight_ord b ON b.user_id = a.user_id AND b.rn_desc = 1
    WHERE a.rn_asc = 1
  ),
  last_msg AS (
    SELECT m.client_id, MAX(m.created_at)::text AS last_message_at
    FROM public.coach_messages m
    JOIN links l ON l.client_id = m.client_id AND l.coach_id = m.coach_id
    GROUP BY m.client_id
  )
  SELECT
    l.coach_id,
    l.client_id,
    jsonb_build_object(
      'coach_id', l.coach_id,
      'client_id', l.client_id,
      'full_name', COALESCE(p.full_name, ''),
      'goal', COALESCE(p.goal, ''),
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
      'training_frequency', COALESCE(p.training_frequency, 0),
      'calorie_target', COALESCE(p.daily_calorie_target, 0),
      'protein_target', COALESCE(p.protein_target, 0),
      'carbs_target', COALESCE(p.carbs_target, 0),
      'fat_target', COALESCE(p.fat_target, 0),
      'weight_kg', COALESCE(p.weight_kg, 0),
      'logged_nutrition_days', COALESCE(n.logged_nutrition_days, 0),
      'avg_calories', ROUND(COALESCE(n.avg_calories, 0)),
      'last_nutrition_at', n.last_nutrition_at,
      'workout_count', COALESCE(w.workout_count, 0),
      'last_workout_at', w.last_workout_at,
      'checkin_count', COALESCE(c.checkin_count, 0),
      'last_checkin_at', c.last_checkin_at,
      'avg_adherence_nutrition', CASE
        WHEN c.avg_adherence_nutrition IS NULL THEN NULL
        ELSE ROUND(c.avg_adherence_nutrition, 1)
      END,
      'avg_adherence_training', CASE
        WHEN c.avg_adherence_training IS NULL THEN NULL
        ELSE ROUND(c.avg_adherence_training, 1)
      END,
      'weight_start_kg', wt.weight_start_kg,
      'weight_end_kg', wt.weight_end_kg,
      'weight_delta_kg', wt.weight_delta_kg,
      'last_message_at', m.last_message_at
    ) AS dossier
  FROM links l
  JOIN public.user_profiles p ON p.id = l.client_id
  LEFT JOIN nutrition_agg n ON n.user_id = l.client_id
  LEFT JOIN workout_agg w ON w.user_id = l.client_id
  LEFT JOIN checkin_agg c ON c.user_id = l.client_id
  LEFT JOIN weight_agg wt ON wt.user_id = l.client_id
  LEFT JOIN last_msg m ON m.client_id = l.client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.triage_coach_fleet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_coach_fleet(uuid) TO authenticated, service_role;
