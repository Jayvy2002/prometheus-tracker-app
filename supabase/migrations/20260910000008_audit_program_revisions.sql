-- Audit lot 7 (E01, fondation) : révisions immuables des programmes.
--
-- Chaque transaction qui touche jours/exercices fige UN instantané complet par
-- programme (trigger différé : une seule révision par sauvegarde, même si la
-- RPC fait dix écritures). Modifier le plan ne réécrit plus le passé : les
-- prescriptions passées restent consultables et auditables. Combiné au fork
-- I02 (un athlète ≠ les autres), l'acceptation E01 tient :
-- "modifier une semaine future ne change pas les prescriptions passées
--  ni celles d'un autre athlète".
--
-- Écriture trigger/RPC uniquement. Lecture : propriétaire + clients assignés
-- (actif ou en pause) + coach actif du client, comme les programmes eux-mêmes.

CREATE TABLE IF NOT EXISTS public.program_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  revision_no int NOT NULL,
  snapshot jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, revision_no)
);

CREATE INDEX IF NOT EXISTS program_revisions_program_idx
  ON public.program_revisions (program_id, revision_no DESC);

ALTER TABLE public.program_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read program revisions" ON public.program_revisions;
CREATE POLICY "Owners read program revisions" ON public.program_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Assigned clients read program revisions" ON public.program_revisions;
CREATE POLICY "Assigned clients read program revisions" ON public.program_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_revisions.program_id
        AND pa.client_id = (select auth.uid())
        AND pa.status IN ('active', 'paused')
    )
  );

DROP POLICY IF EXISTS "Coaches read client program revisions" ON public.program_revisions;
CREATE POLICY "Coaches read client program revisions" ON public.program_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_assignments pa
      WHERE pa.program_id = program_revisions.program_id
        AND public.is_coach_of(pa.client_id)
    )
  );

GRANT SELECT ON TABLE public.program_revisions TO authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_program_revision(p_program_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no int;
  v_snap jsonb;
BEGIN
  IF p_program_id IS NULL THEN
    RAISE EXCEPTION 'Program required';
  END IF;
  -- Appel direct : seul le propriétaire (le trigger passe par ici avec l'uid d'origine).
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = p_program_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not program owner';
  END IF;

  -- Sérialise les numéros de révision entre transactions concurrentes.
  PERFORM 1 FROM public.programs WHERE id = p_program_id FOR UPDATE;

  SELECT COALESCE(MAX(revision_no), 0) + 1 INTO v_no
  FROM public.program_revisions WHERE program_id = p_program_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'weekday', d.weekday,
    'name', d.name,
    'order_index', d.order_index,
    'exercises', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'default_sets', e.default_sets,
        'default_reps', e.default_reps,
        'default_reps_min', e.default_reps_min,
        'default_rir', e.default_rir,
        'default_rest_seconds', e.default_rest_seconds,
        'default_weight_kg', e.default_weight_kg,
        'order_index', e.order_index
      ) ORDER BY e.order_index)
      FROM public.program_day_exercises e WHERE e.program_day_id = d.id
    ), '[]'::jsonb)
  ) ORDER BY d.order_index), '[]'::jsonb)
  INTO v_snap
  FROM public.program_days d WHERE d.program_id = p_program_id;

  INSERT INTO public.program_revisions (program_id, revision_no, snapshot, created_by)
  VALUES (p_program_id, v_no, v_snap, auth.uid());

  RETURN v_no;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_program_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_program_revision(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.program_revisions IS
  'E01 : instantanés immuables jours+exercices à chaque sauvegarde. Le passé ne se réécrit pas.';

-- NOTE : pas de trigger différé — Postgres exclut les tables de transition sur
-- les triggers différés. Les instantanés sont pris explicitement dans les RPC
-- (voir 20260910000009) : ce sont les seules écrivaines structurelles de l'app.
