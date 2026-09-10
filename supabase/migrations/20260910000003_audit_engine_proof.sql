-- Audit lot 3 (I03/I04) : preuves comparables solo/coach.
--
-- I03 — les bilans jugeaient des fenêtres différentes (15 j solo vs 14 j fleet),
-- un rythme fixe au lieu de la durée réelle, un delta 0 sur mesure unique, et la
-- cible du jour au lieu des cibles effectives datées.
--   * nutrition_target_history : cibles versionnées par date d'effet (trigger).
--   * triage : delta NULL sur mesure unique, dates/durée réelles des pesées,
--     cible effective moyenne sur la fenêtre.
--
-- I04 — le moteur confondait observation et interprétation.
--   * triage : signaux de récupération déclarés normalisés 0–10 (legacy 1–5 ×2),
--     modules suivis (tracking), minorité et drapeaux médicaux du dossier.

-- ============ Normalisation 0–10 d'une note de check-in (miroir checkinScale.ts) ============

CREATE OR REPLACE FUNCTION public.checkin_score_on_ten(
  p_value int,
  p_hunger int,
  p_fatigue int,
  p_sleep_quality int,
  p_stress int,
  p_motivation int,
  p_soreness int,
  p_pain int,
  p_energy int,
  p_mood int
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN (
      (p_hunger IS NULL OR p_hunger BETWEEN 1 AND 5)
      AND (p_fatigue IS NULL OR p_fatigue BETWEEN 1 AND 5)
      AND (p_sleep_quality IS NULL OR p_sleep_quality BETWEEN 1 AND 5)
      AND (p_stress IS NULL OR p_stress BETWEEN 1 AND 5)
      AND (p_motivation IS NULL OR p_motivation BETWEEN 1 AND 5)
      AND (p_soreness IS NULL OR p_soreness BETWEEN 1 AND 5)
      AND (p_pain IS NULL OR p_pain BETWEEN 1 AND 5)
      AND (p_energy IS NULL OR p_energy BETWEEN 1 AND 5)
      AND (p_mood IS NULL OR p_mood BETWEEN 1 AND 5)
      AND (
        p_hunger IS NOT NULL OR p_fatigue IS NOT NULL OR p_sleep_quality IS NOT NULL
        OR p_stress IS NOT NULL OR p_motivation IS NOT NULL OR p_soreness IS NOT NULL
        OR p_pain IS NOT NULL OR p_energy IS NOT NULL OR p_mood IS NOT NULL
      )
    ) THEN LEAST(10, p_value * 2)
    ELSE LEAST(10, GREATEST(0, p_value))
  END
$$;

REVOKE ALL ON FUNCTION public.checkin_score_on_ten(int, int, int, int, int, int, int, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkin_score_on_ten(int, int, int, int, int, int, int, int, int, int) TO authenticated, service_role;

-- ============ Historique daté des cibles (I03) ============

CREATE TABLE IF NOT EXISTS public.nutrition_target_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  calories numeric NOT NULL DEFAULT 0,
  protein numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  fat numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'profile_update',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

CREATE INDEX IF NOT EXISTS nutrition_target_history_user_idx
  ON public.nutrition_target_history (user_id, effective_from DESC);

ALTER TABLE public.nutrition_target_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own target history" ON public.nutrition_target_history;
CREATE POLICY "Users read own target history"
  ON public.nutrition_target_history FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Coaches read client target history" ON public.nutrition_target_history;
CREATE POLICY "Coaches read client target history"
  ON public.nutrition_target_history FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

-- Écriture trigger uniquement (pas de policy INSERT/UPDATE/DELETE cliente).
GRANT SELECT ON TABLE public.nutrition_target_history TO authenticated;

CREATE OR REPLACE FUNCTION public.record_nutrition_target_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.daily_calorie_target IS NOT DISTINCT FROM NEW.daily_calorie_target
     AND OLD.protein_target IS NOT DISTINCT FROM NEW.protein_target
     AND OLD.carbs_target IS NOT DISTINCT FROM NEW.carbs_target
     AND OLD.fat_target IS NOT DISTINCT FROM NEW.fat_target THEN
    RETURN NEW;
  END IF;
  BEGIN
    INSERT INTO public.nutrition_target_history (user_id, effective_from, calories, protein, carbs, fat, source)
    VALUES (NEW.id, CURRENT_DATE, COALESCE(NEW.daily_calorie_target, 0), COALESCE(NEW.protein_target, 0), COALESCE(NEW.carbs_target, 0), COALESCE(NEW.fat_target, 0), 'profile_update')
    ON CONFLICT (user_id, effective_from) DO UPDATE SET
      calories = EXCLUDED.calories,
      protein = EXCLUDED.protein,
      carbs = EXCLUDED.carbs,
      fat = EXCLUDED.fat,
      source = EXCLUDED.source,
      created_at = now();
  EXCEPTION WHEN OTHERS THEN
    -- L'historique ne doit jamais casser une écriture de cibles.
    RAISE WARNING 'record_nutrition_target_history: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_target_history ON public.user_profiles;
CREATE TRIGGER trg_record_target_history
  AFTER UPDATE OF daily_calorie_target, protein_target, carbs_target, fat_target
  ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.record_nutrition_target_history();

-- Backfill : les cibles actuelles gouvernent les 30 derniers jours (faute d'historique).
INSERT INTO public.nutrition_target_history (user_id, effective_from, calories, protein, carbs, fat, source)
SELECT id, CURRENT_DATE - 30, COALESCE(daily_calorie_target, 0), COALESCE(protein_target, 0), COALESCE(carbs_target, 0), COALESCE(fat_target, 0), 'backfill'
FROM public.user_profiles
WHERE COALESCE(daily_calorie_target, 0) > 0
ON CONFLICT (user_id, effective_from) DO NOTHING;

COMMENT ON TABLE public.nutrition_target_history IS
  'I03 : cibles kcal/P/C/F versionnées par date d''effet. Un changement récent ne réinterprète plus les anciens logs.';

-- ============ Triage fleet : preuves datées, déclaratives et cadrées (I03/I04) ============

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
      AVG(c.stress)::numeric AS avg_stress,
      AVG(public.checkin_score_on_ten(c.fatigue, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_fatigue,
      AVG(public.checkin_score_on_ten(c.sleep_quality, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_sleep_quality,
      AVG(public.checkin_score_on_ten(c.muscle_soreness, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_soreness,
      AVG(public.checkin_score_on_ten(c.energy_level, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_energy
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
      wm.id AS w_id,
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
      a.measured_at AS weight_start_at,
      b.measured_at AS weight_end_at,
      -- I03 : mesure unique → tendance inconnue (NULL), jamais un delta 0.
      -- measured_at est un date : la différence donne directement des jours.
      CASE WHEN a.w_id = b.w_id THEN NULL
        ELSE (b.measured_at - a.measured_at)::numeric
      END AS weight_span_days,
      CASE WHEN a.w_id = b.w_id THEN NULL
        ELSE ROUND((b.weight_kg - a.weight_kg)::numeric, 1)
      END AS weight_delta_kg
    FROM weight_ord a
    JOIN weight_ord b ON b.user_id = a.user_id AND b.rn_desc = 1
    WHERE a.rn_asc = 1
  ),
  -- I03 : cible effective moyenne — chaque jour jugé contre la cible qui le gouvernait.
  effective_targets AS (
    SELECT
      l.client_id,
      AVG(COALESCE(
        (SELECT h.calories
         FROM public.nutrition_target_history h
         WHERE h.user_id = l.client_id AND h.effective_from <= d.day::date
         ORDER BY h.effective_from DESC LIMIT 1),
        p.daily_calorie_target, 0
      ))::numeric AS avg_effective_target
    FROM links l
    JOIN public.user_profiles p ON p.id = l.client_id
    CROSS JOIN generate_series(v_from, CURRENT_DATE, interval '1 day') AS d(day)
    GROUP BY l.client_id
  ),
  -- I04 : modules réellement suivis (ligne absente = tout OFF, décision (a)).
  tracking_cfg AS (
    SELECT t.client_id, t.track_nutrition, t.track_workouts, t.track_weight, t.track_checkins
    FROM public.client_tracking_config t
    JOIN links l ON l.client_id = t.client_id AND l.coach_id = t.coach_id
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
      'avg_fatigue', CASE WHEN c.avg_fatigue IS NULL THEN NULL ELSE ROUND(c.avg_fatigue, 1) END,
      'avg_sleep_quality', CASE WHEN c.avg_sleep_quality IS NULL THEN NULL ELSE ROUND(c.avg_sleep_quality, 1) END,
      'avg_soreness', CASE WHEN c.avg_soreness IS NULL THEN NULL ELSE ROUND(c.avg_soreness, 1) END,
      'avg_energy', CASE WHEN c.avg_energy IS NULL THEN NULL ELSE ROUND(c.avg_energy, 1) END,
      'weight_start_kg', wt.weight_start_kg,
      'weight_end_kg', wt.weight_end_kg,
      'weight_start_at', wt.weight_start_at,
      'weight_end_at', wt.weight_end_at,
      'weight_span_days', wt.weight_span_days,
      'weight_delta_kg', wt.weight_delta_kg,
      'avg_effective_target', ROUND(COALESCE(et.avg_effective_target, p.daily_calorie_target, 0)),
      'tracking', jsonb_build_object(
        'nutrition', COALESCE(tc.track_nutrition, false),
        'workouts', COALESCE(tc.track_workouts, false),
        'weight', COALESCE(tc.track_weight, false),
        'checkins', COALESCE(tc.track_checkins, false)
      ),
      'is_minor', (p.date_of_birth IS NOT NULL AND p.date_of_birth > CURRENT_DATE - interval '18 years'),
      'has_medical_flags', (
        COALESCE(p.kinesiology_intake->>'cardiaqueHtaPoitrine', '') = 'Oui'
        OR COALESCE(p.kinesiology_intake->>'etourdissementsEquilibre', '') = 'Oui'
        OR COALESCE(p.kinesiology_intake->>'medecinLimiteExercices', '') = 'Oui'
      ),
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
  LEFT JOIN effective_targets et ON et.client_id = l.client_id
  LEFT JOIN tracking_cfg tc ON tc.client_id = l.client_id
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
  'Fleet triage 14 j (CURRENT_DATE-13..aujourd''hui, comme le solo). Preuves datées : delta NULL sur mesure unique, durée réelle des pesées, cible effective moyenne, signaux déclarés 0–10, modules suivis, minorité/drapeaux.';
