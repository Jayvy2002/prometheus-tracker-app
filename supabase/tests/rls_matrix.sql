-- Q06 — Matrice RLS (2 coachs, 2 clients, 1 solo) + RPC SECURITY DEFINER + D01.
-- Self-contained : aucune variable psql (\set). À jouer en STAGING / `supabase start`
-- en postgres / service_role pour le setup, jamais contre des données réelles.
-- Chaque check écrit dans rls_results ; le script échoue à la fin s'il reste un FAIL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS rls_results;
CREATE TABLE rls_results (
  check_id text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(p_id text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO rls_results(check_id, passed, detail)
  VALUES (p_id, p_ok, p_detail)
  ON CONFLICT (check_id) DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    false
  );
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.clear_user()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', false);
  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('request.jwt.claim.role', '', false);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_user(p_id uuid, p_email text, p_name text, p_coaching text)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_id) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      p_id,
      'authenticated',
      'authenticated',
      p_email,
      crypt('rls-matrix-password', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_name),
      false,
      false
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = p_id AND provider = 'email'
  ) THEN
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      p_id::text,
      p_id,
      jsonb_build_object('sub', p_id::text, 'email', p_email),
      'email',
      now(), now(), now()
    );
  END IF;

  INSERT INTO public.user_profiles (
    id, email, full_name, kinesiology_intake,
    notification_workout_enabled, notification_workout_time,
    notification_nutrition_enabled, notification_nutrition_time
  )
  VALUES (
    p_id, p_email, p_name, '{}'::jsonb,
    false, '08:00', false, '12:00'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role, coaching_role)
  VALUES (p_id, 'free', p_coaching)
  ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
END;
$$;

DO $$
DECLARE
  v_coach_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_coach_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_client_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_client_b1 uuid := '00000000-0000-0000-0000-0000000000c2';
  v_solo uuid := '00000000-0000-0000-0000-00000000000d';
  v_ids uuid[] := ARRAY[
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    '00000000-0000-0000-0000-0000000000b1'::uuid,
    '00000000-0000-0000-0000-0000000000c1'::uuid,
    '00000000-0000-0000-0000-0000000000c2'::uuid,
    '00000000-0000-0000-0000-00000000000d'::uuid
  ];
BEGIN
  DELETE FROM public.coach_interventions WHERE coach_id = ANY (v_ids) OR client_id = ANY (v_ids);
  DELETE FROM public.coach_notes WHERE coach_id = ANY (v_ids) OR client_id = ANY (v_ids);
  DELETE FROM public.program_assignments WHERE client_id = ANY (v_ids) OR assigned_by = ANY (v_ids);
  DELETE FROM public.program_day_exercises
    WHERE program_day_id IN (
      SELECT d.id FROM public.program_days d
      JOIN public.programs p ON p.id = d.program_id
      WHERE p.owner_id = ANY (v_ids)
    );
  DELETE FROM public.program_days WHERE program_id IN (SELECT id FROM public.programs WHERE owner_id = ANY (v_ids));
  DELETE FROM public.programs WHERE owner_id = ANY (v_ids);
  DELETE FROM public.coach_client_links WHERE coach_id = ANY (v_ids) OR client_id = ANY (v_ids);
  DELETE FROM auth.users WHERE id = ANY (v_ids);

  PERFORM pg_temp.seed_user(v_coach_a, 'coach.a@rls-matrix.test', 'Coach A', 'coach');
  PERFORM pg_temp.seed_user(v_coach_b, 'coach.b@rls-matrix.test', 'Coach B', 'coach');
  PERFORM pg_temp.seed_user(v_client_a1, 'client.a1@rls-matrix.test', 'Client A1', 'client');
  PERFORM pg_temp.seed_user(v_client_b1, 'client.b1@rls-matrix.test', 'Client B1', 'client');
  PERFORM pg_temp.seed_user(v_solo, 'solo.s@rls-matrix.test', 'Solo S', 'none');

  INSERT INTO public.coach_client_links (coach_id, client_id, status)
  VALUES (v_coach_a, v_client_a1, 'active'), (v_coach_b, v_client_b1, 'active');

  INSERT INTO public.programs (owner_id, name, description, duration_weeks)
  VALUES
    (v_coach_a, 'P_A rls-matrix', '', 8),
    (v_coach_b, 'P_B rls-matrix', '', 8),
    (v_solo, 'P_S rls-matrix', '', 8);

  INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
  SELECT id, v_client_b1, v_coach_b, CURRENT_DATE, 'active'
  FROM public.programs WHERE owner_id = v_coach_b AND name = 'P_B rls-matrix';

  INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
  SELECT id, v_solo, v_solo, CURRENT_DATE, 'active'
  FROM public.programs WHERE owner_id = v_solo AND name = 'P_S rls-matrix';

  INSERT INTO public.coach_notes (coach_id, client_id, body)
  VALUES (v_coach_a, v_client_a1, 'note A private');

  INSERT INTO public.coach_interventions (coach_id, client_id, kind, title, rationale, payload, status, source)
  VALUES (v_coach_a, v_client_a1, 'calorie_adjustment', 'rls-matrix', 'test', '{}'::jsonb, 'pending', 'agent');

  PERFORM pg_temp.record('SETUP', true, 'actors + links + programs');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.record('SETUP', false, SQLERRM);
  RAISE;
