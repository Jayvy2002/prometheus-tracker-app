-- D01/D02 blockers (après alignement 29 versions prod).
-- Version Git = version schema_migrations. Ne pas rejouer les 29 précédentes.
--
-- D01 : create_program_complete crée programme + jours + exercices
--       (+ copie de routine) + assignation optionnelle en UNE transaction.
-- D02 : apply_intervention applique TOUS les effets puis fige la décision
--       dans la même transaction. Clé d'idempotence persistée : un retry
--       après succès (ou crash+reload avec la même clé) ne rejoue pas.

ALTER TABLE public.coach_interventions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS client_msg_id text;

CREATE UNIQUE INDEX IF NOT EXISTS coach_interventions_idempotency_uidx
  ON public.coach_interventions (coach_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mutation_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
ALTER TABLE public.mutation_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mutation_idempotency FROM PUBLIC, anon, authenticated;

-- ================= D01 : création complète atomique =================

CREATE OR REPLACE FUNCTION public.create_program_complete(
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb,
  p_assign_client_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_program_id uuid;
  v_day jsonb;
  v_ex jsonb;
  v_weekday int;
  v_name text;
  v_sets int;
  v_reps int;
  v_rest int;
  v_day_id uuid;
  v_order int := 0;
  v_ex_count int;
  v_routine_id uuid;
  v_seen int[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Program name required';
  END IF;
  IF p_duration_weeks IS NULL OR p_duration_weeks < 1 OR p_duration_weeks > 52 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) > 14 THEN
    RAISE EXCEPTION 'Invalid days';
  END IF;

  -- Validation complète AVANT toute mutation.
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    BEGIN
      v_weekday := (v_day->>'weekday')::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid weekday';
    END;
    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'Invalid weekday';
    END IF;
    IF v_weekday = ANY (v_seen) THEN
      RAISE EXCEPTION 'Duplicate weekday %', v_weekday;
    END IF;
    v_seen := v_seen || v_weekday;

    v_routine_id := NULLIF(v_day->>'routine_id', '')::uuid;
    IF v_routine_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.routines r
      WHERE r.id = v_routine_id AND r.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Routine not found';
    END IF;

    IF v_day ? 'exercises' AND v_day->'exercises' IS NOT NULL
       AND jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day %', v_weekday;
    END IF;
    IF v_day ? 'exercises' AND jsonb_typeof(v_day->'exercises') = 'array'
       AND jsonb_array_length(v_day->'exercises') > 100 THEN
      RAISE EXCEPTION 'Too many exercises';
    END IF;
    IF v_day ? 'exercises' AND jsonb_typeof(v_day->'exercises') = 'array' THEN
      FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
        v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
        IF v_name IS NULL THEN
          RAISE EXCEPTION 'Exercise name required';
        END IF;
        BEGIN
          v_sets := COALESCE((v_ex->>'default_sets')::int, 3);
          v_reps := COALESCE((v_ex->>'default_reps')::int, 10);
          v_rest := COALESCE((v_ex->>'default_rest_seconds')::int, 90);
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Invalid numbers for %', v_name;
        END;
        IF v_sets < 1 OR v_sets > 100 THEN
          RAISE EXCEPTION 'Invalid sets for %', v_name;
        END IF;
        IF v_reps < 0 OR v_reps > 5000 THEN
          RAISE EXCEPTION 'Invalid reps for %', v_name;
        END IF;
        IF v_rest < 0 OR v_rest > 3600 THEN
          RAISE EXCEPTION 'Invalid rest for %', v_name;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF p_assign_client_id IS NOT NULL THEN
    IF p_start_date IS NULL THEN
      RAISE EXCEPTION 'Start date required for assignment';
    END IF;
    IF p_assign_client_id <> v_uid AND NOT public.is_coach_of(p_assign_client_id) THEN
      RAISE EXCEPTION 'Not authorized for this client';
    END IF;
    IF p_assign_client_id = v_uid AND EXISTS (
      SELECT 1 FROM public.coach_client_links
      WHERE client_id = v_uid AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Coached client cannot self-assign';
    END IF;
  END IF;

  INSERT INTO public.programs (owner_id, name, description, duration_weeks)
  VALUES (v_uid, btrim(p_name), COALESCE(p_description, ''), p_duration_weeks)
  RETURNING id INTO v_program_id;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    v_weekday := (v_day->>'weekday')::int;
    v_routine_id := NULLIF(v_day->>'routine_id', '')::uuid;
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
    VALUES (
      v_program_id,
      v_weekday,
      COALESCE(v_day->>'name', ''),
      v_routine_id,
      COALESCE((v_day->>'order_index')::int, v_order)
    )
    RETURNING id INTO v_day_id;
    v_order := v_order + 1;
    v_ex_count := 0;

    IF v_day ? 'exercises' AND jsonb_typeof(v_day->'exercises') = 'array'
       AND jsonb_array_length(v_day->'exercises') > 0 THEN
      FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
        INSERT INTO public.program_day_exercises (
          program_day_id, name, default_sets, default_reps, default_reps_min,
          default_rir, default_rest_seconds, default_weight_kg, order_index
        ) VALUES (
          v_day_id,
          btrim(v_ex->>'name'),
          COALESCE((v_ex->>'default_sets')::int, 3),
          COALESCE((v_ex->>'default_reps')::int, 10),
          NULLIF(v_ex->>'default_reps_min', '')::int,
          NULLIF(v_ex->>'default_rir', '')::int,
          COALESCE((v_ex->>'default_rest_seconds')::int, 90),
          NULLIF(v_ex->>'default_weight_kg', '')::numeric,
          COALESCE((v_ex->>'order_index')::int, v_ex_count)
        );
        v_ex_count := v_ex_count + 1;
      END LOOP;
    ELSIF v_routine_id IS NOT NULL THEN
      INSERT INTO public.program_day_exercises (
        program_day_id, name, default_sets, default_reps, default_reps_min,
        default_rir, default_rest_seconds, default_weight_kg, order_index
      )
      SELECT
        v_day_id, re.name, re.default_sets, re.default_reps, NULL, NULL,
        re.default_rest_seconds, NULL, re.order_index
      FROM public.routine_exercises re
      WHERE re.routine_id = v_routine_id
      ORDER BY re.order_index;
    END IF;
  END LOOP;

  IF p_assign_client_id IS NOT NULL THEN
    UPDATE public.program_assignments
    SET status = 'paused', updated_at = now()
    WHERE client_id = p_assign_client_id AND status = 'active';

    INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
    VALUES (v_program_id, p_assign_client_id, v_uid, p_start_date, 'active');
  END IF;

  PERFORM public.snapshot_program_revision(v_program_id);
  RETURN v_program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.create_program_complete(text, text, int, jsonb, uuid, date) IS
  'D01 : programme + jours + exercices (+ routine) + assignation optionnelle, une transaction. Toute erreur annule tout.';

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
  'D02 : applique les effets et fige la décision dans une transaction. idempotency_key = exactement une fois.';

-- claim accepte de reposer la même clé (reload) et mémorise client_msg_id.
CREATE OR REPLACE FUNCTION public.claim_intervention(
  p_id uuid,
  p_claim_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.coach_interventions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_id IS NULL OR p_claim_key IS NULL OR length(p_claim_key) < 8 THEN
    RAISE EXCEPTION 'Invalid claim';
  END IF;
  SELECT * INTO v_row
  FROM public.coach_interventions WHERE id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.coach_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not this coach';
  END IF;
  IF v_row.status <> 'pending' THEN
    IF v_row.idempotency_key IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'already_done', true, 'claim_key', v_row.claim_key);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_resolved');
  END IF;
  IF v_row.claim_key IS NOT NULL AND v_row.claim_key <> p_claim_key THEN
    IF v_row.claimed_at IS NOT NULL
       AND v_row.claimed_at > now() - interval '15 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
    END IF;
  END IF;
  UPDATE public.coach_interventions
  SET claim_key = p_claim_key, claimed_at = now(), updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'claim_key', p_claim_key);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_intervention(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_intervention(uuid, text) TO authenticated;
