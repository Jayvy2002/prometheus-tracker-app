-- Audit lot 5 : C01 (fraîcheur fiche coach), C03 (fermeture compte coach),
-- C04 (archives + adoption), D07 (idempotence file hors ligne).
--
-- C01 — la fiche coach ne voit ni les nouvelles séances ni les check-ins :
-- les tables d'observation rejoignent la publication Realtime (FULL pour que
-- les UPDATE/DELETE portent l'identité du client malgré le RLS).
--
-- C03 — delete-account supprimait le coach en cascade, laissant des clients
-- au rôle 'client' sans coach et sans programme. close_coach_account rejoue
-- la transition métier par client (fork du programme assigné vers l'athlète,
-- puis end_coach_client_link) en UNE transaction : tout ou rien, réessayable.
-- La transition vit dans transition_client_to_solo(), partagée avec
-- end_coach_client_link (zéro duplication).
--
-- C04 — un nouveau coach voit l'historique d'attributions de SON client (pas
-- la bibliothèque de l'ancien coach) et peut adopter (forker) un programme
-- assigné à son client actif.
--
-- D07 — client_op_id sur les tables de séance : les créations rejouées après
-- une coupure ne dupliquent jamais (contrainte UNIQUE partielle).

-- ================= C01 : Realtime des observations =================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workouts', 'workout_exercises', 'workout_sets',
    'nutrition_logs', 'water_logs', 'weight_measurements',
    'daily_checkins', 'daily_steps'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'replica identity full failed for %: %', t, SQLERRM;
    END;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'realtime add failed for %: %', t, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ================= C03 : fermeture compte coach = workflow métier =================

-- Transition partagée (ancien corps de end_coach_client_link, sans le contrôle
-- d'appelant — réservée au rôle serveur et aux RPC qui vérifient l'appelant).
CREATE OR REPLACE FUNCTION public.transition_client_to_solo(
  p_coach_id uuid,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_coach_id IS NULL OR p_client_id IS NULL OR p_coach_id = p_client_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pair');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE coach_id = p_coach_id AND client_id = p_client_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  UPDATE public.program_assignments
  SET status = 'paused', updated_at = now()
  WHERE client_id = p_client_id
    AND assigned_by = p_coach_id
    AND status = 'active';

  UPDATE public.coach_client_links
  SET status = 'ended', updated_at = now()
  WHERE coach_id = p_coach_id
    AND client_id = p_client_id
    AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  UPDATE public.user_roles
  SET coaching_role = 'none', updated_at = now()
  WHERE user_id = p_client_id
    AND coaching_role = 'client';

  DELETE FROM public.client_tracking_config
  WHERE client_id = p_client_id
    AND coach_id = p_coach_id;

  UPDATE public.user_profiles
  SET coach_link_ended_at = now(),
      solo_trial_ends_at = COALESCE(solo_trial_ends_at, now() + interval '30 days'),
      updated_at = now()
  WHERE id = p_client_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_client_to_solo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_client_to_solo(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.end_coach_client_link(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_client_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_end_self');
  END IF;
  RETURN public.transition_client_to_solo(v_uid, p_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.end_coach_client_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_coach_client_link(uuid) TO authenticated;

-- Fermeture d'un compte coach : pour chaque client actif, le programme assigné
-- est forké vers l'athlète (il reste consultable après la suppression), puis
-- la transition solo. Une seule transaction : réessayable sans doublon.
CREATE OR REPLACE FUNCTION public.close_coach_account(p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_asg record;
  v_fork_id uuid;
  v_transitioned int := 0;
  v_forked int := 0;
BEGIN
  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'Coach required';
  END IF;

  FOR v_link IN
    SELECT client_id FROM public.coach_client_links
    WHERE coach_id = p_coach_id AND status = 'active'
  LOOP
    -- Forke chaque programme (actif ou en pause) assigné PAR ce coach vers l'athlète.
    FOR v_asg IN
      SELECT pa.id AS assignment_id, pa.program_id, p.name, p.owner_id
      FROM public.program_assignments pa
      JOIN public.programs p ON p.id = pa.program_id
      WHERE pa.client_id = v_link.client_id
        AND pa.assigned_by = p_coach_id
        AND pa.status IN ('active', 'paused')
    LOOP
      -- Ne forke que les programmes du coach (pas ceux déjà à l'athlète).
      IF v_asg.owner_id = p_coach_id THEN
        INSERT INTO public.programs (owner_id, name, description, duration_weeks)
        SELECT v_link.client_id, p.name, COALESCE(p.description, ''), p.duration_weeks
        FROM public.programs p WHERE p.id = v_asg.program_id
        RETURNING id INTO v_fork_id;

        INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
        SELECT v_fork_id, weekday, name, routine_id, order_index
        FROM public.program_days WHERE program_id = v_asg.program_id;

        INSERT INTO public.program_day_exercises (
          program_day_id, name, default_sets, default_reps, default_reps_min,
          default_rir, default_rest_seconds, default_weight_kg, order_index
        )
        SELECT nd.id, e.name, e.default_sets, e.default_reps, e.default_reps_min,
          e.default_rir, e.default_rest_seconds, e.default_weight_kg, e.order_index
        FROM public.program_days od
        JOIN public.program_days nd
          ON nd.program_id = v_fork_id
          AND nd.weekday = od.weekday
          AND nd.order_index = od.order_index
        JOIN public.program_day_exercises e ON e.program_day_id = od.id
        WHERE od.program_id = v_asg.program_id;

        UPDATE public.program_assignments
        SET program_id = v_fork_id, assigned_by = v_link.client_id, status = 'paused', updated_at = now()
        WHERE id = v_asg.assignment_id;

        v_forked := v_forked + 1;
      END IF;
    END LOOP;

    PERFORM public.transition_client_to_solo(p_coach_id, v_link.client_id);
    v_transitioned := v_transitioned + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'transitioned', v_transitioned, 'forked', v_forked);
END;
$$;

REVOKE ALL ON FUNCTION public.close_coach_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_coach_account(uuid) TO service_role;

COMMENT ON FUNCTION public.close_coach_account(uuid) IS
  'C03 : fermeture compte coach — fork des programmes vers chaque athlète puis transition solo, en une transaction. Appelée par delete-account (service_role) avant suppression Auth.';

-- ================= C04 : historique visible + adoption =================

DROP POLICY IF EXISTS "Coaches read client assignment history" ON public.program_assignments;
CREATE POLICY "Coaches read client assignment history" ON public.program_assignments
  FOR SELECT TO authenticated
  USING (public.is_coach_of(client_id));

DROP POLICY IF EXISTS "Coaches read assigned programs" ON public.programs;
CREATE POLICY "Coaches read assigned programs" ON public.programs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = programs.id
        AND public.is_coach_of(pa.client_id)
    )
  );

DROP POLICY IF EXISTS "Coaches read assigned program days" ON public.program_days;
CREATE POLICY "Coaches read assigned program days" ON public.program_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_days.program_id
        AND public.is_coach_of(pa.client_id)
    )
  );

DROP POLICY IF EXISTS "Coaches read assigned program day exercises" ON public.program_day_exercises;
CREATE POLICY "Coaches read assigned program day exercises" ON public.program_day_exercises
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_days d
      JOIN public.program_assignments pa ON pa.program_id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id
        AND public.is_coach_of(pa.client_id)
    )
  );

