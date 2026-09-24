-- Check-ins : constructeur, fréquence, habitudes expliquées (Vision §10–11).
--
-- Le check-in existant (daily_checkins et ses champs essentiels : sommeil,
-- énergie, stress, faim, douleur…) reste le socle lu par l'IA et les alertes.
-- Cette migration ajoute, sans moteur parallèle :
--  - checkin_templates : modèles réutilisables de questions personnalisées
--    (échelle, oui/non, choix, numérique, texte, douleur, fatigue ; questions
--    conditionnelles ; « pourquoi » montré à l'athlète). Propriétaire : le
--    Coach, ou le Solo pour son propre modèle.
--  - checkin_plans : pour chaque athlète, modèle + fréquence (quotidien,
--    hebdomadaire, toutes les deux semaines, mensuel) + raisons des habitudes
--    suivies. Le Coach actif décide ; sans Coach, l'athlète décide.
--    checkin_plan_events garde l'historique des changements.
--  - daily_checkins.custom_answers : réponses avec le libellé du moment
--    (modifier un modèle ne réécrit jamais une réponse passée).

-- ─── Templates ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.checkin_questions_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p) = 'array'
     AND jsonb_array_length(p) <= 20
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p) q
        WHERE jsonb_typeof(q) <> 'object'
           OR length(COALESCE(q->>'id', '')) NOT BETWEEN 1 AND 40
           OR COALESCE(q->>'type', '') NOT IN ('scale', 'yes_no', 'choice', 'number', 'text', 'pain', 'fatigue')
           OR length(btrim(COALESCE(q->'label'->>'fr', ''))) NOT BETWEEN 1 AND 200
           OR length(COALESCE(q->'label'->>'en', '')) > 200
           OR length(COALESCE(q->'why'->>'fr', '')) > 200
           OR length(COALESCE(q->'why'->>'en', '')) > 200
     );
$$;

CREATE TABLE IF NOT EXISTS public.checkin_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.checkin_questions_valid(questions)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkin_templates_owner_idx ON public.checkin_templates (owner_id, updated_at DESC);

-- ─── Plans ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checkin_plans (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.checkin_templates(id) ON DELETE SET NULL,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  weekday smallint CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  anchor_date date NOT NULL DEFAULT current_date,
  habit_reasons jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(habit_reasons) = 'object'),
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((frequency IN ('weekly', 'biweekly')) = (weekday IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.checkin_plan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid,
  template_name text,
  frequency text NOT NULL,
  weekday smallint,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkin_plan_events_user_idx ON public.checkin_plan_events (user_id, occurred_at DESC);

-- ─── Answers ─────────────────────────────────────────────────────────────────

ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS custom_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.checkin_templates(id) ON DELETE SET NULL;
ALTER TABLE public.daily_checkins DROP CONSTRAINT IF EXISTS daily_checkins_custom_answers_shape;
ALTER TABLE public.daily_checkins ADD CONSTRAINT daily_checkins_custom_answers_shape
  CHECK (jsonb_typeof(custom_answers) = 'array' AND jsonb_array_length(custom_answers) <= 20);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.checkin_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_plan_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages checkin templates" ON public.checkin_templates;
CREATE POLICY "Owner manages checkin templates" ON public.checkin_templates
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Athlete reads the template of their plan" ON public.checkin_templates;
CREATE POLICY "Athlete reads the template of their plan" ON public.checkin_templates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checkin_plans p
     WHERE p.user_id = (SELECT auth.uid()) AND p.template_id = checkin_templates.id
  ));

DROP POLICY IF EXISTS "Athlete and active coach read checkin plan" ON public.checkin_plans;
CREATE POLICY "Athlete and active coach read checkin plan" ON public.checkin_plans
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_coach_of(user_id));
DROP POLICY IF EXISTS "Athlete and active coach read checkin plan events" ON public.checkin_plan_events;
CREATE POLICY "Athlete and active coach read checkin plan events" ON public.checkin_plan_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_coach_of(user_id));