END $$;

-- S02 : A1 ne s'auto-attribue pas P_B et ne lit pas le programme de B.
DO $$
DECLARE
  v_pb uuid;
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_ok boolean := true;
  v_detail text := 'ok';
BEGIN
  SELECT id INTO v_pb FROM public.programs WHERE owner_id = v_b LIMIT 1;
  IF v_pb IS NULL THEN
    PERFORM pg_temp.record('S02', false, 'SETUP: P_B missing');
    RETURN;
  END IF;
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
    VALUES (v_pb, v_a1, v_a1, CURRENT_DATE, 'active');
    v_ok := false;
    v_detail := 'cross-program self-assign accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%self-assign accepted%' THEN RAISE; END IF;
  END;
  IF v_ok AND EXISTS (SELECT 1 FROM public.programs WHERE id = v_pb) THEN
    v_ok := false;
    v_detail := 'foreign program readable';
  END IF;
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('S02', v_ok, v_detail);
END $$;

-- S02 bis : A assigne P_A à A1 via assign_program_secure.
DO $$
DECLARE
  v_pa uuid;
  v_out uuid;
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
BEGIN
  SELECT id INTO v_pa FROM public.programs WHERE owner_id = v_a LIMIT 1;
  PERFORM pg_temp.as_user(v_a);
  SET LOCAL ROLE authenticated;
  SELECT public.assign_program_secure(v_pa, v_a1, CURRENT_DATE) INTO v_out;
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  IF v_out IS NULL THEN
    PERFORM pg_temp.record('S02_assign', false, 'legit coach assign rejected');
  ELSE
    PERFORM pg_temp.record('S02_assign', true, v_out::text);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('S02_assign', false, SQLERRM);
END $$;

-- S03 : A1 ne lit aucune ligne du profil de A.
DO $$
DECLARE
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
BEGIN
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = v_a) THEN
    RESET ROLE;
    PERFORM pg_temp.clear_user();
    PERFORM pg_temp.record('S03', false, 'full coach row readable');
    RETURN;
  END IF;
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('S03', true, 'coach row hidden');
END $$;

-- S03 bis : carte coach via RPC uniquement.
DO $$
DECLARE
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_s uuid := '00000000-0000-0000-0000-00000000000d';
  v_id uuid;
BEGIN
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  SELECT coach_id INTO v_id FROM public.get_my_coach_card();
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  IF v_id IS DISTINCT FROM v_a THEN
    PERFORM pg_temp.record('S03_card', false, 'expected coach A, got ' || coalesce(v_id::text, 'null'));
    RETURN;
  END IF;
  PERFORM pg_temp.as_user(v_s);
  SET LOCAL ROLE authenticated;
  SELECT coach_id INTO v_id FROM public.get_my_coach_card();
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  IF v_id IS NOT NULL THEN
    PERFORM pg_temp.record('S03_card_solo', false, 'solo saw a coach card');
  ELSE
    PERFORM pg_temp.record('S03_card', true, 'A1 sees A ; solo empty');
  END IF;
