-- P4.4: marketplace reports and traced moderation. No ratings.

ALTER TABLE public.coach_profiles
  ADD COLUMN IF NOT EXISTS directory_suspended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coach_profiles.directory_suspended IS
  'Temporary marketplace visibility hold during a serious review. Does not end a coaching relationship.';

DROP POLICY IF EXISTS marketplace_profile_read ON public.coach_profiles;
CREATE POLICY marketplace_profile_read ON public.coach_profiles
  FOR SELECT TO authenticated
  USING (
    coach_id = (SELECT auth.uid())
    OR (
      published
      AND NOT directory_suspended
      AND public.marketplace_coach_eligible(coach_id)
    )
  );

CREATE TABLE IF NOT EXISTS public.marketplace_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('profile', 'behavior')),
  category text NOT NULL CHECK (category IN ('harassment', 'impersonation', 'inappropriate', 'spam', 'other')),
  context text NOT NULL CHECK (length(btrim(context)) BETWEEN 1 AND 2000),
  related_request_id uuid REFERENCES public.coach_join_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (reporter_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS marketplace_reports_status_idx
  ON public.marketplace_reports (status, created_at DESC);

COMMENT ON TABLE public.marketplace_reports IS
  'Marketplace reports for Prometheus review. Not a public coach review.';

CREATE TABLE IF NOT EXISTS public.marketplace_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.marketplace_reports(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'acknowledge', 'dismiss', 'resolve', 'suspend_directory', 'restore_directory'
  )),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  actor text NOT NULL DEFAULT CURRENT_USER,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS marketplace_reports_reporter_idx
  ON public.marketplace_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_moderation_actions_report_idx
  ON public.marketplace_moderation_actions (report_id, created_at);

COMMENT ON TABLE public.marketplace_moderation_actions IS
  'Auditable moderation actions on marketplace reports. service_role only. Not a public coach review.';

ALTER TABLE public.marketplace_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_moderation_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.marketplace_moderation_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_reports TO authenticated;
GRANT ALL ON TABLE public.marketplace_reports TO service_role;
GRANT ALL ON TABLE public.marketplace_moderation_actions TO service_role;