REVOKE ALL ON TABLE public.checkin_templates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checkin_templates TO authenticated;
REVOKE ALL ON TABLE public.checkin_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.checkin_plans TO authenticated;
REVOKE ALL ON TABLE public.checkin_plan_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.checkin_plan_events TO authenticated;
GRANT ALL ON TABLE public.checkin_templates, public.checkin_plans, public.checkin_plan_events TO service_role;

-- ─── RPC ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_checkin_plan(
  p_user uuid,
  p_template uuid,
  p_frequency text,
  p_weekday smallint DEFAULT NULL,
  p_habit_reasons jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_has_coach boolean;
  v_prev public.checkin_plans%ROWTYPE;
  v_template_name text;
  v_reasons jsonb := COALESCE(p_habit_reasons, '{}'::jsonb);
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_user IS NULL THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.coach_client_links WHERE client_id = p_user AND status = 'active')
    INTO v_has_coach;
  -- Coached: the active coach decides. Solo: the athlete decides.
  IF p_user = v_actor THEN
    IF v_has_coach THEN RAISE EXCEPTION 'coach_decides'; END IF;
  ELSIF NOT public.is_coach_of(p_user) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF p_frequency NOT IN ('daily', 'weekly', 'biweekly', 'monthly') THEN RAISE EXCEPTION 'invalid_frequency'; END IF;
  IF (p_frequency IN ('weekly', 'biweekly')) <> (p_weekday IS NOT NULL) OR (p_weekday IS NOT NULL AND p_weekday NOT BETWEEN 0 AND 6) THEN
    RAISE EXCEPTION 'invalid_weekday';
  END IF;
  -- Only the actor's own templates can be assigned.
  IF p_template IS NOT NULL THEN
    SELECT name INTO v_template_name FROM public.checkin_templates WHERE id = p_template AND owner_id = v_actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'template_not_found'; END IF;
  END IF;
  IF jsonb_typeof(v_reasons) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_each(v_reasons) r
     WHERE jsonb_typeof(r.value) <> 'string' OR length(r.value #>> '{}') > 200 OR length(r.key) > 40
  ) THEN
    RAISE EXCEPTION 'invalid_reasons';
  END IF;

  SELECT * INTO v_prev FROM public.checkin_plans WHERE user_id = p_user FOR UPDATE;
  INSERT INTO public.checkin_plans (user_id, template_id, frequency, weekday, anchor_date, habit_reasons, set_by, updated_at)
  VALUES (p_user, p_template, p_frequency, p_weekday, current_date, v_reasons, v_actor, now())
  ON CONFLICT (user_id) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    frequency = EXCLUDED.frequency,
    weekday = EXCLUDED.weekday,
    -- A new rhythm starts today; the same rhythm keeps its anchor.
    anchor_date = CASE
      WHEN public.checkin_plans.frequency IS DISTINCT FROM EXCLUDED.frequency
        OR public.checkin_plans.weekday IS DISTINCT FROM EXCLUDED.weekday
      THEN current_date ELSE public.checkin_plans.anchor_date END,
    habit_reasons = EXCLUDED.habit_reasons,
    set_by = EXCLUDED.set_by,
    updated_at = now();

  IF v_prev.user_id IS NULL
     OR v_prev.template_id IS DISTINCT FROM p_template
     OR v_prev.frequency IS DISTINCT FROM p_frequency
     OR v_prev.weekday IS DISTINCT FROM p_weekday THEN
    INSERT INTO public.checkin_plan_events (user_id, template_id, template_name, frequency, weekday, actor_id)
    VALUES (p_user, p_template, v_template_name, p_frequency, p_weekday, v_actor);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_checkin_plan(uuid, uuid, text, smallint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_checkin_plan(uuid, uuid, text, smallint, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.checkin_questions_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_questions_valid(jsonb) TO authenticated, service_role;
