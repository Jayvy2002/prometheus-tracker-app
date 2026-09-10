-- Fleet round must not recreate À approuver after Envoyer / Ignorer / Relancer.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to backup nebysjpqifqphvmveowe or live.
-- Same coach+client+signal stays quiet ~7 days after handle, unless facts moved
-- (another week of 3100 vs 2200, new missed block). Never flip sent/dismissed to pending.
-- Pending fleet: refresh in place. keep_in_touch uses handled_at, not created_at.
-- triage RETURNS TABLE(client_id): handled_agg must qualify handled_ord.* or PL/pgSQL 42702.

CREATE OR REPLACE FUNCTION public.fleet_evidence_changed(p_prev jsonb, p_next jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_flag text := COALESCE(p_next->>'flag', p_prev->>'flag', '');
  v_prev jsonb := COALESCE(p_prev->'evidence', p_prev);
  v_next jsonb := COALESCE(p_next->'evidence', p_next);
  v_prev_kcal numeric;
  v_next_kcal numeric;
  v_prev_days numeric;
  v_next_days numeric;
  v_prev_wo numeric;
  v_next_wo numeric;
  v_prev_delta numeric;
  v_next_delta numeric;
BEGIN
  IF v_flag = 'keep_in_touch' THEN
    RETURN false;
  END IF;
  IF p_prev IS NULL OR p_prev = '{}'::jsonb THEN
    RETURN false;
  END IF;

  v_prev_kcal := COALESCE(NULLIF(v_prev->>'avg_calories', '')::numeric, 0);
  v_next_kcal := COALESCE(NULLIF(v_next->>'avg_calories', '')::numeric, 0);
  IF abs(v_next_kcal - v_prev_kcal) >= 150 THEN
    RETURN true;
  END IF;

  v_prev_days := COALESCE(NULLIF(v_prev->>'logged_nutrition_days', '')::numeric, 0);
  v_next_days := COALESCE(NULLIF(v_next->>'logged_nutrition_days', '')::numeric, 0);
  IF (v_next_days - v_prev_days) >= 3 THEN
    RETURN true;
  END IF;

  v_prev_wo := COALESCE(NULLIF(v_prev->>'workout_count', '')::numeric, 0);
  v_next_wo := COALESCE(NULLIF(v_next->>'workout_count', '')::numeric, 0);
  IF abs(v_next_wo - v_prev_wo) >= 2 THEN
    RETURN true;
  END IF;

  v_prev_delta := NULLIF(v_prev->>'weight_delta_kg', '')::numeric;
  v_next_delta := NULLIF(v_next->>'weight_delta_kg', '')::numeric;
  IF v_prev_delta IS NOT NULL AND v_next_delta IS NOT NULL AND abs(v_next_delta - v_prev_delta) >= 0.4 THEN
    RETURN true;
  END IF;

  IF NULLIF(left(COALESCE(v_prev->>'last_nutrition_at', ''), 10), '') IS NOT NULL
     AND NULLIF(left(COALESCE(v_next->>'last_nutrition_at', ''), 10), '')
       > left(COALESCE(v_prev->>'last_nutrition_at', ''), 10) THEN
    RETURN true;
  END IF;
  IF NULLIF(left(COALESCE(v_prev->>'last_workout_at', ''), 10), '') IS NOT NULL
     AND NULLIF(left(COALESCE(v_next->>'last_workout_at', ''), 10), '')
       > left(COALESCE(v_prev->>'last_workout_at', ''), 10) THEN
    RETURN true;
  END IF;
  IF NULLIF(left(COALESCE(v_prev->>'last_checkin_at', ''), 10), '') IS NOT NULL
     AND NULLIF(left(COALESCE(v_next->>'last_checkin_at', ''), 10), '')
       > left(COALESCE(v_prev->>'last_checkin_at', ''), 10) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_evidence_changed(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_evidence_changed(jsonb, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_coach_intervention(
  p_coach_id uuid,
  p_client_id uuid,
  p_kind text,
  p_rationale text,
  p_payload jsonb,
  p_title text DEFAULT NULL,
  p_source text DEFAULT 'agent'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source text := COALESCE(NULLIF(trim(p_source), ''), 'agent');
  v_prev_payload jsonb;
  v_handled_at timestamptz;
BEGIN
  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'coach_id is required';
  END IF;
  IF v_source NOT IN ('second', 'fleet', 'prometheus_local', 'agent') THEN
    v_source := 'agent';
  END IF;
  IF p_kind IN (
       'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
       'adherence_nutrition', 'adherence_training', 'keep_in_touch'
     )
     AND p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'onboarding_plan', 'calorie_adjustment', 'program_adjustment',
    'adherence_nutrition', 'adherence_training', 'keep_in_touch',
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

  -- Fleet: refresh pending in place. Never reopen sent/dismissed/kept.
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

    SELECT payload, COALESCE(resolved_at, updated_at)
      INTO v_prev_payload, v_handled_at
    FROM public.coach_interventions
    WHERE coach_id = p_coach_id
      AND client_id = p_client_id
      AND kind = p_kind
      AND COALESCE(payload->>'flag', kind) = COALESCE(p_payload->>'flag', p_kind)
      AND status IN ('sent', 'dismissed', 'kept')
    ORDER BY COALESCE(resolved_at, updated_at) DESC NULLS LAST
    LIMIT 1;

    IF v_handled_at IS NOT NULL
       AND v_handled_at >= (now() - interval '7 days')
       AND NOT public.fleet_evidence_changed(v_prev_payload, p_payload) THEN
      RETURN NULL;
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
      'last_message_at', m.last_message_at,
      'last_coach_message_at', cm.last_coach_message_at,
      'last_keep_in_touch_at', kit.last_keep_in_touch_at,
      'pending_fleet', pf.client_id IS NOT NULL,
      'fleet_handled', COALESCE(h.fleet_handled, '[]'::jsonb)
    ) AS dossier
  FROM links l
  JOIN public.user_profiles p ON p.id = l.client_id
  LEFT JOIN nutrition_agg n ON n.user_id = l.client_id
  LEFT JOIN workout_agg w ON w.user_id = l.client_id
  LEFT JOIN checkin_agg c ON c.user_id = l.client_id
  LEFT JOIN weight_agg wt ON wt.user_id = l.client_id
  LEFT JOIN last_msg m ON m.client_id = l.client_id
  LEFT JOIN last_coach_msg cm ON cm.client_id = l.client_id
  LEFT JOIN last_kit kit ON kit.client_id = l.client_id
  LEFT JOIN pending_fleet pf ON pf.client_id = l.client_id
  LEFT JOIN handled_agg h ON h.client_id = l.client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.triage_coach_fleet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_coach_fleet(uuid) TO authenticated, service_role;
