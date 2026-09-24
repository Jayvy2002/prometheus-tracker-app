-- Mensurations (Vision §14.4, §13).
--
-- Tours (cm) par site, une valeur par site et par jour. Tendances séparées par
-- site, aucun score esthétique, aucune analyse d'image. Données de l'athlète :
-- il les écrit et les corrige ; son Coach actif les lit.

CREATE TABLE IF NOT EXISTS public.body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at date NOT NULL,
  site text NOT NULL CHECK (site IN (
    'neck', 'shoulders', 'chest', 'waist', 'hips',
    'arm_left', 'arm_right', 'forearm', 'thigh_left', 'thigh_right', 'calf'
  )),
  value_cm numeric NOT NULL CHECK (value_cm BETWEEN 10 AND 300),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, measured_at, site)
);
CREATE INDEX IF NOT EXISTS body_measurements_user_idx
  ON public.body_measurements (user_id, site, measured_at DESC);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athlete reads own measurements" ON public.body_measurements;
CREATE POLICY "Athlete reads own measurements" ON public.body_measurements
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Active coach reads client measurements" ON public.body_measurements;
CREATE POLICY "Active coach reads client measurements" ON public.body_measurements
  FOR SELECT TO authenticated USING (public.is_coach_of(user_id));
DROP POLICY IF EXISTS "Athlete writes own measurements" ON public.body_measurements;
CREATE POLICY "Athlete writes own measurements" ON public.body_measurements
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Athlete corrects own measurements" ON public.body_measurements;
CREATE POLICY "Athlete corrects own measurements" ON public.body_measurements
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Athlete deletes own measurements" ON public.body_measurements;
CREATE POLICY "Athlete deletes own measurements" ON public.body_measurements
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.body_measurements FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.body_measurements TO authenticated;
GRANT ALL ON TABLE public.body_measurements TO service_role;