DROP POLICY IF EXISTS marketplace_reports_own ON public.marketplace_reports;
CREATE POLICY marketplace_reports_own ON public.marketplace_reports
  FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.submit_marketplace_report(
  p_target uuid,
  p_subject_type text,
  p_category text,
  p_context text,
  p_request uuid DEFAULT NULL
)
RETURNS public.marketplace_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.marketplace_reports;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_target IS NULL OR p_target = v_uid THEN RAISE EXCEPTION 'invalid_target'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN RAISE EXCEPTION 'invalid_target'; END IF;
  IF p_request IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.coach_join_requests
    WHERE id = p_request
      AND (coach_id = v_uid OR client_id = v_uid)
      AND (coach_id = p_target OR client_id = p_target)
  ) THEN
    RAISE EXCEPTION 'request_mismatch';
  END IF;
  IF (
    SELECT count(*) FROM public.marketplace_reports
    WHERE reporter_id = v_uid AND status IN ('open', 'in_review')
  ) >= 10 THEN
    RAISE EXCEPTION 'report_limit';
  END IF;
  INSERT INTO public.marketplace_reports (
    reporter_id, target_user_id, subject_type, category, context, related_request_id
  ) VALUES (
    v_uid, p_target, p_subject_type, p_category, btrim(p_context), p_request
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_marketplace_report(
  p_report uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS public.marketplace_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.marketplace_reports;
  v_note text := coalesce(p_note, '');
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO v_row FROM public.marketplace_reports WHERE id = p_report FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_action = 'acknowledge' THEN
    IF v_row.status <> 'open' THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.status := 'in_review';
  ELSIF p_action = 'dismiss' THEN
    IF v_row.status NOT IN ('open', 'in_review') THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.status := 'dismissed';
  ELSIF p_action = 'resolve' THEN
    IF v_row.status NOT IN ('open', 'in_review') THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.status := 'resolved';
  ELSIF p_action = 'suspend_directory' THEN
    UPDATE public.coach_profiles SET directory_suspended = true, updated_at = clock_timestamp()
      WHERE coach_id = v_row.target_user_id;
    IF v_row.status = 'open' THEN v_row.status := 'in_review'; END IF;
  ELSIF p_action = 'restore_directory' THEN
    UPDATE public.coach_profiles SET directory_suspended = false, updated_at = clock_timestamp()
      WHERE coach_id = v_row.target_user_id;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;
  UPDATE public.marketplace_reports
    SET status = v_row.status, updated_at = clock_timestamp()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  INSERT INTO public.marketplace_moderation_actions (report_id, action, note)
    VALUES (v_row.id, p_action, v_note);
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_marketplace_report(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_marketplace_report(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid) IS
  'Member marketplace report. Not a public coach review.';
COMMENT ON FUNCTION public.review_marketplace_report(uuid, text, text) IS
  'service_role moderation action. Does not end a coaching relationship.';

CREATE OR REPLACE FUNCTION public.explain_marketplace_matches()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_intent public.marketplace_search_intents;
  v_row public.coach_profiles;
  v_eligible boolean;
  v_req text[];
  v_pref text[];
  v_missing text[];
  v_reasons text[];
  v_acc jsonb := '[]'::jsonb;
  v_item jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_intent FROM public.marketplace_search_intents WHERE athlete_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_search_intent'; END IF;
  IF v_intent.discipline = '' OR v_intent.language = '' OR v_intent.format = '' THEN
    RAISE EXCEPTION 'intent_incomplete';
  END IF;

  FOR v_row IN
    SELECT * FROM public.coach_profiles
    WHERE published AND accepting_clients AND NOT directory_suspended AND coach_id <> v_uid
    ORDER BY public_name, coach_id
  LOOP
    v_eligible := true;
    v_req := ARRAY[]::text[];
    v_pref := ARRAY[]::text[];
    v_missing := ARRAY[]::text[];
    v_reasons := ARRAY[]::text[];

    IF v_row.disciplines @> ARRAY[v_intent.discipline] THEN
      v_req := v_req || 'discipline'; v_reasons := v_reasons || 'discipline';
    ELSE
      v_eligible := false;
    END IF;

    IF v_row.languages @> ARRAY[v_intent.language] THEN
      v_req := v_req || 'language'; v_reasons := v_reasons || 'language';
    ELSE
      v_eligible := false;
    END IF;

    IF (
      (v_intent.format = 'online' AND v_row.formats && ARRAY['online', 'hybrid']::text[])
      OR (v_intent.format = 'in_person' AND v_row.formats && ARRAY['in_person', 'hybrid']::text[])
      OR (v_intent.format = 'hybrid' AND (
        v_row.formats @> ARRAY['hybrid']::text[]
        OR (v_row.formats @> ARRAY['online']::text[] AND v_row.formats @> ARRAY['in_person']::text[])
      ))
    ) THEN
      v_req := v_req || 'format'; v_reasons := v_reasons || 'format';
      IF v_intent.format <> 'online' THEN
        IF btrim(v_intent.area) = '' THEN
          v_missing := v_missing || 'area';
        ELSIF btrim(v_row.area) = '' THEN
          v_eligible := false;
        ELSIF position(lower(btrim(v_intent.area)) IN lower(btrim(v_row.area))) = 0
          AND position(lower(btrim(v_row.area)) IN lower(btrim(v_intent.area))) = 0
          AND lower(btrim(v_row.area)) IS DISTINCT FROM lower(btrim(v_intent.area)) THEN
          v_eligible := false;
        ELSE
          v_req := v_req || 'area'; v_reasons := v_reasons || 'area';
        END IF;
      END IF;
    ELSE
      v_eligible := false;
    END IF;

    IF v_intent.budget_max_cents IS NOT NULL THEN
      IF v_row.indicative_price_cents IS NULL OR v_row.indicative_price_period = 'on_request' THEN
        v_missing := v_missing || 'price';
      ELSIF v_row.indicative_price_cents > v_intent.budget_max_cents THEN
        v_eligible := false;
      ELSE
        v_req := v_req || 'budget'; v_reasons := v_reasons || 'budget';
      END IF;
    END IF;

    IF v_intent.contact_frequency <> '' THEN
      IF v_row.contact_frequency = '' THEN v_missing := v_missing || 'contact_frequency';
      ELSIF v_row.contact_frequency = v_intent.contact_frequency THEN
        v_pref := v_pref || 'contact_frequency'; v_reasons := v_reasons || 'contact_frequency';
      END IF;
    END IF;
    IF v_intent.coaching_style <> '' THEN
      IF v_row.coaching_style = '' THEN v_missing := v_missing || 'coaching_style';
      ELSIF v_row.coaching_style = v_intent.coaching_style THEN
        v_pref := v_pref || 'coaching_style'; v_reasons := v_reasons || 'coaching_style';
      END IF;
    END IF;
    IF v_intent.autonomy <> '' THEN
      IF v_row.autonomy = '' THEN v_missing := v_missing || 'autonomy';
      ELSIF v_row.autonomy = v_intent.autonomy THEN
        v_pref := v_pref || 'autonomy'; v_reasons := v_reasons || 'autonomy';
      END IF;
    END IF;
    IF v_intent.experience_level <> '' THEN
      IF cardinality(v_row.experience_levels) = 0 THEN v_missing := v_missing || 'experience_level';
      ELSIF v_row.experience_levels @> ARRAY[v_intent.experience_level] THEN
        v_pref := v_pref || 'experience_level'; v_reasons := v_reasons || 'experience_level';
      END IF;
    END IF;

    IF v_eligible THEN
      v_item := jsonb_build_object(
        'coach_id', v_row.coach_id,
        'public_name', v_row.public_name,
        'eligible', true,
        'matched_requirements', to_jsonb(v_req),
        'matched_preferences', to_jsonb(v_pref),
        'missing_information', to_jsonb(v_missing),
        'reasons', to_jsonb(v_reasons)
      );
      v_acc := v_acc || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  RETURN coalesce((
    SELECT jsonb_agg(
      ranked.item
      ORDER BY jsonb_array_length(ranked.item->'matched_preferences') DESC,
        ranked.item->>'public_name',
        ranked.item->>'coach_id'
    )
    FROM (
      SELECT item
      FROM jsonb_array_elements(v_acc) AS item
      ORDER BY jsonb_array_length(item->'matched_preferences') DESC,
        item->>'public_name',
        item->>'coach_id'
      LIMIT 5
    ) ranked
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.explain_marketplace_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.explain_marketplace_matches() TO authenticated;

COMMENT ON FUNCTION public.explain_marketplace_matches() IS
  'Eligible coach shortlist with blocking and preference reasons. Not a compatibility score. Not a payment. Excludes directory holds.';
