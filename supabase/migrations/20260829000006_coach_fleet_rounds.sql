-- Fleet rounds IN THE APP (not Second). Cheap 14-day aggregates + inbox cards.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to backup nebysjpqifqphvmveowe or live.
-- Cron template: supabase/cron/schedule_coach_fleet_round.sql

-- ============================================================
-- Last-run log (skip-if-on-track is a missing card, not a row per client)
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_ai_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'on_demand'
    CHECK (trigger IN ('cron', 'on_demand')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  clients_seen integer NOT NULL DEFAULT 0,
  clients_flagged integer NOT NULL DEFAULT 0,
  clients_skipped integer NOT NULL DEFAULT 0,
  model_used text,
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS coach_ai_rounds_coach_idx
  ON coach_ai_rounds (coach_id, started_at DESC);

ALTER TABLE coach_ai_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches read own fleet rounds" ON coach_ai_rounds;
CREATE POLICY "Coaches read own fleet rounds"
  ON coach_ai_rounds FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()));

GRANT SELECT ON TABLE coach_ai_rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE coach_ai_rounds TO service_role;

-- One pending fleet card per client. Re-runs update, they don't stack.
DROP INDEX IF EXISTS coach_interventions_one_pending_fleet;
CREATE UNIQUE INDEX IF NOT EXISTS coach_interventions_one_pending_fleet
  ON coach_interventions (coach_id, client_id)
  WHERE status = 'pending' AND source = 'fleet' AND client_id IS NOT NULL;

