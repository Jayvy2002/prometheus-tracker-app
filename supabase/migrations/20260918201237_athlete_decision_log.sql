-- P2.3 human decision journal. Candidate only: apply in isolated CI, not production.
-- Audit: solo_weekly_reviews is one Solo nutrition tap per ISO week (accepted/kept/dismissed).
-- coach_interventions is a Coach inbox (pending/sent/kept/dismissed). Neither stores
-- modified vs accepted, optional human reason, applied-effect snapshot, nor feeds the
-- next weekly review. A new append-only table is required. This RPC never auto-applies
-- programs or targets — applied_effect is a snapshot after existing human-gated writes.

CREATE TABLE public.athlete_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('athlete', 'coach')),
  domain text NOT NULL CHECK (domain IN (
    'training', 'nutrition', 'recovery', 'weight', 'goal', 'adherence'
  )),
  type text NOT NULL CHECK (char_length(trim(type)) BETWEEN 1 AND 80),
  decision text NOT NULL CHECK (decision IN ('accepted', 'modified', 'refused', 'ignored')),
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(proposal) = 'object'),
  why text NOT NULL CHECK (char_length(trim(why)) BETWEEN 1 AND 500),
  data_used jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(data_used) = 'object'),
  human_reason text CHECK (
    human_reason IS NULL OR char_length(trim(human_reason)) BETWEEN 1 AND 500
  ),
  applied_effect jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(applied_effect) = 'object'),
  source text CHECK (source IS NULL OR char_length(trim(source)) BETWEEN 1 AND 80),
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    decision IN ('accepted', 'modified')
    OR applied_effect = '{}'::jsonb
  )
);

COMMENT ON TABLE public.athlete_decision_log IS
  'P2.3 append-only human decisions. Stores proposal, why, data used, actor, accepted/modified/refused/ignored, optional human reason, applied-effect snapshot. Never auto-applies programs or targets. A refusal/ignored suppresses the same (domain, type) until evidence moves.';
COMMENT ON COLUMN public.athlete_decision_log.decision IS
  'accepted | modified | refused | ignored. Refused/ignored require empty applied_effect.';
COMMENT ON COLUMN public.athlete_decision_log.applied_effect IS
  'Snapshot of values already written by a human-gated path. This table never writes programs, targets or logs.';
COMMENT ON COLUMN public.athlete_decision_log.actor_role IS
  'Who decided: athlete (self) or Coach with an active coaching relationship. Derived from auth, never client-supplied.';

CREATE INDEX athlete_decision_log_athlete_created_idx
  ON public.athlete_decision_log (athlete_id, created_at DESC);

CREATE INDEX athlete_decision_log_athlete_target_idx
  ON public.athlete_decision_log (athlete_id, domain, type, created_at DESC);

ALTER TABLE public.athlete_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY athlete_decision_log_select_own
  ON public.athlete_decision_log FOR SELECT TO authenticated
  USING ((select auth.uid()) = athlete_id);

CREATE POLICY athlete_decision_log_select_active_coach
  ON public.athlete_decision_log FOR SELECT TO authenticated
  USING (public.is_coach_of(athlete_id));

REVOKE ALL ON TABLE public.athlete_decision_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.athlete_decision_log TO authenticated;

CREATE OR REPLACE FUNCTION public.record_athlete_decision(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_decision text,
  p_proposal jsonb,
  p_why text,
  p_data_used jsonb DEFAULT '{}'::jsonb,
  p_human_reason text DEFAULT NULL,
  p_applied_effect jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL
)
RETURNS public.athlete_decision_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.athlete_decision_log;
  v_effect jsonb := COALESCE(p_applied_effect, '{}'::jsonb);
  v_data jsonb := COALESCE(p_data_used, '{}'::jsonb);
  v_proposal jsonb := COALESCE(p_proposal, '{}'::jsonb);
  v_reason text := NULLIF(trim(COALESCE(p_human_reason, '')), '');
  v_source text := NULLIF(trim(COALESCE(p_source, '')), '');
BEGIN
  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_required';
  END IF;
  IF p_domain IS NULL OR p_domain NOT IN (
    'training', 'nutrition', 'recovery', 'weight', 'goal', 'adherence'
  ) THEN
    RAISE EXCEPTION 'invalid_domain';
  END IF;
  IF p_type IS NULL OR char_length(trim(p_type)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'modified', 'refused', 'ignored') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_why IS NULL OR char_length(trim(p_why)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_why';
  END IF;
  IF jsonb_typeof(v_proposal) <> 'object' THEN
    RAISE EXCEPTION 'invalid_proposal';
  END IF;
  IF jsonb_typeof(v_data) <> 'object' THEN
    RAISE EXCEPTION 'invalid_data_used';
  END IF;
  IF jsonb_typeof(v_effect) <> 'object' THEN
    RAISE EXCEPTION 'invalid_applied_effect';
  END IF;
  IF v_proposal ? 'nutrition_logs' OR v_proposal ? 'workouts' OR v_proposal ? 'checkins'
     OR v_proposal ? 'weights'
     OR v_data ? 'nutrition_logs' OR v_data ? 'workouts' OR v_data ? 'checkins'
     OR v_data ? 'weights'
     OR v_effect ? 'nutrition_logs' OR v_effect ? 'workouts' OR v_effect ? 'checkins'
     OR v_effect ? 'weights' THEN
    RAISE EXCEPTION 'raw_logs_forbidden';
  END IF;
  IF p_decision IN ('refused', 'ignored') AND v_effect <> '{}'::jsonb THEN
    RAISE EXCEPTION 'applied_effect_forbidden';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF v_uid = p_athlete_id THEN
      v_role := 'athlete';
    ELSE
      v_role := 'coach';
    END IF;
  ELSE
    v_role := 'athlete';
  END IF;

  INSERT INTO public.athlete_decision_log (
    athlete_id, actor_id, actor_role, domain, type, decision,
    proposal, why, data_used, human_reason, applied_effect, source, source_id, created_at
  )
  VALUES (
    p_athlete_id, v_uid, v_role, p_domain, trim(p_type), p_decision,
    v_proposal, trim(p_why), v_data, v_reason, v_effect, v_source, p_source_id, clock_timestamp()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_athlete_decision(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid)
  TO authenticated, service_role;
