-- P2.1 persistent athlete signals. Candidate only: apply in isolated CI, not production.
-- Audit: coach_interventions is a proposal inbox (pending/sent/kept/dismissed), not a
-- longitudinal hypothesis. solo_weekly_reviews is one nutrition decision per ISO week.
-- A new table is required; this migration does not auto-apply programs or targets.

CREATE TABLE public.athlete_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN (
    'training', 'nutrition', 'recovery', 'weight', 'goal', 'adherence'
  )),
  type text NOT NULL CHECK (char_length(trim(type)) BETWEEN 1 AND 80),
  hypothesis text NOT NULL CHECK (char_length(trim(hypothesis)) BETWEEN 1 AND 500),
  evidence_for jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_for) = 'array'),
  evidence_against jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_against) = 'array'),
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'waiting', 'resolved', 'not_relevant'
  )),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  next_review_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open', 'waiting') OR resolved_at IS NOT NULL),
  CHECK (status IN ('resolved', 'not_relevant') OR resolved_at IS NULL)
);

COMMENT ON TABLE public.athlete_signals IS
  'P2.1 longitudinal hypotheses per athlete. Not a proposal inbox. Never auto-applies programs or targets. Evidence is aggregates only — never raw logs. Confidence is qualitative.';
COMMENT ON COLUMN public.athlete_signals.domain IS
  'training | nutrition | recovery (check-in) | weight | goal | adherence (data-quality without moral judgment).';
COMMENT ON COLUMN public.athlete_signals.confidence IS
  'Qualitative only: low | medium | high. No numeric score.';
COMMENT ON COLUMN public.athlete_signals.status IS
  'open = tracked; waiting = not enough evidence; resolved / not_relevant = human or review closed. History is kept.';

CREATE UNIQUE INDEX athlete_signals_one_open
  ON public.athlete_signals (athlete_id, domain, type)
  WHERE status IN ('open', 'waiting');

CREATE INDEX athlete_signals_athlete_status_idx
  ON public.athlete_signals (athlete_id, status, last_seen_at DESC);

CREATE INDEX athlete_signals_athlete_domain_idx
  ON public.athlete_signals (athlete_id, domain, last_seen_at DESC);

ALTER TABLE public.athlete_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY athlete_signals_select_own
  ON public.athlete_signals FOR SELECT TO authenticated
  USING ((select auth.uid()) = athlete_id);

CREATE POLICY athlete_signals_select_active_coach
  ON public.athlete_signals FOR SELECT TO authenticated
  USING (public.is_coach_of(athlete_id));

REVOKE ALL ON TABLE public.athlete_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.athlete_signals TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_athlete_signal(
  p_athlete_id uuid,
  p_domain text,
  p_type text,
  p_hypothesis text,
  p_evidence_for jsonb DEFAULT '[]'::jsonb,
  p_evidence_against jsonb DEFAULT '[]'::jsonb,
  p_confidence text DEFAULT 'low',
  p_status text DEFAULT 'open',
  p_next_review_at timestamptz DEFAULT NULL
)
RETURNS public.athlete_signals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.athlete_signals;
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
  IF p_hypothesis IS NULL OR char_length(trim(p_hypothesis)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_hypothesis';
  END IF;
  IF p_evidence_for IS NULL OR jsonb_typeof(p_evidence_for) <> 'array'
     OR p_evidence_against IS NULL OR jsonb_typeof(p_evidence_against) <> 'array' THEN
    RAISE EXCEPTION 'invalid_evidence';
  END IF;
  IF p_confidence IS NULL OR p_confidence NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'invalid_confidence';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('open', 'waiting') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  UPDATE public.athlete_signals
  SET
    hypothesis = trim(p_hypothesis),
    evidence_for = p_evidence_for,
    evidence_against = p_evidence_against,
    confidence = p_confidence,
    status = p_status,
    last_seen_at = clock_timestamp(),
    next_review_at = p_next_review_at,
    updated_at = clock_timestamp()
  WHERE athlete_id = p_athlete_id
    AND domain = p_domain
    AND type = trim(p_type)
    AND status IN ('open', 'waiting')
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.athlete_signals (
    athlete_id, domain, type, hypothesis,
    evidence_for, evidence_against, confidence, status,
    first_seen_at, last_seen_at, next_review_at
  )
  VALUES (
    p_athlete_id, p_domain, trim(p_type), trim(p_hypothesis),
    p_evidence_for, p_evidence_against, p_confidence, p_status,
    clock_timestamp(), clock_timestamp(), p_next_review_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_athlete_signal(
  p_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS public.athlete_signals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.athlete_signals;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'signal_required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('resolved', 'not_relevant') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT * INTO v_row
  FROM public.athlete_signals
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF v_uid <> v_row.athlete_id AND NOT public.is_coach_of(v_row.athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  IF v_row.status IN ('resolved', 'not_relevant') THEN
    IF v_row.status = p_status THEN
      RETURN v_row;
    END IF;
    RAISE EXCEPTION 'already_closed';
  END IF;

  UPDATE public.athlete_signals
  SET
    status = p_status,
    resolution_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
    resolved_at = clock_timestamp(),
    last_seen_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_athlete_signal(uuid, text, text, text, jsonb, jsonb, text, text, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_athlete_signal(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_athlete_signal(uuid, text, text, text, jsonb, jsonb, text, text, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_athlete_signal(uuid, text, text)
  TO authenticated, service_role;