-- Adoption explicite : le coach actif fork dans SA bibliothèque un programme
-- assigné à son client (reçu d'un ancien coach ou créé par l'athlète).
CREATE OR REPLACE FUNCTION public.adopt_client_program(
  p_program_id uuid,
  p_client_id uuid,
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fork_id uuid;
  v_day record;
  v_new_day_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_coach_of(p_client_id) THEN
    RAISE EXCEPTION 'Not your client';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    JOIN public.program_assignments pa ON pa.program_id = p.id
    WHERE p.id = p_program_id
      AND pa.client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Program not assigned to this client';
  END IF;

  INSERT INTO public.programs (owner_id, name, description, duration_weeks)
  SELECT v_uid, COALESCE(NULLIF(btrim(p_name), ''), p.name || ' (repris)'),
    COALESCE(p.description, ''), p.duration_weeks
  FROM public.programs p WHERE p.id = p_program_id
  RETURNING id INTO v_fork_id;

  FOR v_day IN
    SELECT * FROM public.program_days
    WHERE program_id = p_program_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.program_days (program_id, weekday, name, routine_id, order_index)
    VALUES (v_fork_id, v_day.weekday, v_day.name, v_day.routine_id, v_day.order_index)
    RETURNING id INTO v_new_day_id;

    INSERT INTO public.program_day_exercises (
      program_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
    )
    SELECT v_new_day_id, name, default_sets, default_reps, default_reps_min,
      default_rir, default_rest_seconds, default_weight_kg, order_index
    FROM public.program_day_exercises
    WHERE program_day_id = v_day.id
    ORDER BY order_index;
  END LOOP;

  RETURN v_fork_id;
END;
$$;

REVOKE ALL ON FUNCTION public.adopt_client_program(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adopt_client_program(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.adopt_client_program(uuid, uuid, text) IS
  'C04 : fork explicite vers la bibliothèque du coach actif, depuis un programme assigné à son client.';

-- ================= D07 : idempotence des créations rejouées =================

ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS client_op_id text;
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS client_op_id text;
ALTER TABLE public.workout_sets ADD COLUMN IF NOT EXISTS client_op_id text;

CREATE UNIQUE INDEX IF NOT EXISTS workouts_client_op_uidx ON public.workouts (client_op_id) WHERE client_op_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workout_exercises_client_op_uidx ON public.workout_exercises (client_op_id) WHERE client_op_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workout_sets_client_op_uidx ON public.workout_sets (client_op_id) WHERE client_op_id IS NOT NULL;

COMMENT ON COLUMN public.workouts.client_op_id IS
  'D07 : identifiant client stable — rejouer une création après coupure ne duplique jamais.';
