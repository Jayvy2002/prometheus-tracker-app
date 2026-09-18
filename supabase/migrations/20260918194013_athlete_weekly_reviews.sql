-- P2.2 universal weekly review. Candidate only: apply in isolated CI, not production.
-- Audit: solo_weekly_reviews is one Solo nutrition decision per ISO week (human tap).
-- triage_coach_fleet / coach_interventions is a Coach proposal inbox.
-- Neither is the shared weekly loop (quality → signals → wait|request_info|propose|close).
-- This table stores that loop. It never auto-applies programs or targets.

CREATE TABLE public.athlete_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  authority text NOT NULL CHECK (authority IN ('athlete', 'coach')),
  data_quality text NOT NULL CHECK (data_quality IN ('insufficient', 'sparse', 'adequate')),
  decision text NOT NULL CHECK (decision IN ('wait', 'request_info', 'propose', 'close')),
  summary text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 1 AND 500),
  aggregates jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(aggregates) = 'object'),
  tracking jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(tracking) = 'object'),
  signal_actions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(signal_actions) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, week_start)
);

COMMENT ON TABLE public.athlete_weekly_reviews IS
  'P2.2 one ISO-week review per athlete. Wait (no change) is a valid stored result. Aggregates only — never raw logs. Never auto-applies programs or targets.';
COMMENT ON COLUMN public.athlete_weekly_reviews.authority IS
  'Who receives the summary: athlete when Solo, Coach when an active coaching relationship exists.';
COMMENT ON COLUMN public.athlete_weekly_reviews.decision IS
  'wait | request_info | propose | close. Propose is a human-facing suggestion, not an applied write.';

CREATE INDEX athlete_weekly_reviews_athlete_week_idx
  ON public.athlete_weekly_reviews (athlete_id, week_start DESC);

ALTER TABLE public.athlete_weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY athlete_weekly_reviews_select_own
  ON public.athlete_weekly_reviews FOR SELECT TO authenticated
  USING ((select auth.uid()) = athlete_id);

CREATE POLICY athlete_weekly_reviews_select_active_coach
  ON public.athlete_weekly_reviews FOR SELECT TO authenticated
  USING (public.is_coach_of(athlete_id));

REVOKE ALL ON TABLE public.athlete_weekly_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.athlete_weekly_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.save_athlete_weekly_review(
  p_athlete_id uuid,
  p_week_start date,
  p_data_quality text,
  p_decision text,
  p_summary text,
  p_aggregates jsonb DEFAULT '{}'::jsonb,
  p_tracking jsonb DEFAULT '{}'::jsonb,
  p_signal_actions jsonb DEFAULT '[]'::jsonb
)
RETURNS public.athlete_weekly_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_authority text;
  v_row public.athlete_weekly_reviews;
  v_action jsonb;
  v_monday date;
BEGIN
  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_required';
  END IF;
  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'week_required';
  END IF;
  v_monday := date_trunc('week', p_week_start::timestamp)::date;
  IF p_week_start IS DISTINCT FROM v_monday THEN
    RAISE EXCEPTION 'invalid_week_start';
  END IF;
  IF p_data_quality IS NULL OR p_data_quality NOT IN ('insufficient', 'sparse', 'adequate') THEN
    RAISE EXCEPTION 'invalid_data_quality';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('wait', 'request_info', 'propose', 'close') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_summary IS NULL OR char_length(trim(p_summary)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_summary';
  END IF;
  IF p_aggregates IS NULL OR jsonb_typeof(p_aggregates) <> 'object' THEN
    RAISE EXCEPTION 'invalid_aggregates';
  END IF;
  IF p_aggregates ? 'nutrition_logs' OR p_aggregates ? 'workouts' OR p_aggregates ? 'checkins'
     OR p_aggregates ? 'weights' THEN
    RAISE EXCEPTION 'raw_logs_forbidden';
  END IF;
  IF p_tracking IS NULL OR jsonb_typeof(p_tracking) <> 'object' THEN
    RAISE EXCEPTION 'invalid_tracking';
  END IF;
  IF p_signal_actions IS NULL OR jsonb_typeof(p_signal_actions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_signal_actions';
  END IF;

  IF v_uid IS NOT NULL THEN
    IF v_uid <> p_athlete_id AND NOT public.is_coach_of(p_athlete_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = p_athlete_id AND status = 'active'
  ) THEN
    v_authority := 'coach';
  ELSE
    v_authority := 'athlete';
  END IF;

  FOR v_action IN SELECT value FROM jsonb_array_elements(p_signal_actions)
  LOOP
    IF jsonb_typeof(v_action) <> 'object' THEN
      RAISE EXCEPTION 'invalid_signal_action';
    END IF;
    IF v_action->>'op' = 'upsert' THEN
      PERFORM public.upsert_athlete_signal(
        p_athlete_id,
        v_action->>'domain',
        v_action->>'type',
        v_action->>'hypothesis',
        COALESCE(v_action->'evidence_for', '[]'::jsonb),
        COALESCE(v_action->'evidence_against', '[]'::jsonb),
        COALESCE(v_action->>'confidence', 'low'),
        COALESCE(v_action->>'status', 'open'),
        CASE
          WHEN v_action ? 'next_review_at' AND v_action->>'next_review_at' IS NOT NULL
            THEN (v_action->>'next_review_at')::timestamptz
          ELSE NULL
        END
      );
    ELSIF v_action->>'op' = 'resolve' THEN
      PERFORM public.resolve_athlete_signal(
        (v_action->>'id')::uuid,
        v_action->>'status',
        v_action->>'reason'
      );
    ELSE
      RAISE EXCEPTION 'invalid_signal_action';
    END IF;
  END LOOP;

  INSERT INTO public.athlete_weekly_reviews (
    athlete_id, week_start, authority, data_quality, decision, summary,
    aggregates, tracking, signal_actions, created_at, updated_at
  )
  VALUES (
    p_athlete_id, p_week_start, v_authority, p_data_quality, p_decision, trim(p_summary),
    p_aggregates, p_tracking, p_signal_actions, clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (athlete_id, week_start) DO UPDATE
  SET
    authority = EXCLUDED.authority,
    data_quality = EXCLUDED.data_quality,
    decision = EXCLUDED.decision,
    summary = EXCLUDED.summary,
    aggregates = EXCLUDED.aggregates,
    tracking = EXCLUDED.tracking,
    signal_actions = EXCLUDED.signal_actions,
    updated_at = clock_timestamp()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_athlete_weekly_review(uuid, date, text, text, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_athlete_weekly_review(uuid, date, text, text, text, jsonb, jsonb, jsonb)
  TO authenticated, service_role;
