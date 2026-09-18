-- P1.1: professional capability is authoritative and survives personal transitions.
-- Privileged legacy writes may still opt in for compatibility, but cannot revoke it.
CREATE OR REPLACE FUNCTION public.sync_legacy_coach_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.coaching_role = 'coach' THEN
    INSERT INTO public.user_capabilities(user_id, capability) VALUES (NEW.user_id, 'coach')
    ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_legacy_coach_capability() FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.user_capabilities IS
  'Authoritative professional capabilities. Personal relationships and workspace do not revoke coach capability.';

CREATE OR REPLACE FUNCTION public.set_coach_capability(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_capability'; END IF;
  INSERT INTO public.user_roles(user_id, role, coaching_role)
    VALUES (v_uid, 'free', 'none') ON CONFLICT (user_id) DO NOTHING;
  -- Serialize capability changes with personal relationship transitions.
  PERFORM 1 FROM public.user_roles WHERE user_id = v_uid FOR UPDATE;
  IF NOT p_enabled AND EXISTS (
    SELECT 1 FROM public.coach_client_links WHERE coach_id = v_uid AND status = 'active'
  ) THEN RAISE EXCEPTION 'coach_has_active_clients'; END IF;
  IF p_enabled THEN
    INSERT INTO public.user_capabilities(user_id, capability) VALUES (v_uid, 'coach')
      ON CONFLICT DO NOTHING;
    v_role := 'coach';
  ELSE
    DELETE FROM public.user_capabilities WHERE user_id = v_uid AND capability = 'coach';
    v_role := CASE WHEN EXISTS (
      SELECT 1 FROM public.coach_client_links WHERE client_id = v_uid AND status = 'active'
    ) THEN 'client' ELSE 'none' END;
  END IF;
  -- Write-through projection for older clients. Never changes billing or links.
  UPDATE public.user_roles SET coaching_role = v_role, updated_at = now() WHERE user_id = v_uid;
  RETURN public.get_my_account_context();
END;
$$;
REVOKE ALL ON FUNCTION public.set_coach_capability(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_coach_capability(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_coaching_role(p_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('none', 'coach') THEN
    RAISE EXCEPTION 'Invalid coaching role';
  END IF;
  RETURN public.set_coach_capability(p_role = 'coach')->>'legacy_coaching_role';
END;
$$;
REVOKE ALL ON FUNCTION public.set_coaching_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_coaching_role(text) TO authenticated;
COMMENT ON FUNCTION public.set_coaching_role(text) IS
  'Legacy adapter to set_coach_capability; never grants or ends a personal relationship.';

-- Relationship-based personal access applies equally to professional coaches.
CREATE OR REPLACE FUNCTION public.is_self_coach()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.coach_client_links WHERE client_id = auth.uid() AND status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_self_coach() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_self_coach() TO authenticated, service_role;

DROP POLICY questionnaire_versions_create_owner ON public.coach_questionnaire_versions;
CREATE POLICY questionnaire_versions_create_owner ON public.coach_questionnaire_versions
FOR INSERT TO authenticated WITH CHECK (
  coach_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_capabilities WHERE user_id = (SELECT auth.uid()) AND capability = 'coach'
  )
);

-- Preserve triage_coach_fleet from 20260910052704_audit_triage_span_date_fix.sql; change only the capability/relationship predicate.
CREATE OR REPLACE FUNCTION public.triage_coach_fleet(p_coach_id uuid DEFAULT NULL, p_client_id uuid DEFAULT NULL) RETURNS TABLE (coach_id uuid, client_id uuid, dossier jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ #variable_conflict use_column DECLARE v_from date := CURRENT_DATE - 13; v_coach uuid := p_coach_id; BEGIN IF auth.uid() IS NOT NULL THEN IF v_coach IS NULL THEN v_coach := auth.uid(); END IF; IF auth.uid() <> v_coach THEN RAISE EXCEPTION 'Not this coach'; END IF; IF NOT EXISTS (SELECT 1 FROM public.user_capabilities WHERE user_id = auth.uid() AND capability = 'coach') THEN RAISE EXCEPTION 'not_coach'; END IF; END IF; RETURN QUERY WITH links AS (SELECT ccl.coach_id, ccl.client_id, ccl.created_at AS linked_at FROM public.coach_client_links ccl WHERE ccl.status = 'active' AND (v_coach IS NULL OR ccl.coach_id = v_coach) AND (p_client_id IS NULL OR ccl.client_id = p_client_id)), program_frequency AS (SELECT pa.client_id, COUNT(DISTINCT pd.weekday)::int AS training_frequency FROM public.program_assignments pa JOIN public.program_days pd ON pd.program_id = pa.program_id JOIN links l ON l.client_id = pa.client_id WHERE pa.status = 'active' GROUP BY pa.client_id), nutrition_days AS (SELECT nl.user_id, nl.logged_at::date AS d, SUM(nl.calories)::numeric AS kcal FROM public.nutrition_logs nl JOIN links l ON l.client_id = nl.user_id WHERE nl.logged_at >= v_from GROUP BY nl.user_id, nl.logged_at::date), nutrition_agg AS (SELECT user_id, COUNT(*)::int AS logged_nutrition_days, COALESCE(AVG(kcal), 0)::numeric AS avg_calories, MAX(d)::text AS last_nutrition_at FROM nutrition_days GROUP BY user_id), workout_agg AS (SELECT w.user_id, COUNT(*) FILTER (WHERE COALESCE(w.completed, true))::int AS workout_count, MAX(w.date)::text AS last_workout_at FROM public.workouts w JOIN links l ON l.client_id = w.user_id WHERE w.date >= v_from::timestamptz GROUP BY w.user_id), checkin_agg AS (SELECT c.user_id, COUNT(*)::int AS checkin_count, MAX(c.checked_at)::text AS last_checkin_at, AVG(c.adherence_nutrition)::numeric AS avg_adherence_nutrition, AVG(c.adherence_training)::numeric AS avg_adherence_training, AVG(c.hunger)::numeric AS avg_hunger, AVG(c.mood)::numeric AS avg_mood, AVG(c.stress)::numeric AS avg_stress, AVG(public.checkin_score_on_ten(c.fatigue, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_fatigue, AVG(public.checkin_score_on_ten(c.sleep_quality, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_sleep_quality, AVG(public.checkin_score_on_ten(c.muscle_soreness, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_soreness, AVG(public.checkin_score_on_ten(c.energy_level, c.hunger, c.fatigue, c.sleep_quality, c.stress, c.motivation, c.muscle_soreness, c.joint_pain, c.energy_level, c.mood))::numeric AS avg_energy FROM public.daily_checkins c JOIN links l ON l.client_id = c.user_id WHERE c.checked_at >= v_from GROUP BY c.user_id), weekday_map AS (SELECT l.client_id, (SELECT jsonb_agg(ord ORDER BY ord) FROM (SELECT DISTINCT CASE lower(elem) WHEN 'dim' THEN 0 WHEN 'lun' THEN 1 WHEN 'mar' THEN 2 WHEN 'mer' THEN 3 WHEN 'jeu' THEN 4 WHEN 'ven' THEN 5 WHEN 'sam' THEN 6 END AS ord FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.kinesiology_intake->'extras'->'joursDispo') = 'array' THEN p.kinesiology_intake->'extras'->'joursDispo' ELSE '[]'::jsonb END) AS elem) mapped WHERE ord IS NOT NULL) AS available_weekdays FROM links l JOIN public.user_profiles p ON p.id = l.client_id), weight_ord AS (SELECT wm.id AS w_id, wm.user_id, wm.weight_kg, wm.measured_at, ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at ASC) AS rn_asc, ROW_NUMBER() OVER (PARTITION BY wm.user_id ORDER BY wm.measured_at DESC) AS rn_desc FROM public.weight_measurements wm JOIN links l ON l.client_id = wm.user_id WHERE wm.measured_at >= v_from), weight_agg AS (SELECT a.user_id, a.weight_kg AS weight_start_kg, b.weight_kg AS weight_end_kg, a.measured_at AS weight_start_at, b.measured_at AS weight_end_at, CASE WHEN a.w_id = b.w_id THEN NULL ELSE (b.measured_at - a.measured_at)::numeric END AS weight_span_days, CASE WHEN a.w_id = b.w_id THEN NULL ELSE ROUND((b.weight_kg - a.weight_kg)::numeric, 1) END AS weight_delta_kg FROM weight_ord a JOIN weight_ord b ON b.user_id = a.user_id AND b.rn_desc = 1 WHERE a.rn_asc = 1), effective_targets AS (SELECT l.client_id, AVG(COALESCE((SELECT h.calories FROM public.nutrition_target_history h WHERE h.user_id = l.client_id AND h.effective_from <= d.day::date ORDER BY h.effective_from DESC LIMIT 1), p.daily_calorie_target, 0))::numeric AS avg_effective_target FROM links l JOIN public.user_profiles p ON p.id = l.client_id CROSS JOIN generate_series(v_from, CURRENT_DATE, interval '1 day') AS d(day) GROUP BY l.client_id), tracking_cfg AS (SELECT t.client_id, t.track_nutrition, t.track_workouts, t.track_weight, t.track_checkins FROM public.client_tracking_config t JOIN links l ON l.client_id = t.client_id AND l.coach_id = t.coach_id), last_msg AS (SELECT m.client_id, MAX(m.created_at)::text AS last_message_at FROM public.coach_messages m JOIN links l ON l.client_id = m.client_id AND l.coach_id = m.coach_id GROUP BY m.client_id), last_coach_msg AS (SELECT m.client_id, MAX(m.created_at)::text AS last_coach_message_at FROM public.coach_messages m JOIN links l ON l.client_id = m.client_id AND l.coach_id = m.coach_id WHERE m.sender_id = m.coach_id GROUP BY m.client_id), last_kit AS (SELECT ci.client_id, MAX(COALESCE(ci.resolved_at, ci.updated_at))::text AS last_keep_in_touch_at FROM public.coach_interventions ci JOIN links l ON l.client_id = ci.client_id AND l.coach_id = ci.coach_id WHERE ci.kind = 'keep_in_touch' AND ci.status IN ('sent', 'dismissed', 'kept') GROUP BY ci.client_id), pending_fleet AS (SELECT DISTINCT ci.client_id FROM public.coach_interventions ci JOIN links l ON l.client_id = ci.client_id AND l.coach_id = ci.coach_id WHERE ci.source = 'fleet' AND ci.status = 'pending' AND ci.client_id IS NOT NULL), handled_ord AS (SELECT ci.client_id, ci.kind, COALESCE(ci.payload->>'flag', ci.kind) AS flag, ci.status, COALESCE(ci.resolved_at, ci.updated_at) AS handled_at, COALESCE(ci.payload->'evidence', jsonb_build_object('avg_calories', ci.payload->'avg_calories', 'logged_nutrition_days', ci.payload->'logged_nutrition_days', 'workout_count', ci.payload->'workout_count', 'checkin_count', ci.payload->'checkin_count', 'weight_delta_kg', ci.payload->'weight_delta_kg', 'last_nutrition_at', ci.payload->>'last_nutrition_at', 'last_workout_at', ci.payload->>'last_workout_at', 'last_checkin_at', ci.payload->>'last_checkin_at')) AS evidence, ROW_NUMBER() OVER (PARTITION BY ci.client_id, ci.kind, COALESCE(ci.payload->>'flag', ci.kind) ORDER BY COALESCE(ci.resolved_at, ci.updated_at) DESC NULLS LAST) AS rn FROM public.coach_interventions ci JOIN links l ON l.client_id = ci.client_id AND l.coach_id = ci.coach_id WHERE ci.status IN ('sent', 'dismissed', 'kept') AND ci.client_id IS NOT NULL), handled_agg AS (SELECT handled_ord.client_id, jsonb_agg(jsonb_build_object('kind', handled_ord.kind, 'flag', handled_ord.flag, 'status', handled_ord.status, 'handled_at', handled_ord.handled_at, 'evidence', handled_ord.evidence)) AS fleet_handled FROM handled_ord WHERE handled_ord.rn = 1 GROUP BY handled_ord.client_id) SELECT l.coach_id, l.client_id, jsonb_build_object('coach_id', l.coach_id, 'client_id', l.client_id, 'full_name', COALESCE(p.full_name, ''), 'goal', COALESCE(p.goal, ''), 'onboarding_completed', COALESCE(p.onboarding_completed, false), 'has_program', EXISTS (SELECT 1 FROM public.program_assignments pa WHERE pa.client_id = l.client_id AND pa.status = 'active'), 'setup_completed', EXISTS (SELECT 1 FROM public.client_tracking_config t WHERE t.client_id = l.client_id AND t.coach_id = l.coach_id AND t.setup_completed_at IS NOT NULL), 'linked_days', GREATEST(0, (CURRENT_DATE - l.linked_at::date)), 'training_frequency', COALESCE(NULLIF(pfreq.training_frequency, 0), NULLIF(p.training_frequency, 0), 3), 'calorie_target', COALESCE(p.daily_calorie_target, 0), 'protein_target', COALESCE(p.protein_target, 0), 'carbs_target', COALESCE(p.carbs_target, 0), 'fat_target', COALESCE(p.fat_target, 0), 'weight_kg', COALESCE(p.weight_kg, 0), 'logged_nutrition_days', COALESCE(n.logged_nutrition_days, 0), 'avg_calories', ROUND(COALESCE(n.avg_calories, 0)), 'last_nutrition_at', n.last_nutrition_at, 'workout_count', COALESCE(w.workout_count, 0), 'last_workout_at', w.last_workout_at, 'checkin_count', COALESCE(c.checkin_count, 0), 'last_checkin_at', c.last_checkin_at, 'avg_adherence_nutrition', CASE WHEN c.avg_adherence_nutrition IS NULL THEN NULL ELSE ROUND(c.avg_adherence_nutrition, 1) END, 'avg_adherence_training', CASE WHEN c.avg_adherence_training IS NULL THEN NULL ELSE ROUND(c.avg_adherence_training, 1) END, 'avg_hunger', CASE WHEN c.avg_hunger IS NULL THEN NULL ELSE ROUND(c.avg_hunger, 1) END, 'avg_mood', CASE WHEN c.avg_mood IS NULL THEN NULL ELSE ROUND(c.avg_mood, 1) END, 'avg_stress', CASE WHEN c.avg_stress IS NULL THEN NULL ELSE ROUND(c.avg_stress, 1) END, 'available_weekdays', wd.available_weekdays, 'avg_fatigue', CASE WHEN c.avg_fatigue IS NULL THEN NULL ELSE ROUND(c.avg_fatigue, 1) END, 'avg_sleep_quality', CASE WHEN c.avg_sleep_quality IS NULL THEN NULL ELSE ROUND(c.avg_sleep_quality, 1) END, 'avg_soreness', CASE WHEN c.avg_soreness IS NULL THEN NULL ELSE ROUND(c.avg_soreness, 1) END, 'avg_energy', CASE WHEN c.avg_energy IS NULL THEN NULL ELSE ROUND(c.avg_energy, 1) END, 'weight_start_kg', wt.weight_start_kg, 'weight_end_kg', wt.weight_end_kg, 'weight_start_at', wt.weight_start_at, 'weight_end_at', wt.weight_end_at, 'weight_span_days', wt.weight_span_days, 'weight_delta_kg', wt.weight_delta_kg, 'avg_effective_target', ROUND(COALESCE(et.avg_effective_target, p.daily_calorie_target, 0)), 'tracking', jsonb_build_object('nutrition', COALESCE(tc.track_nutrition, false), 'workouts', COALESCE(tc.track_workouts, false), 'weight', COALESCE(tc.track_weight, false), 'checkins', COALESCE(tc.track_checkins, false)), 'is_minor', (p.date_of_birth IS NOT NULL AND p.date_of_birth > CURRENT_DATE - interval '18 years'), 'has_medical_flags', (COALESCE(p.kinesiology_intake->>'cardiaqueHtaPoitrine', '') = 'Oui' OR COALESCE(p.kinesiology_intake->>'etourdissementsEquilibre', '') = 'Oui' OR COALESCE(p.kinesiology_intake->>'medecinLimiteExercices', '') = 'Oui'), 'last_message_at', m.last_message_at, 'last_coach_message_at', cm.last_coach_message_at, 'last_keep_in_touch_at', kit.last_keep_in_touch_at, 'pending_fleet', pend.client_id IS NOT NULL, 'fleet_handled', COALESCE(h.fleet_handled, '[]'::jsonb)) AS dossier FROM links l JOIN public.user_profiles p ON p.id = l.client_id LEFT JOIN program_frequency pfreq ON pfreq.client_id = l.client_id LEFT JOIN nutrition_agg n ON n.user_id = l.client_id LEFT JOIN workout_agg w ON w.user_id = l.client_id LEFT JOIN checkin_agg c ON c.user_id = l.client_id LEFT JOIN weekday_map wd ON wd.client_id = l.client_id LEFT JOIN weight_agg wt ON wt.user_id = l.client_id LEFT JOIN effective_targets et ON et.client_id = l.client_id LEFT JOIN tracking_cfg tc ON tc.client_id = l.client_id LEFT JOIN last_msg m ON m.client_id = l.client_id LEFT JOIN last_coach_msg cm ON cm.client_id = l.client_id LEFT JOIN last_kit kit ON kit.client_id = l.client_id LEFT JOIN pending_fleet pend ON pend.client_id = l.client_id LEFT JOIN handled_agg h ON h.client_id = l.client_id; END; $$;

-- Preserve assign_questionnaire_complements from 20260915201731_assign_questionnaire_complements.sql; change only the capability/relationship predicate.
create or replace function public.assign_questionnaire_complements(p_version_id uuid, p_client_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := auth.uid();
  v_qid uuid;
  v_owner uuid;
  cid uuid;
  assigned uuid[] := '{}';
  skipped jsonb := '[]'::jsonb;
  already boolean;
begin
  if v_coach is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.user_capabilities r
    where r.user_id = v_coach and r.capability = 'coach'
  ) then
    raise exception 'not_coach';
  end if;
  select questionnaire_id, coach_id into v_qid, v_owner
  from public.coach_questionnaire_versions
  where id = p_version_id;
  if v_qid is null or v_owner is distinct from v_coach then
    raise exception 'version_not_found';
  end if;
  if p_client_ids is null or cardinality(p_client_ids) = 0 then
    return jsonb_build_object('ok', true, 'assigned', to_jsonb(assigned), 'skipped', skipped);
  end if;
  if cardinality(p_client_ids) > 200 then
    raise exception 'too_many_clients';
  end if;
  for cid in
    select distinct x from unnest(p_client_ids) as t(x) where x is not null order by 1
  loop
    if not exists (
      select 1 from public.coach_client_links l
      where l.coach_id = v_coach and l.client_id = cid and l.status = 'active'
      for share
    ) then
      skipped := skipped || jsonb_build_array(jsonb_build_object('client_id', cid, 'reason', 'not_linked'));
      continue;
    end if;
    select exists (
      select 1 from public.client_questionnaire_responses r
      where r.client_id = cid and r.version_id = p_version_id
    ) into already;
    if already then
      skipped := skipped || jsonb_build_array(jsonb_build_object('client_id', cid, 'reason', 'already_assigned'));
      continue;
    end if;
    perform r.id from public.client_questionnaire_responses r
      join public.coach_questionnaire_versions v on v.id = r.version_id
      where r.client_id = cid
        and v.questionnaire_id = v_qid
        and r.completed_at is null
      for update of r;
    if found then
      skipped := skipped || jsonb_build_array(jsonb_build_object('client_id', cid, 'reason', 'in_progress'));
      continue;
    end if;
    insert into public.client_questionnaire_responses (invite_id, version_id, coach_id, client_id)
    values (null, p_version_id, v_coach, cid);
    assigned := array_append(assigned, cid);
  end loop;
  return jsonb_build_object('ok', true, 'assigned', to_jsonb(assigned), 'skipped', skipped);
end;
$$;

-- Preserve upsert_coach_intervention from 20260906023536_solo_self_coach_upsert.sql; change only the capability/relationship predicate.
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
  v_self boolean := (p_coach_id IS NOT NULL AND p_coach_id IS NOT DISTINCT FROM p_client_id);
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

  IF v_self THEN
    IF EXISTS (
      SELECT 1 FROM public.coach_client_links
      WHERE client_id = p_client_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Coached athletes cannot self-coach';
    END IF;
IF auth.uid() IS NOT NULL AND auth.uid() <> p_coach_id THEN
      RAISE EXCEPTION 'Not this client''s coach';
    END IF;
  ELSIF auth.uid() IS NOT NULL THEN
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

-- An outstanding invite must not reactivate a roster after capability revocation.
-- Lock the same account row as set_coach_capability before checking the capability.
-- This also serializes concurrent activation versus disable (both orders are safe).
CREATE OR REPLACE FUNCTION public.require_active_coach_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM 1 FROM public.user_roles WHERE user_id = NEW.coach_id FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_capabilities WHERE user_id = NEW.coach_id AND capability = 'coach'
    ) THEN RAISE EXCEPTION 'coach_capability_required'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_active_coach_capability() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_active_coach_capability
  BEFORE INSERT OR UPDATE OF status, coach_id ON public.coach_client_links
  FOR EACH ROW EXECUTE FUNCTION public.require_active_coach_capability();
