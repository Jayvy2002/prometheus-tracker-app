-- Audit P0 (S02/S03/S04) + durcissement search_path.
--
-- S02 — program_assignments : l'INSERT vérifiait l'auteur et la relation mais pas le
-- droit d'utiliser le program_id. Un authentifié connaissant un UUID pouvait s'auto-
-- attribuer un programme privé et le lire via "Assigned clients read programs".
-- Fix : WITH CHECK exigeant la propriété du programme + RPC transactionnelle.
--
-- S03 — "Clients can read their coach profile" ouvrait la ligne user_profiles entière.
-- Fix : RPC get_my_coach_card() (champs pro minimaux) + suppression de la lecture large.
--
-- S04 — INSERT exercises exigeait seulement un uid : created_by et verified libres.
-- Fix : auteur imposé + verified=false + défaut colonne à false + revoke UPDATE/DELETE.

-- ============ S02 : attribution centralisée et verrouillée ============

CREATE OR REPLACE FUNCTION public.assign_program_secure(
  p_program_id uuid,
  p_client_id uuid,
  p_start_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_assignment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_program_id IS NULL OR p_client_id IS NULL OR p_start_date IS NULL THEN
    RAISE EXCEPTION 'Missing assignment fields';
  END IF;
  -- Le programme doit appartenir à l'assigneur (pas de partage implicite).
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = p_program_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;
  -- Autorité : soi-même, ou client actif de ce coach.
  IF p_client_id <> v_uid AND NOT public.is_coach_of(p_client_id) THEN
    RAISE EXCEPTION 'Not authorized for this client';
  END IF;
  -- Un coaché ne s'auto-assigne pas : son coach décide (règle métier serveur).
  IF p_client_id = v_uid AND EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Coached client cannot self-assign';
  END IF;

  -- Pause de l'ancien actif puis insertion, en une seule transaction.
  UPDATE public.program_assignments
  SET status = 'paused', updated_at = now()
  WHERE client_id = p_client_id AND status = 'active';

  INSERT INTO public.program_assignments (program_id, client_id, assigned_by, start_date, status)
  VALUES (p_program_id, p_client_id, v_uid, p_start_date, 'active')
  RETURNING id INTO v_assignment_id;

  RETURN v_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_program_secure(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_program_secure(uuid, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.assign_program_secure(uuid, uuid, date) IS
  'Attribution atomique : propriété du programme + autorité (soi ou client actif) + pause de l''ancien actif. Interdit l''auto-attribution d''un coaché.';

-- Verrouille aussi l'écriture directe : même avec l'UUID d'un programme tiers,
-- l'INSERT/UPDATE direct ne peut plus viser un programme d'un autre propriétaire.
DROP POLICY IF EXISTS "Assigner inserts assignments" ON public.program_assignments;
CREATE POLICY "Assigner inserts assignments" ON public.program_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND (client_id = (select auth.uid()) OR public.is_coach_of(client_id))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Assigner updates assignments" ON public.program_assignments;
CREATE POLICY "Assigner updates assignments" ON public.program_assignments
  FOR UPDATE TO authenticated
  USING (assigned_by = (select auth.uid()))
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND (client_id = (select auth.uid()) OR public.is_coach_of(client_id))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.owner_id = (select auth.uid())
    )
  );

-- ============ S03 : carte coach minimale, fin de la lecture large ============

CREATE OR REPLACE FUNCTION public.get_my_coach_card()
RETURNS TABLE (coach_id uuid, full_name text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
  SELECT p.id, COALESCE(p.full_name, ''), p.avatar_url
  FROM public.coach_client_links l
  JOIN public.user_profiles p ON p.id = l.coach_id
  WHERE l.client_id = auth.uid() AND l.status = 'active'
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_coach_card() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_coach_card() TO authenticated;

COMMENT ON FUNCTION public.get_my_coach_card() IS
  'Carte professionnelle minimale du coach actif (id, nom, avatar). Seule lecture coach autorisée au client.';

DROP POLICY IF EXISTS "Clients can read their coach profile" ON public.user_profiles;

-- ============ S04 : exercices — proposition privée, promotion serveur ============

ALTER TABLE public.exercises ALTER COLUMN verified SET DEFAULT false;

DROP POLICY IF EXISTS "Users can insert exercises" ON public.exercises;
CREATE POLICY "Users can insert exercises" ON public.exercises
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND verified = false
  );

-- Aucune promotion cliente vers le catalogue vérifié.
REVOKE UPDATE, DELETE ON public.exercises FROM authenticated;
GRANT SELECT, INSERT ON public.exercises TO authenticated;

COMMENT ON COLUMN public.exercises.verified IS
  'true = catalogue validé (serveur uniquement via verify-exercise). Les clients créent verified=false avec created_by imposé.';

-- ============ Durcissement : search_path des triggers updated_at ============

CREATE OR REPLACE FUNCTION public.handle_subscription_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_roles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