END $$;

-- S04 : S ne peut ni usurper created_by ni insérer vérifié.
DO $$
DECLARE
  v_s uuid := '00000000-0000-0000-0000-00000000000d';
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ok boolean := true;
BEGIN
  PERFORM pg_temp.as_user(v_s);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.exercises (name, category, equipment, difficulty, verified, created_by)
    VALUES ('rls-matrix-fake', 'strength', 'none', 'beginner', true, v_a);
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('S04', v_ok, CASE WHEN v_ok THEN 'verified insert rejected' ELSE 'verified insert accepted' END);
END $$;

-- C04 : B ne voit ni la bibliothèque ni les notes de A, mais voit B1.
DO $$
DECLARE
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_b1 uuid := '00000000-0000-0000-0000-0000000000c2';
  v_ok boolean := true;
  v_detail text := 'ok';
BEGIN
  PERFORM pg_temp.as_user(v_b);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.programs WHERE owner_id = v_a) THEN
    v_ok := false; v_detail := 'old coach library visible';
  ELSIF EXISTS (SELECT 1 FROM public.coach_notes WHERE coach_id = v_a) THEN
    v_ok := false; v_detail := 'old coach notes visible';
  ELSIF NOT EXISTS (SELECT 1 FROM public.program_assignments WHERE client_id = v_b1) THEN
    v_ok := false; v_detail := 'own client assignments hidden';
  END IF;
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('C04', v_ok, v_detail);
END $$;

-- Client coaché : lit son assignment, ne le supprime pas.
DO $$
DECLARE
  v_asg uuid;
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_ok boolean := true;
BEGIN
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  SELECT id INTO v_asg FROM public.program_assignments
  WHERE client_id = v_a1 AND status = 'active' LIMIT 1;
  IF v_asg IS NULL THEN
    RESET ROLE; PERFORM pg_temp.clear_user();
    PERFORM pg_temp.record('CLIENT_ASSIGN_DEL', false, 'no active assignment for A1');
    RETURN;
  END IF;
  BEGIN
    DELETE FROM public.program_assignments WHERE id = v_asg;
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('CLIENT_ASSIGN_DEL', v_ok, CASE WHEN v_ok THEN 'delete rejected' ELSE 'coached client deleted the assignment' END);
END $$;

