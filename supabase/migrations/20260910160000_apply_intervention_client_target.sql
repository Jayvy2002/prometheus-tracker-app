-- Autorisation globale de la cible client pour apply_intervention.
-- Version Git = version schema_migrations. Ne pas rejouer 20260910153000.
-- Cible = auth.uid() OU is_coach_of(cible). Bloque le chemin p_id NULL
-- (assign_client_id) qui écrivait via SECURITY DEFINER sans lien actif.

CREATE OR REPLACE FUNCTION public.assert_client_target(p_client uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_client IS NULL THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_client = auth.uid() THEN
    RETURN;
  END IF;
  IF NOT public.is_coach_of(p_client) THEN
    RAISE EXCEPTION 'Not authorized for this client';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_client_target(uuid) FROM PUBLIC, anon, authenticated;

-- ================= D02 : effets exactement une fois =================

CREATE OR REPLACE FUNCTION public.apply_intervention(
  p_id uuid,
  p_idempotency_key text,
  p_claim_key text,
  p_status text,
  p_payload jsonb,
  p_effects jsonb,
  p_client_msg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.coach_interventions%ROWTYPE;
  v_applied jsonb := '{}'::jsonb;
  v_program_id uuid;
  v_fork_id uuid;
  v_client uuid;
  v_ex_id uuid;
  v_day_id uuid;
  v_msg_id uuid;
  v_shared int;
  v_cals int;
  v_prot int;
  v_carbs int;
  v_fat int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  IF p_status NOT IN ('sent', 'dismissed', 'kept') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  -- Chemin setup sans carte : lock de transaction puis replay ou apply.
  IF p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      ('x' || substr(md5(v_uid::text || ':' || p_idempotency_key), 1, 16))::bit(64)::bigint
    );
    SELECT result INTO v_applied
    FROM public.mutation_idempotency
    WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'applied', v_applied);
    END IF;
    v_client := NULLIF(p_effects->>'assign_client_id', '')::uuid;
    PERFORM public.assert_client_target(v_client);
    PERFORM public.assert_client_target(NULLIF(p_effects->'program'->>'assign_client_id', '')::uuid);
    v_applied := public._apply_intervention_effects(
      v_uid, v_client, COALESCE(p_effects, '{}'::jsonb), p_client_msg_id, '{}'::jsonb
    );
    INSERT INTO public.mutation_idempotency (user_id, idempotency_key, result)
    VALUES (v_uid, p_idempotency_key, v_applied);
    RETURN jsonb_build_object('ok', true, 'replayed', false, 'applied', v_applied);
  END IF;

  SELECT * INTO v_row
  FROM public.coach_interventions
  WHERE id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.coach_id <> v_uid THEN
    RAISE EXCEPTION 'Not this coach';
  END IF;

  -- Replay après succès (crash, retry, reload) : un seul effet.
  IF v_row.status <> 'pending' THEN
    IF v_row.idempotency_key IS NOT DISTINCT FROM p_idempotency_key THEN
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'applied', v_row.applied_values);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_resolved');
  END IF;

  IF v_row.claim_key IS NOT NULL
     AND v_row.claim_key IS DISTINCT FROM p_claim_key
     AND v_row.claimed_at IS NOT NULL
     AND v_row.claimed_at > now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  v_client := COALESCE(v_row.client_id, NULLIF(p_effects->>'assign_client_id', '')::uuid);
  PERFORM public.assert_client_target(v_client);
  PERFORM public.assert_client_target(NULLIF(p_effects->>'assign_client_id', '')::uuid);
  PERFORM public.assert_client_target(NULLIF(p_effects->'program'->>'assign_client_id', '')::uuid);

  v_applied := public._apply_intervention_effects(
    v_uid, v_client, COALESCE(p_effects, '{}'::jsonb), p_client_msg_id, v_applied
  );

  IF v_row.kind = 'calorie_adjustment' AND v_client IS NOT NULL THEN
    SELECT jsonb_build_object(
      'calories', p.daily_calorie_target,
      'protein', p.protein_target,
      'carbs', p.carbs_target,
      'fat', p.fat_target,
      'snapshot_at', now()
    )
    INTO v_applied
    FROM public.user_profiles p
    WHERE p.id = v_client;
  END IF;

  UPDATE public.coach_interventions
  SET status = p_status,
      payload = COALESCE(p_payload, payload),
      applied_values = COALESCE(v_applied, applied_values),
      claim_key = NULL,
      claimed_at = NULL,
      idempotency_key = p_idempotency_key,
      client_msg_id = COALESCE(p_client_msg_id, client_msg_id),
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'applied', v_applied);
END;
$$;

