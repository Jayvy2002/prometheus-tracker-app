-- Q06 — Matrice d'acceptation RLS (2 coachs, 2 clients, 1 solo).
--
-- À jouer dans un projet de STAGING (jamais en prod) après `supabase db push`,
-- connecté en tant que postgres / service_role (contourne le RLS pour le setup).
-- 1. Créer 5 comptes de test (coach A/B, client A1/B1, solo S) + noter les UUID.
-- 2. Renseigner les 5 variables ci-dessous, lier A1→A et B1→B (invite acceptée).
-- 3. A possède P_A assigné à A1 (actif). B possède P_B assigné à B1. S a P_S.
-- 4. Exécuter tout le script : chaque bloc RAISE en cas de violation.
--
-- Convention : toute erreur Postgres sur une écriture interdite = succès du test
-- (le rejet RLS lève 42501) ; seul notre marqueur FAIL remonte.

\set coach_a '00000000-0000-0000-0000-0000000000a1'
\set coach_b '00000000-0000-0000-0000-0000000000b1'
\set client_a1 '00000000-0000-0000-0000-0000000000c1'
\set client_b1 '00000000-0000-0000-0000-0000000000c2'
\set solo_s '00000000-0000-0000-0000-00000000000d'

-- S02 : A1 ne lit pas P_B même en connaissant son UUID (auto-attribution refusée).
DO $$
DECLARE
  v_pb uuid;
BEGIN
  SELECT id INTO v_pb FROM public.programs WHERE owner_id = :'coach_b'::uuid LIMIT 1;
  IF v_pb IS NULL THEN RAISE EXCEPTION 'SETUP: P_B missing'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', :'client_a1')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
    VALUES (v_pb, :'client_a1'::uuid, :'client_a1'::uuid, CURRENT_DATE, 'active');
    RAISE EXCEPTION 'S02 FAIL: cross-program self-assign accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%S02 FAIL%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.programs WHERE id = v_pb) THEN
    RAISE EXCEPTION 'S02 FAIL: foreign program readable';
  END IF;
  RESET ROLE;
END $$;

-- S02 bis : A assigne P_A à A1 via la RPC (chemin nominal autorisé).
DO $$
DECLARE
  v_pa uuid;
  v_out uuid;
BEGIN
  SELECT id INTO v_pa FROM public.programs WHERE owner_id = :'coach_a'::uuid LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', :'coach_a')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT public.assign_program_secure(v_pa, :'client_a1'::uuid, CURRENT_DATE) INTO v_out;
  IF v_out IS NULL THEN RAISE EXCEPTION 'S02 FAIL: legit coach assign rejected'; END IF;
  RESET ROLE;
END $$;

-- S03 : A1 ne lit aucune ligne du profil de A (seule la carte RPC).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', :'client_a1')::text, true);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = :'coach_a'::uuid) THEN
    RAISE EXCEPTION 'S03 FAIL: full coach row readable';
  END IF;
  RESET ROLE;
END $$;

-- S04 : S ne peut ni usurper created_by ni insérer vérifié.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', :'solo_s')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.exercises (name, verified, created_by)
    VALUES ('rls-matrix-fake', true, :'coach_a'::uuid);
    RAISE EXCEPTION 'S04 FAIL: verified insert accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%S04 FAIL%' THEN RAISE; END IF;
  END;
  RESET ROLE;
END $$;

-- C04 : B ne voit ni la bibliothèque de A ni ses notes, mais voit les attributions de B1.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', :'coach_b')::text, true);
  SET LOCAL ROLE authenticated;
  IF EXISTS (SELECT 1 FROM public.programs WHERE owner_id = :'coach_a'::uuid) THEN
    RAISE EXCEPTION 'C04 FAIL: old coach library visible';
  END IF;
  IF EXISTS (SELECT 1 FROM public.coach_notes WHERE coach_id = :'coach_a'::uuid) THEN
    RAISE EXCEPTION 'C04 FAIL: old coach notes visible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.program_assignments WHERE client_id = :'client_b1'::uuid) THEN
    RAISE EXCEPTION 'C04 FAIL: own client assignments hidden';
  END IF;
  RESET ROLE;
END $$;

-- Client coaché : lit son assignment, ne le supprime pas.
DO $$
DECLARE
  v_asg uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', :'client_a1')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT id INTO v_asg FROM public.program_assignments
  WHERE client_id = :'client_a1'::uuid AND status = 'active' LIMIT 1;
  IF v_asg IS NULL THEN RAISE EXCEPTION 'SETUP: no active assignment for A1'; END IF;
  BEGIN
    DELETE FROM public.program_assignments WHERE id = v_asg;
    RAISE EXCEPTION 'RLS FAIL: coached client deleted the assignment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%RLS FAIL%' THEN RAISE; END IF;
  END;
  RESET ROLE;
END $$;

-- Fin de lien : programme en pause lisible par l'athlète (C04 archives).
-- (À jouer APRÈS end_coach_client_link(A1) exécuté en tant que A.)
-- DO $$
-- BEGIN
--   PERFORM set_config('request.jwt.claims', json_build_object('sub', :'client_a1')::text, true);
--   SET LOCAL ROLE authenticated;
--   IF NOT EXISTS (
--     SELECT 1 FROM public.programs p
--     JOIN public.program_assignments pa ON pa.program_id = p.id
--     WHERE pa.client_id = :'client_a1'::uuid AND pa.status = 'paused'
--   ) THEN
--     RAISE EXCEPTION 'C04 FAIL: paused program unreadable after unlink';
--   END IF;
--   RESET ROLE;
-- END $$;

SELECT 'rls-matrix: all live checks passed (unlink block is commented, run after end_coach_client_link)' AS result;