-- RPC DEFINER : grants de surface.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.create_program_complete(text,text,int,jsonb,uuid,date)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.apply_intervention(uuid,text,text,text,jsonb,jsonb,text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.assign_program_secure(uuid,uuid,date)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.fork_program(uuid,text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.end_coach_client_link(uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.get_my_coach_card()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public._apply_intervention_effects(uuid,uuid,jsonb,text,jsonb)', 'EXECUTE')
  THEN
    PERFORM pg_temp.record('DEFINER_GRANTS', true, 'public RPCs granted ; helper revoked');
  ELSE
    PERFORM pg_temp.record('DEFINER_GRANTS', false, 'grant/revoke mismatch on DEFINER RPCs');
  END IF;
END $$;

-- A1 ne peut pas assigner P_B via la RPC.
DO $$
DECLARE
  v_pb uuid;
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_ok boolean := true;
BEGIN
  SELECT id INTO v_pb FROM public.programs WHERE owner_id = v_b LIMIT 1;
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.assign_program_secure(v_pb, v_a1, CURRENT_DATE);
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE; PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('RPC_ASSIGN_CROSS', v_ok, CASE WHEN v_ok THEN 'rejected' ELSE 'A1 assigned P_B' END);
END $$;

-- B ne fork pas P_A.
DO $$
DECLARE
  v_pa uuid;
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_ok boolean := true;
BEGIN
  SELECT id INTO v_pa FROM public.programs WHERE owner_id = v_a LIMIT 1;
  PERFORM pg_temp.as_user(v_b);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.fork_program(v_pa, 'stolen');
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE; PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('RPC_FORK_CROSS', v_ok, CASE WHEN v_ok THEN 'rejected' ELSE 'B forked P_A' END);
END $$;

-- A1 ne peut pas apply_intervention sur la carte de A.
DO $$
DECLARE
  v_id uuid;
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ok boolean := true;
BEGIN
  SELECT id INTO v_id FROM public.coach_interventions WHERE coach_id = v_a AND status = 'pending' LIMIT 1;
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.apply_intervention(v_id, 'idem-a1-steal-key', 'claim-a1-steal', 'sent', '{}'::jsonb, '{}'::jsonb, NULL);
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE; PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('RPC_APPLY_CROSS', v_ok, CASE WHEN v_ok THEN 'rejected' ELSE 'A1 applied A intervention' END);
END $$;

-- A1 ne crée pas un programme assigné à B1.
DO $$
DECLARE
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_b1 uuid := '00000000-0000-0000-0000-0000000000c2';
  v_ok boolean := true;
BEGIN
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_program_complete(
      'stolen', '', 8,
      '[{"weekday":1,"name":"A","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
      v_b1, CURRENT_DATE
    );
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE; PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('RPC_CREATE_ASSIGN_CROSS', v_ok, CASE WHEN v_ok THEN 'rejected' ELSE 'A1 assigned B1' END);
END $$;

-- B ne coupe pas le lien A–A1.
DO $$
DECLARE
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_out jsonb;
BEGIN
  PERFORM pg_temp.as_user(v_b);
  SET LOCAL ROLE authenticated;
  v_out := public.end_coach_client_link(v_a1);
  RESET ROLE; PERFORM pg_temp.clear_user();
  IF COALESCE(v_out->>'ok', '') = 'true' THEN
    PERFORM pg_temp.record('RPC_UNLINK_CROSS', false, 'B ended A-A1');
  ELSE
    PERFORM pg_temp.record('RPC_UNLINK_CROSS', true, coalesce(v_out->>'error', 'rejected'));
  END IF;
END $$;

-- A1 ne se unlink pas lui-même.
DO $$
DECLARE
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_out jsonb;
BEGIN
  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  v_out := public.end_coach_client_link(v_a1);
  RESET ROLE; PERFORM pg_temp.clear_user();
  IF COALESCE(v_out->>'ok', '') = 'true' THEN
    PERFORM pg_temp.record('RPC_UNLINK_SELF', false, 'client ended self');
  ELSE
    PERFORM pg_temp.record('RPC_UNLINK_SELF', true, coalesce(v_out->>'error', 'rejected'));
  END IF;
END $$;

-- D01 : une erreur d'exercice ne laisse aucune donnée partielle.
DO $$
DECLARE
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  c_prog int; c_day int; c_ex int; c_asg int;
  n_prog int; n_day int; n_ex int; n_asg int;
  v_failed boolean := false;
BEGIN
  SELECT count(*) INTO c_prog FROM public.programs WHERE owner_id = v_a;
  SELECT count(*) INTO c_day FROM public.program_days d
    JOIN public.programs p ON p.id = d.program_id WHERE p.owner_id = v_a;
  SELECT count(*) INTO c_ex FROM public.program_day_exercises e
    JOIN public.program_days d ON d.id = e.program_day_id
    JOIN public.programs p ON p.id = d.program_id WHERE p.owner_id = v_a;
  SELECT count(*) INTO c_asg FROM public.program_assignments WHERE assigned_by = v_a;

  CREATE OR REPLACE FUNCTION public.rls_matrix_atomic_fail()
  RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN
    IF NEW.name = '__ATOMIC_FAIL__' THEN
      RAISE EXCEPTION 'ATOMIC_FAIL';
    END IF;
    RETURN NEW;
  END;
  $t$;
  DROP TRIGGER IF EXISTS rls_matrix_atomic_fail_trg ON public.program_day_exercises;
  CREATE TRIGGER rls_matrix_atomic_fail_trg
    BEFORE INSERT ON public.program_day_exercises
    FOR EACH ROW EXECUTE FUNCTION public.rls_matrix_atomic_fail();

  PERFORM pg_temp.as_user(v_a);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_program_complete(
      'D01-atomic',
      '',
      8,
      '[{"weekday":1,"name":"A","exercises":[{"name":"Squat","default_sets":3,"default_reps":5},{"name":"__ATOMIC_FAIL__","default_sets":3,"default_reps":5}]}]'::jsonb,
      v_a1,
      CURRENT_DATE
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ATOMIC_FAIL%' THEN
      v_failed := true;
    ELSE
      RESET ROLE; PERFORM pg_temp.clear_user();
      DROP TRIGGER IF EXISTS rls_matrix_atomic_fail_trg ON public.program_day_exercises;
      DROP FUNCTION IF EXISTS public.rls_matrix_atomic_fail();
      PERFORM pg_temp.record('D01_ATOMIC', false, SQLERRM);
      RETURN;
    END IF;
  END;
  RESET ROLE;
  PERFORM pg_temp.clear_user();
  DROP TRIGGER IF EXISTS rls_matrix_atomic_fail_trg ON public.program_day_exercises;
  DROP FUNCTION IF EXISTS public.rls_matrix_atomic_fail();

  SELECT count(*) INTO n_prog FROM public.programs WHERE owner_id = v_a;
  SELECT count(*) INTO n_day FROM public.program_days d
    JOIN public.programs p ON p.id = d.program_id WHERE p.owner_id = v_a;
  SELECT count(*) INTO n_ex FROM public.program_day_exercises e
    JOIN public.program_days d ON d.id = e.program_day_id
    JOIN public.programs p ON p.id = d.program_id WHERE p.owner_id = v_a;
  SELECT count(*) INTO n_asg FROM public.program_assignments WHERE assigned_by = v_a;

  IF v_failed AND n_prog = c_prog AND n_day = c_day AND n_ex = c_ex AND n_asg = c_asg THEN
    PERFORM pg_temp.record('D01_ATOMIC', true, format('no partial rows (prog=%s day=%s ex=%s asg=%s)', n_prog, n_day, n_ex, n_asg));
  ELSE
    PERFORM pg_temp.record('D01_ATOMIC', false, format(
      'failed=%s prog %s→%s day %s→%s ex %s→%s asg %s→%s',
      v_failed, c_prog, n_prog, c_day, n_day, c_ex, n_ex, c_asg, n_asg
    ));
  END IF;
END $$;

-- D01 succès : programme + jour + exercice + assignation.
DO $$
DECLARE
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_id uuid;
  v_days int;
  v_ex int;
  v_asg uuid;
BEGIN
  PERFORM pg_temp.as_user(v_a);
  SET LOCAL ROLE authenticated;
  SELECT public.create_program_complete(
    'D01-complete',
    'ok',
    8,
    '[{"weekday":2,"name":"Upper","exercises":[{"name":"Bench","default_sets":4,"default_reps":8}]}]'::jsonb,
    v_a1,
    CURRENT_DATE
  ) INTO v_id;
  RESET ROLE; PERFORM pg_temp.clear_user();
  SELECT count(*) INTO v_days FROM public.program_days WHERE program_id = v_id;
  SELECT count(*) INTO v_ex FROM public.program_day_exercises e
    JOIN public.program_days d ON d.id = e.program_day_id WHERE d.program_id = v_id;
  SELECT id INTO v_asg FROM public.program_assignments
    WHERE program_id = v_id AND client_id = v_a1 AND status = 'active';
  IF v_id IS NOT NULL AND v_days = 1 AND v_ex = 1 AND v_asg IS NOT NULL THEN
    PERFORM pg_temp.record('D01_COMPLETE', true, v_id::text);
  ELSE
    PERFORM pg_temp.record('D01_COMPLETE', false, format('id=%s days=%s ex=%s asg=%s', v_id, v_days, v_ex, v_asg));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('D01_COMPLETE', false, SQLERRM);
END $$;

-- D02 : apply_intervention exactement une fois (replay de la même clé).
DO $$
DECLARE
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_id uuid;
  v_first jsonb;
  v_second jsonb;
  n1 int; n2 int;
BEGIN
  INSERT INTO public.coach_interventions (coach_id, client_id, kind, title, rationale, payload, status, source)
  VALUES (v_a, v_a1, 'other', 'd02', 'idem', '{}'::jsonb, 'pending', 'agent')
  RETURNING id INTO v_id;

  SELECT count(*) INTO n1 FROM public.coach_notes WHERE coach_id = v_a AND client_id = v_a1 AND body = 'd02-once';

  PERFORM pg_temp.as_user(v_a);
  SET LOCAL ROLE authenticated;
  v_first := public.apply_intervention(
    v_id, 'idem-d02-stable-key', 'claim-d02-stable', 'sent',
    '{}'::jsonb, '{"note":{"body":"d02-once"}}'::jsonb, 'client-msg-d02'
  );
  v_second := public.apply_intervention(
    v_id, 'idem-d02-stable-key', 'claim-d02-stable', 'sent',
    '{}'::jsonb, '{"note":{"body":"d02-once"}}'::jsonb, 'client-msg-d02'
  );
  RESET ROLE; PERFORM pg_temp.clear_user();

  SELECT count(*) INTO n2 FROM public.coach_notes WHERE coach_id = v_a AND client_id = v_a1 AND body = 'd02-once';

  IF COALESCE(v_first->>'ok','') = 'true'
     AND COALESCE(v_first->>'replayed','') = 'false'
     AND COALESCE(v_second->>'ok','') = 'true'
     AND COALESCE(v_second->>'replayed','') = 'true'
     AND n2 = n1 + 1
     AND EXISTS (
       SELECT 1 FROM public.coach_interventions
       WHERE id = v_id AND client_msg_id = 'client-msg-d02' AND idempotency_key = 'idem-d02-stable-key'
     )
  THEN
    PERFORM pg_temp.record('D02_ONCE', true, 'replayed; one note; client_msg_id persisted');
  ELSE
    PERFORM pg_temp.record('D02_ONCE', false, format('first=%s second=%s notes %s→%s', v_first, v_second, n1, n2));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.clear_user();
  PERFORM pg_temp.record('D02_ONCE', false, SQLERRM);
END $$;

-- Unlink : A termine le lien A1 ; le programme pausé reste lisible par l'athlète.
DO $$
DECLARE
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_out jsonb;
  v_visible boolean;
BEGIN
  PERFORM pg_temp.as_user(v_a);
  SET LOCAL ROLE authenticated;
  v_out := public.end_coach_client_link(v_a1);
  RESET ROLE; PERFORM pg_temp.clear_user();
  IF COALESCE(v_out->>'ok','') <> 'true' THEN
    PERFORM pg_temp.record('UNLINK', false, coalesce(v_out::text, 'null'));
    RETURN;
  END IF;

  PERFORM pg_temp.as_user(v_a1);
  SET LOCAL ROLE authenticated;
  SELECT EXISTS (
    SELECT 1 FROM public.programs p
    JOIN public.program_assignments pa ON pa.program_id = p.id
    WHERE pa.client_id = v_a1 AND pa.status = 'paused'
  ) INTO v_visible;
  RESET ROLE; PERFORM pg_temp.clear_user();
  IF v_visible THEN
    PERFORM pg_temp.record('UNLINK', true, 'paused program readable after unlink');
  ELSE
    PERFORM pg_temp.record('UNLINK', false, 'paused program unreadable after unlink');
  END IF;
END $$;

SELECT check_id, passed, detail FROM rls_results ORDER BY check_id;

DO $$
DECLARE
  v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM rls_results WHERE NOT passed;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'rls-matrix: % check(s) failed', v_fail;
  END IF;
END $$;

SELECT 'rls-matrix: all checks passed' AS result;
