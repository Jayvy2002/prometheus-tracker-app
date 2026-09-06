-- Engine consumes collected data: check-in hunger/mood/stress averages +
-- available_weekdays from kinesiology intake (same mapping as compactIntake).
-- Coaching copy: phyuijjekxtjvipjtdfv.

DROP FUNCTION IF EXISTS public.triage_coach_fleet(uuid);
DROP FUNCTION IF EXISTS public.triage_coach_fleet(uuid, uuid);

CREATE OR REPLACE FUNCTION public.triage_coach_fleet(p_coach_id uuid DEFAULT NULL, p_client_id uuid DEFAULT NULL)
RETURNS TABLE (
  coach_id uuid,
  client_id uuid,
  dossier jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
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
      AND (p_client_id IS NULL OR ccl.client_id = p_client_id)
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
      AVG(c.adherence_training)::numeric AS avg_adherence_training,
      AVG(c.hunger)::numeric AS avg_hunger,
      AVG(c.mood)::numeric AS avg_mood,
      AVG(c.stress)::numeric AS avg_stress
    FROM public.daily_checkins c
    JOIN links l ON l.client_id = c.user_id
    WHERE c.checked_at >= v_from
    GROUP BY c.user_id
  ),
  weekday_map AS (
    SELECT
      l.client_id,
      (
        SELECT jsonb_agg(ord ORDER BY ord)
        FROM (
          SELECT DISTINCT CASE lower(elem)
            WHEN 'dim' THEN 0
            WHEN 'lun' THEN 1
            WHEN 'mar' THEN 2
            WHEN 'mer' THEN 3
            WHEN 'jeu' THEN 4
            WHEN 'ven' THEN 5
            WHEN 'sam' THEN 6
          END AS ord
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(p.kinesiology_intake->'extras'->'joursDispo') = 'array'
              THEN p.kinesiology_intake->'extras'->'joursDispo'
              ELSE '[]'::jsonb
            END
          ) AS elem
        ) mapped
        WHERE ord IS NOT NULL
      ) AS available_weekdays
    FROM links l
    JOIN public.user_profiles p ON p.id = l.client_id
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
  ),
  last_coach_msg AS (
    SELECT m.client_id, MAX(m.created_at)::text AS last_coach_message_at
    FROM public.coach_messages m
    JOIN links l ON l.client_id = m.client_id AND l.coach_id = m.coach_id
    WHERE m.sender_id = m.coach_id
    GROUP BY m.client_id
  ),
  last_kit AS (
    SELECT ci.client_id, MAX(COALESCE(ci.resolved_at, ci.updated_at))::text AS last_keep_in_touch_at
    FROM public.coach_interventions ci
    JOIN links l ON l.client_id = ci.client_id AND l.coach_id = ci.coach_id
    WHERE ci.kind = 'keep_in_touch'
      AND ci.status IN ('sent', 'dismissed', 'kept')
    GROUP BY ci.client_id
  ),
  pending_fleet AS (
    SELECT DISTINCT ci.client_id
    FROM public.coach_interventions ci
    JOIN links l ON l.client_id = ci.client_id AND l.coach_id = ci.coach_id
    WHERE ci.source = 'fleet'
      AND ci.status = 'pending'
      AND ci.client_id IS NOT NULL
  ),
  handled_ord AS (
    SELECT
      ci.client_id,
      ci.kind,
      COALESCE(ci.payload->>'flag', ci.kind) AS flag,
      ci.status,
      COALESCE(ci.resolved_at, ci.updated_at) AS handled_at,
      COALESCE(ci.payload->'evidence', jsonb_build_object(
        'avg_calories', ci.payload->'avg_calories',
        'logged_nutrition_days', ci.payload->'logged_nutrition_days',
        'workout_count', ci.payload->'workout_count',
        'checkin_count', ci.payload->'checkin_count',
        'weight_delta_kg', ci.payload->'weight_delta_kg',
        'last_nutrition_at', ci.payload->>'last_nutrition_at',
        'last_workout_at', ci.payload->>'last_workout_at',
        'last_checkin_at', ci.payload->>'last_checkin_at'
      )) AS evidence,
      ROW_NUMBER() OVER (
        PARTITION BY ci.client_id, ci.kind, COALESCE(ci.payload->>'flag', ci.kind)
        ORDER BY COALESCE(ci.resolved_at, ci.updated_at) DESC NULLS LAST
      ) AS rn
    FROM public.coach_interventions ci
    JOIN links l ON l.client_id = ci.client_id AND l.coach_id = ci.coach_id
    WHERE ci.status IN ('sent', 'dismissed', 'kept')
      AND ci.client_id IS NOT NULL
  ),
  handled_agg AS (
    SELECT
      handled_ord.client_id,
      jsonb_agg(jsonb_build_object(
        'kind', handled_ord.kind,
        'flag', handled_ord.flag,
        'status', handled_ord.status,
        'handled_at', handled_ord.handled_at,
        'evidence', handled_ord.evidence
      )) AS fleet_handled
    FROM handled_ord
    WHERE handled_ord.rn = 1
    GROUP BY handled_ord.client_id
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
      'training_frequency', COALESCE(NULLIF(pfreq.training_frequency, 0), NULLIF(p.training_frequency, 0), 3),
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
      'avg_hunger', CASE
        WHEN c.avg_hunger IS NULL THEN NULL
        ELSE ROUND(c.avg_hunger, 1)
      END,
      'avg_mood', CASE
        WHEN c.avg_mood IS NULL THEN NULL
        ELSE ROUND(c.avg_mood, 1)
      END,
      'avg_stress', CASE
        WHEN c.avg_stress IS NULL THEN NULL
        ELSE ROUND(c.avg_stress, 1)
      END,
      'available_weekdays', wd.available_weekdays,
      'weight_start_kg', wt.weight_start_kg,
      'weight_end_kg', wt.weight_end_kg,
      'weight_delta_kg', wt.weight_delta_kg,
      'last_message_at', m.last_message_at,
      'last_coach_message_at', cm.last_coach_message_at,
      'last_keep_in_touch_at', kit.last_keep_in_touch_at,
      'pending_fleet', pend.client_id IS NOT NULL,
      'fleet_handled', COALESCE(h.fleet_handled, '[]'::jsonb)
    ) AS dossier
  FROM links l
  JOIN public.user_profiles p ON p.id = l.client_id
  LEFT JOIN program_frequency pfreq ON pfreq.client_id = l.client_id
  LEFT JOIN nutrition_agg n ON n.user_id = l.client_id
  LEFT JOIN workout_agg w ON w.user_id = l.client_id
  LEFT JOIN checkin_agg c ON c.user_id = l.client_id
  LEFT JOIN weekday_map wd ON wd.client_id = l.client_id
  LEFT JOIN weight_agg wt ON wt.user_id = l.client_id
  LEFT JOIN last_msg m ON m.client_id = l.client_id
  LEFT JOIN last_coach_msg cm ON cm.client_id = l.client_id
  LEFT JOIN last_kit kit ON kit.client_id = l.client_id
  LEFT JOIN pending_fleet pend ON pend.client_id = l.client_id
  LEFT JOIN handled_agg h ON h.client_id = l.client_id;
END;
$$;


REVOKE ALL ON FUNCTION public.triage_coach_fleet(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_coach_fleet(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.triage_coach_fleet(uuid, uuid) IS
  'Fleet triage for one coach, or one client when p_client_id is set (coach-agent). Includes avg_hunger/mood/stress and intake available_weekdays.';

NOTIFY pgrst, 'reload schema';