-- Effets (calories, tracking, programme, patch, message, note). Appelée dans
-- la transaction de apply_intervention. SECURITY DEFINER, search_path fixé.
CREATE OR REPLACE FUNCTION public._apply_intervention_effects(
  p_uid uuid,
  p_client uuid,
  p_effects jsonb,
  p_client_msg_id text,
  p_applied jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied jsonb := COALESCE(p_applied, '{}'::jsonb);
  v_program_id uuid;
  v_fork_id uuid;
  v_ex_id uuid;
  v_day_id uuid;
  v_shared int;
  v_patch jsonb;
  v_msg jsonb;
  v_note jsonb;
  v_track jsonb;
  v_cals jsonb;
  v_prog jsonb;
  v_assign_id uuid;
BEGIN
  PERFORM public.assert_client_target(p_client);
  PERFORM public.assert_client_target(NULLIF(p_effects->>'assign_client_id', '')::uuid);
  PERFORM public.assert_client_target(NULLIF(p_effects->'program'->>'assign_client_id', '')::uuid);

  v_cals := p_effects->'calories';
  IF v_cals IS NOT NULL AND jsonb_typeof(v_cals) = 'object' THEN
    IF p_client IS NULL THEN
      RAISE EXCEPTION 'Client required for calorie effect';
    END IF;
    PERFORM public.coach_set_client_nutrition_targets(
      p_client,
      (v_cals->>'calories')::int,
      (v_cals->>'protein')::int,
      (v_cals->>'carbs')::int,
      (v_cals->>'fat')::int
    );
    v_applied := v_applied || jsonb_build_object('calories', v_cals);
  END IF;

  v_track := p_effects->'tracking';
  IF v_track IS NOT NULL AND jsonb_typeof(v_track) = 'object' THEN
    IF p_client IS NULL THEN
      RAISE EXCEPTION 'Client required for tracking effect';
    END IF;
    INSERT INTO public.client_tracking_config (
      coach_id, client_id, track_weight, track_checkins, track_nutrition,
      track_workouts, workout_focus, setup_completed_at, updated_at
    ) VALUES (
      p_uid, p_client,
      COALESCE((v_track->>'track_weight')::boolean, true),
      COALESCE((v_track->>'track_checkins')::boolean, true),
      COALESCE((v_track->>'track_nutrition')::boolean, true),
      COALESCE((v_track->>'track_workouts')::boolean, true),
      COALESCE(v_track->>'workout_focus', ''),
      NULLIF(v_track->>'setup_completed_at', '')::timestamptz,
      now()
    )
    ON CONFLICT (coach_id, client_id) DO UPDATE SET
      track_weight = EXCLUDED.track_weight,
      track_checkins = EXCLUDED.track_checkins,
      track_nutrition = EXCLUDED.track_nutrition,
      track_workouts = EXCLUDED.track_workouts,
      workout_focus = EXCLUDED.workout_focus,
      setup_completed_at = COALESCE(EXCLUDED.setup_completed_at, client_tracking_config.setup_completed_at),
      updated_at = now();
    v_applied := v_applied || jsonb_build_object('tracking', true);
  END IF;

  v_prog := p_effects->'program';
  IF v_prog IS NOT NULL AND jsonb_typeof(v_prog) = 'object' THEN
    v_program_id := public.create_program_complete(
      v_prog->>'name',
      COALESCE(v_prog->>'description', ''),
      COALESCE((v_prog->>'duration_weeks')::int, 8),
      COALESCE(v_prog->'days', '[]'::jsonb),
      COALESCE(NULLIF(v_prog->>'assign_client_id', '')::uuid, p_client),
      COALESCE(NULLIF(v_prog->>'start_date', '')::date, CURRENT_DATE)
    );
    v_applied := v_applied || jsonb_build_object('program_id', v_program_id);
  END IF;

  v_assign_id := NULLIF(p_effects->>'assign_program_id', '')::uuid;
  IF v_assign_id IS NOT NULL THEN
    IF p_client IS NULL THEN
      RAISE EXCEPTION 'Client required for assignment';
    END IF;
    PERFORM public.assign_program_secure(
      v_assign_id,
      p_client,
      COALESCE(NULLIF(p_effects->>'start_date', '')::date, CURRENT_DATE)
    );
    v_applied := v_applied || jsonb_build_object('assigned_program_id', v_assign_id);
  END IF;

  v_patch := p_effects->'patch';
  IF v_patch IS NOT NULL AND jsonb_typeof(v_patch) = 'object' THEN
    v_program_id := NULLIF(v_patch->>'program_id', '')::uuid;
    IF v_program_id IS NULL THEN
      RAISE EXCEPTION 'Program required for patch';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.programs p WHERE p.id = v_program_id AND p.owner_id = p_uid
    ) THEN
      RAISE EXCEPTION 'Not program owner';
    END IF;

    IF COALESCE((v_patch->>'fork_if_shared')::boolean, false) AND p_client IS NOT NULL THEN
      SELECT COUNT(*) INTO v_shared
      FROM public.program_assignments
      WHERE program_id = v_program_id AND status = 'active' AND client_id <> p_client;
      IF v_shared > 0 THEN
        v_fork_id := public.fork_program(v_program_id, NULL);
        PERFORM public.assign_program_secure(v_fork_id, p_client, CURRENT_DATE);
        v_program_id := v_fork_id;
        -- IDs du clone : résolution par weekday + nom.
        SELECT e.id INTO v_ex_id
        FROM public.program_day_exercises e
        JOIN public.program_days d ON d.id = e.program_day_id
        WHERE d.program_id = v_program_id
          AND (NULLIF(v_patch->>'weekday', '')::int IS NULL OR d.weekday = (v_patch->>'weekday')::int)
          AND lower(e.name) = lower(COALESCE(v_patch->>'exercise', e.name))
        ORDER BY d.order_index, e.order_index
        LIMIT 1;
      END IF;
    END IF;

    v_ex_id := COALESCE(v_ex_id, NULLIF(v_patch->>'exercise_id', '')::uuid);
    v_day_id := NULLIF(v_patch->>'program_day_id', '')::uuid;
    IF v_ex_id IS NULL AND v_day_id IS NOT NULL THEN
      SELECT e.id INTO v_ex_id
      FROM public.program_day_exercises e
      WHERE e.program_day_id = v_day_id
        AND lower(e.name) = lower(COALESCE(v_patch->>'exercise', ''))
      LIMIT 1;
    END IF;
    IF v_ex_id IS NULL THEN
      RAISE EXCEPTION 'Patch target not found';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.program_day_exercises e
      JOIN public.program_days d ON d.id = e.program_day_id
      JOIN public.programs p ON p.id = d.program_id
      WHERE e.id = v_ex_id AND p.owner_id = p_uid AND p.id = v_program_id
    ) THEN
      RAISE EXCEPTION 'Patch target not found';
    END IF;

    UPDATE public.program_day_exercises
    SET
      name = COALESCE(NULLIF(btrim(v_patch->>'replace_with'), ''), name),
      default_sets = COALESCE((v_patch->>'default_sets')::int, default_sets),
      default_reps = COALESCE((v_patch->>'default_reps')::int, default_reps),
      default_reps_min = CASE WHEN v_patch ? 'default_reps_min'
        THEN NULLIF(v_patch->>'default_reps_min', '')::int ELSE default_reps_min END,
      default_rir = CASE WHEN v_patch ? 'default_rir'
        THEN NULLIF(v_patch->>'default_rir', '')::int ELSE default_rir END,
      default_rest_seconds = COALESCE((v_patch->>'default_rest_seconds')::int, default_rest_seconds),
      default_weight_kg = CASE WHEN v_patch ? 'default_weight_kg'
        THEN NULLIF(v_patch->>'default_weight_kg', '')::numeric ELSE default_weight_kg END
    WHERE id = v_ex_id;
    PERFORM public.snapshot_program_revision(v_program_id);
    v_applied := v_applied || jsonb_build_object('patched_exercise_id', v_ex_id, 'program_id', v_program_id);
  END IF;

  v_msg := p_effects->'message';
  IF v_msg IS NOT NULL AND jsonb_typeof(v_msg) = 'object' THEN
    IF p_client IS NULL THEN
      RAISE EXCEPTION 'Client required for message';
    END IF;
    IF NULLIF(btrim(COALESCE(v_msg->>'body', '')), '') IS NULL THEN
      RAISE EXCEPTION 'empty';
    END IF;
    BEGIN
      INSERT INTO public.coach_messages (
        coach_id, client_id, sender_id, body, template_key, client_msg_id
      ) VALUES (
        p_uid, p_client, p_uid,
        btrim(v_msg->>'body'),
        NULLIF(v_msg->>'template_key', ''),
        COALESCE(p_client_msg_id, v_msg->>'client_msg_id')
      );
    EXCEPTION WHEN unique_violation THEN
      NULL; -- même client_msg_id : déjà envoyé
    END;
    v_applied := v_applied || jsonb_build_object('message', true);
  END IF;

  v_note := p_effects->'note';
  IF v_note IS NOT NULL AND jsonb_typeof(v_note) = 'object'
     AND NULLIF(btrim(COALESCE(v_note->>'body', '')), '') IS NOT NULL THEN
    IF p_client IS NULL THEN
      RAISE EXCEPTION 'Client required for note';
    END IF;
    INSERT INTO public.coach_notes (coach_id, client_id, body, note_date)
    VALUES (
      p_uid, p_client, btrim(v_note->>'body'),
      COALESCE(NULLIF(v_note->>'note_date', '')::date, CURRENT_DATE)
    );
    v_applied := v_applied || jsonb_build_object('note', true);
  END IF;

  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_intervention_effects(uuid, uuid, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_intervention(uuid, text, text, text, jsonb, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_intervention(uuid, text, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;

COMMENT ON FUNCTION public.apply_intervention(uuid, text, text, text, jsonb, jsonb, text) IS
  'D02 : applique les effets et fige la décision dans une transaction. idempotency_key = exactement une fois. Cible = auth.uid() ou is_coach_of.';

