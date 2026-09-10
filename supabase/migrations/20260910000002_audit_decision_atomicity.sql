-- Audit lot 2 : D01 (sauvegarde programme atomique), D02/I05 (décision unique +
-- snapshot serveur), C02 (messagerie : idempotence, pagination, non-lus).
--
-- D01 — setProgramDayExercises supprimait puis insérait (fallback dégradant
-- silencieux, erreurs ignorées). Ces RPC valident TOUT avant de muter, en une
-- seule transaction, et touchent updated_at pour invalider les caches.
--
-- D02 — deux onglets pouvaient appliquer les effets avant que resolve ne
-- découvre le conflit. Claim atomique (une seule validation gagne) + release
-- en cas d'échec des effets + finalize qui fige la décision.
--
-- I05 — finalize fige applied_values depuis les cibles réellement persistées ;
-- le trigger de leçons apprend de ces valeurs, pas du payload proposé.
--
-- C02 — client_msg_id (idempotence retry), fetch_thread_messages (pagination par
-- conversation), count_unread_messages (compteurs serveur).

-- ================= D01 : sauvegarde programme atomique =================

CREATE OR REPLACE FUNCTION public.save_program_day_exercises(
  p_day_id uuid,
  p_exercises jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_program_id uuid;
  v_ex jsonb;
  v_name text;
  v_sets int;
  v_reps int;
  v_rest int;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_day_id IS NULL OR p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_exercises) > 100 THEN
    RAISE EXCEPTION 'Too many exercises';
  END IF;
  SELECT d.program_id INTO v_program_id
  FROM public.program_days d WHERE d.id = p_day_id;
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Day not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = v_program_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;

  -- Validation complète AVANT toute mutation (jamais de journée perdue).
  FOR v_ex IN SELECT * FROM jsonb_array_elements(p_exercises) LOOP
    v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Exercise name required';
    END IF;
    BEGIN
      v_sets := COALESCE((v_ex->>'default_sets')::int, 0);
      v_reps := COALESCE((v_ex->>'default_reps')::int, 0);
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

  DELETE FROM public.program_day_exercises WHERE program_day_id = p_day_id;

  FOR v_ex IN SELECT * FROM jsonb_array_elements(p_exercises) LOOP
    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
    ) VALUES (
      p_day_id,
      btrim(v_ex->>'name'),
      (v_ex->>'default_sets')::int,
      (v_ex->>'default_reps')::int,
      NULLIF(v_ex->>'default_reps_min', '')::int,
      NULLIF(v_ex->>'default_rir', '')::int,
      COALESCE((v_ex->>'default_rest_seconds')::int, 90),
      NULLIF(v_ex->>'default_weight_kg', '')::numeric,
      COALESCE((v_ex->>'order_index')::int, v_count)
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.programs SET updated_at = now() WHERE id = v_program_id;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_program_day_exercises(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_program_day_exercises(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_program_days(
  p_program_id uuid,
  p_days jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day jsonb;
  v_ex jsonb;
  v_weekday int;
  v_name text;
  v_day_id uuid;
  v_used uuid[] := '{}';
  v_order int := 0;
  v_ex_count int;
  v_day_total int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_program_id IS NULL OR p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;
  IF jsonb_array_length(p_days) > 14 THEN
    RAISE EXCEPTION 'Too many days';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = p_program_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not program owner';
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
    IF v_day->'exercises' IS NULL OR jsonb_typeof(v_day->'exercises') <> 'array' THEN
      RAISE EXCEPTION 'Invalid exercises for day %', v_weekday;
    END IF;
    IF jsonb_array_length(v_day->'exercises') > 100 THEN
      RAISE EXCEPTION 'Too many exercises';
    END IF;
    FOR v_ex IN SELECT * FROM jsonb_array_elements(v_day->'exercises') LOOP
      v_name := NULLIF(btrim(COALESCE(v_ex->>'name', '')), '');
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'Exercise name required';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    v_weekday := (v_day->>'weekday')::int;
    SELECT d.id INTO v_day_id
    FROM public.program_days d
    WHERE d.program_id = p_program_id
      AND d.weekday = v_weekday
      AND NOT (d.id = ANY (v_used))
    LIMIT 1;
    IF v_day_id IS NULL THEN
      INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
      VALUES (p_program_id, v_weekday, COALESCE(v_day->>'name', ''), NULL, v_order)
      RETURNING id INTO v_day_id;
    ELSE
      UPDATE public.program_days
      SET name = COALESCE(v_day->>'name', name), weekday = v_weekday, order_index = v_order
      WHERE id = v_day_id;
    END IF;
    v_used := v_used || v_day_id;
    v_order := v_order + 1;

    DELETE FROM public.program_day_exercises WHERE program_day_id = v_day_id;
    v_ex_count := 0;
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
    v_day_total := v_day_total + 1;
  END LOOP;

  DELETE FROM public.program_days d
  WHERE d.program_id = p_program_id AND NOT (d.id = ANY (v_used));

  UPDATE public.programs SET updated_at = now() WHERE id = p_program_id;
  RETURN v_day_total;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_program_days(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_program_days(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_program_with_days(
  p_name text,
  p_description text,
  p_duration_weeks int,
  p_days jsonb
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
  v_weekday int;
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
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array'
     OR jsonb_array_length(p_days) = 0
     OR jsonb_array_length(p_days) > 14 THEN
    RAISE EXCEPTION 'Invalid days';
  END IF;
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    BEGIN
      v_weekday := (v_day->>'weekday')::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid weekday';
    END;
    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'Invalid weekday';
    END IF;
  END LOOP;

  INSERT INTO public.programs (owner_id, name, description, duration_weeks)
  VALUES (v_uid, btrim(p_name), COALESCE(p_description, ''), p_duration_weeks)
  RETURNING id INTO v_program_id;

  -- Les jours sont créés SANS exercices ; l'appelant enchaîne avec
  -- sync_program_days (ou save_program_day_exercises) dans le même flux.
  INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
  SELECT v_program_id,
         (value->>'weekday')::int,
         COALESCE(value->>'name', ''),
         NULL,
         ordinality - 1
  FROM jsonb_array_elements(p_days) WITH ORDINALITY;

  RETURN v_program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_program_with_days(text, text, int, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_program_with_days(text, text, int, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_program_day_exercises(uuid, jsonb) IS
  'D01 : remplace les exercices d''un jour (validate-all puis delete+insert atomiques).';
COMMENT ON FUNCTION public.sync_program_days(uuid, jsonb) IS
  'D01 : réconcilie jours + exercices d''un programme en une transaction.';
COMMENT ON FUNCTION public.create_program_with_days(text, text, int, jsonb) IS
  'D01 : crée un programme et ses jours (sans exercices) en une transaction.';

-- ================= D02/I05 : décision unique + snapshot =================

ALTER TABLE public.coach_interventions
  ADD COLUMN IF NOT EXISTS claim_key text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_values jsonb;

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
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_intervention(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_intervention(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_intervention_claim(
  p_id uuid,
  p_claim_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.coach_interventions
  SET claim_key = NULL, claimed_at = NULL, updated_at = now()
  WHERE id = p_id
    AND coach_id = auth.uid()
    AND status = 'pending'
    AND claim_key = p_claim_key;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.release_intervention_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_intervention_claim(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_intervention(
  p_id uuid,
  p_claim_key text,
  p_status text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.coach_interventions%ROWTYPE;
  v_applied jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_status NOT IN ('sent', 'dismissed', 'kept') THEN
    RAISE EXCEPTION 'Invalid status';
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
    RETURN jsonb_build_object('ok', false, 'reason', 'already_resolved');
  END IF;
  IF v_row.claim_key IS DISTINCT FROM p_claim_key THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_mismatch');
  END IF;

  -- I05 : l'historique conserve les valeurs RÉELLEMENT persistées, pas le brouillon.
  IF v_row.kind = 'calorie_adjustment' AND v_row.client_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'calories', p.daily_calorie_target,
      'protein', p.protein_target,
      'carbs', p.carbs_target,
      'fat', p.fat_target,
      'snapshot_at', now()
    )
    INTO v_applied
    FROM public.user_profiles p
    WHERE p.id = v_row.client_id;
  END IF;

  UPDATE public.coach_interventions
  SET status = p_status,
      payload = COALESCE(p_payload, payload),
      applied_values = COALESCE(v_applied, applied_values),
      claim_key = NULL,
      claimed_at = NULL,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'applied', v_applied);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_intervention(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_intervention(uuid, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.claim_intervention(uuid, text) IS
  'D02 : verrouille un brouillon pending pour ce post (une seule validation gagne). Expiration 15 min.';
COMMENT ON FUNCTION public.finalize_intervention(uuid, text, text, jsonb) IS
  'D02/I05 : fige la décision (claim vérifié) + snapshot serveur des cibles appliquées.';

-- I05 : la mémoire du coach apprend des valeurs appliquées (snapshot), pas du brouillon.
CREATE OR REPLACE FUNCTION public.record_coach_agent_lesson_from_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposed jsonb;
  v_accepted_payload jsonb;
  v_accepted jsonb;
BEGIN
  IF NEW.status NOT IN ('sent', 'kept') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  v_proposed := public.coach_agent_payload_fingerprint(
    COALESCE(OLD.payload->'agent_proposed', OLD.payload)
  );
  v_accepted_payload := NEW.payload;
  IF NEW.applied_values ? 'calories' THEN
    v_accepted_payload := v_accepted_payload || jsonb_build_object(
      'calories', NEW.applied_values->'calories',
      'protein', NEW.applied_values->'protein',
      'carbs', NEW.applied_values->'carbs',
      'fat', NEW.applied_values->'fat'
    );
  END IF;
  v_accepted := public.coach_agent_payload_fingerprint(v_accepted_payload);

  IF v_proposed = '{}'::jsonb AND v_accepted = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF v_proposed IS NOT DISTINCT FROM v_accepted THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.coach_agent_lessons (
    coach_id, kind, proposed, accepted, intervention_id
  ) VALUES (
    NEW.coach_id,
    NEW.kind,
    v_proposed,
    v_accepted,
    NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'record_coach_agent_lesson_from_send: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- I05 : leçons inspectables, corrigeables, désactivables.
ALTER TABLE public.coach_agent_lessons
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Coaches update own agent lessons" ON public.coach_agent_lessons;
CREATE POLICY "Coaches update own agent lessons"
  ON public.coach_agent_lessons FOR UPDATE TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (coach_id = (select auth.uid()));

DROP POLICY IF EXISTS "Coaches delete own agent lessons" ON public.coach_agent_lessons;
CREATE POLICY "Coaches delete own agent lessons"
  ON public.coach_agent_lessons FOR DELETE TO authenticated
  USING (coach_id = (select auth.uid()));

GRANT UPDATE, DELETE ON TABLE public.coach_agent_lessons TO authenticated;

-- ================= C02 : messagerie fiable =================

ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS client_msg_id text;

CREATE UNIQUE INDEX IF NOT EXISTS coach_messages_sender_client_msg_uidx
  ON public.coach_messages (sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fetch_thread_messages(
  p_client_id uuid,
  p_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS SETOF public.coach_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'Client required';
  END IF;
  IF p_client_id <> v_uid AND NOT public.is_coach_of(p_client_id) THEN
    -- Le coach ne relit que ses suivis actifs ; le client son propre fil.
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_messages m
      WHERE m.coach_id = v_uid AND m.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this thread';
    END IF;
  END IF;
  RETURN QUERY
  SELECT m.*
  FROM public.coach_messages m
  WHERE m.client_id = p_client_id
    AND (p_before IS NULL OR m.created_at < p_before)
    AND (
      m.client_id = v_uid
      OR m.coach_id = v_uid
    )
  ORDER BY m.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_thread_messages(uuid, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_thread_messages(uuid, timestamptz, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_unread_messages()
RETURNS TABLE (client_id uuid, unread_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
  SELECT m.client_id, COUNT(*)::bigint
  FROM public.coach_messages m
  WHERE m.read_at IS NULL
    AND m.sender_id <> v_uid
    AND (m.coach_id = v_uid OR m.client_id = v_uid)
  GROUP BY m.client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.count_unread_messages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_unread_messages() TO authenticated;

COMMENT ON FUNCTION public.fetch_thread_messages(uuid, timestamptz, int) IS
  'C02 : pagination par conversation (curseur created_at), autorisée aux deux parties.';
COMMENT ON FUNCTION public.count_unread_messages() IS
  'C02 : non-lus calculés serveur, par conversation.';