-- ============================================================
-- upsert_coach_intervention: optional p_source (fleet vs second)
-- Drop the 6-arg form so named 6-arg calls bind to this signature.
-- ============================================================
DROP FUNCTION IF EXISTS public.upsert_coach_intervention(uuid, uuid, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.upsert_coach_intervention(
  p_coach_id uuid,
  p_client_id uuid,
  p_kind text,
  p_rationale text,
  p_payload jsonb,
  p_title text DEFAULT NULL,
  p_source text DEFAULT 'second'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source text := COALESCE(NULLIF(trim(p_source), ''), 'second');
BEGIN
  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'coach_id is required';
  END IF;
  IF v_source NOT IN ('second', 'fleet', 'prometheus_local') THEN
    v_source := 'second';
  END IF;
  IF p_kind IN (
       'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
       'adherence_nutrition', 'adherence_training'
     )
     AND p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
    'adherence_nutrition', 'adherence_training',
    'workflow_improvement', 'new_question', 'other',
    'ask_prometheus', 'program_nl_edit'
  ) THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> p_coach_id THEN
      RAISE EXCEPTION 'Not this client''s coach';
    END IF;
    IF p_client_id IS NOT NULL AND NOT public.is_coach_of(p_client_id) THEN
      RAISE EXCEPTION 'Not this client''s coach';
    END IF;
  ELSIF p_client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.coach_client_links
      WHERE coach_id = p_coach_id
        AND client_id = p_client_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Client is not linked to this coach';
    END IF;
  END IF;

  IF v_source = 'fleet' AND p_client_id IS NOT NULL THEN
    UPDATE public.coach_interventions
    SET
      kind = p_kind,
      title = p_title,
      rationale = COALESCE(p_rationale, ''),
      payload = p_payload,
      source = 'fleet',
      updated_at = now(),
      resolved_at = NULL
    WHERE coach_id = p_coach_id
      AND client_id = p_client_id
      AND source = 'fleet'
      AND status = 'pending'
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF p_kind IN ('onboarding_plan', 'ask_prometheus', 'program_nl_edit') AND v_source <> 'fleet' THEN
    UPDATE public.coach_interventions
    SET
      title = p_title,
      rationale = COALESCE(p_rationale, ''),
      payload = p_payload,
      source = v_source,
      updated_at = now(),
      resolved_at = NULL
    WHERE coach_id = p_coach_id
      AND client_id IS NOT DISTINCT FROM p_client_id
      AND kind = p_kind
      AND status = 'pending'
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.coach_interventions (
    coach_id, client_id, kind, title, rationale, payload, status, source, updated_at
  )
  VALUES (
    p_coach_id, p_client_id, p_kind, p_title, COALESCE(p_rationale, ''),
    p_payload, 'pending', v_source, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_coach_intervention(uuid, uuid, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_coach_intervention(uuid, uuid, text, text, jsonb, text, text) TO authenticated, service_role;

-- ============================================================
-- Cheap 14-day dossier per ACTIVE client. Aggregates, not raw logs.
-- ============================================================
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

-- ============================================================
-- Marc demo: the seeded calorie_adjustment 2000/0/0/0 is the wrong lever.
-- Replace with an adherence Relancer card. No-op if Marc isn't on this project.
-- ============================================================
UPDATE public.coach_interventions ci
SET
  status = 'dismissed',
  resolved_at = now(),
  updated_at = now(),
  payload = COALESCE(ci.payload, '{}'::jsonb) || jsonb_build_object(
    'superseded_by', 'fleet_adherence',
    'reason', 'wrong_lever_calorie_cut'
  )
FROM public.user_profiles p
WHERE ci.client_id = p.id
  AND ci.status = 'pending'
  AND ci.kind = 'calorie_adjustment'
  AND (
    p.full_name ILIKE '%Marc%'
    OR ci.title ILIKE '%Calories trop élevées%'
    OR (
      COALESCE((ci.payload->>'calories')::int, (ci.payload->>'suggested_calories')::int, (ci.payload->'nutrition'->>'calories')::int, 0) > 0
      AND COALESCE((ci.payload->>'protein')::int, (ci.payload->'nutrition'->>'protein')::int, 0) = 0
      AND COALESCE((ci.payload->>'carbs')::int, (ci.payload->'nutrition'->>'carbs')::int, 0) = 0
      AND COALESCE((ci.payload->>'fat')::int, (ci.payload->'nutrition'->>'fat')::int, 0) = 0
    )
  );

INSERT INTO public.coach_interventions (
  coach_id, client_id, kind, title, rationale, payload, status, source
)
SELECT
  ccl.coach_id,
  ccl.client_id,
  'adherence_nutrition',
  'Il n''applique pas les ' || COALESCE(p.daily_calorie_target::text, '2200'),
  'Il n''applique pas les ' || COALESCE(p.daily_calorie_target::text, '2200')
    || ' — on ne coupe pas les calories tant que le plan n''est pas suivi.',
  jsonb_build_object(
    'source', 'fleet',
    'flag', 'adherence_nutrition',
    'observation',
      'Cible ' || COALESCE(p.daily_calorie_target, 2200)::text
      || ' kcal, logs au-dessus, adhérence nutrition basse, poids en hausse.',
    'cause',
      'Il n''applique pas les ' || COALESCE(p.daily_calorie_target, 2200)::text
      || ' — Relancer, pas une coupe calorie.',
    'body',
      'Salut ' || split_part(COALESCE(p.full_name, 'Marc'), ' ', 1)
      || ', tes logs sont clairement au-dessus des '
      || COALESCE(p.daily_calorie_target, 2200)::text
      || ' kcal qu''on a posés. On ne touche pas encore à la cible : d''abord on l''applique. Tu me dis ce qui bloque (faim, resto, week-end) et on ajuste le plan autour, pas les chiffres.',
    'notes',
      'Salut ' || split_part(COALESCE(p.full_name, 'Marc'), ' ', 1)
      || ', tes logs sont clairement au-dessus des '
      || COALESCE(p.daily_calorie_target, 2200)::text
      || ' kcal qu''on a posés. On ne touche pas encore à la cible : d''abord on l''applique. Tu me dis ce qui bloque (faim, resto, week-end) et on ajuste le plan autour, pas les chiffres.',
    'template_key', 'missed_checkins',
    'ai_off', true,
    'current_calories', COALESCE(p.daily_calorie_target, 2200)
  ),
  'pending',
  'fleet'
FROM public.coach_client_links ccl
JOIN public.user_profiles p ON p.id = ccl.client_id
WHERE ccl.status = 'active'
  AND p.full_name ILIKE '%Marc%'
  AND NOT EXISTS (
    SELECT 1 FROM public.coach_interventions ci
    WHERE ci.coach_id = ccl.coach_id
      AND ci.client_id = ccl.client_id
      AND ci.status = 'pending'
      AND ci.source = 'fleet'
  );
