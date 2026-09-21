-- P4.4: marketplace reports and traced moderation. No ratings.
-- Directory hold is per-report. In-flight prospect conversations continue.
-- Active coaching relationships are not ended. Discovery uses marketplace_coach_discoverable.

ALTER TABLE public.coach_profiles
  ADD COLUMN IF NOT EXISTS directory_suspended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coach_profiles.directory_suspended IS
  'Derived marketplace visibility hold: true iff any report against this coach has directory_hold_active. Blocks discovery and new request_coaching. Does not end a coaching relationship. Existing pending/coach_accepted prospect threads may continue through athlete_confirmed.';

CREATE OR REPLACE FUNCTION public.marketplace_coach_discoverable(p_coach uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_coach IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_coach)
    AND EXISTS (
      SELECT 1 FROM public.user_capabilities c
      WHERE c.user_id = p_coach AND c.capability = 'coach'
    )
    AND public.coach_relationship_is_open(p_coach)
    AND EXISTS (
      SELECT 1 FROM public.coach_profiles p
      WHERE p.coach_id = p_coach
        AND p.published
        AND NOT p.directory_suspended
    );
$$;

REVOKE ALL ON FUNCTION public.marketplace_coach_discoverable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_coach_discoverable(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.marketplace_coach_discoverable(uuid) IS
  'True when a Coach may appear in the directory, matching, public badges, and receive a new request. Requires auth user, coach capability, open P3 lifecycle, published profile, and no directory hold. Distinct from marketplace_coach_eligible, which in-flight confirm still uses.';

DROP POLICY IF EXISTS marketplace_profile_read ON public.coach_profiles;
CREATE POLICY marketplace_profile_read ON public.coach_profiles
  FOR SELECT TO authenticated
  USING (
    coach_id = (SELECT auth.uid())
    OR public.marketplace_coach_discoverable(coach_id)
  );

CREATE TABLE IF NOT EXISTS public.marketplace_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_ref text NOT NULL DEFAULT '',
  target_ref text NOT NULL DEFAULT '',
  subject_type text NOT NULL CHECK (subject_type IN ('profile', 'behavior')),
  category text NOT NULL CHECK (category IN ('harassment', 'impersonation', 'inappropriate', 'spam', 'other')),
  context text NOT NULL CHECK (length(btrim(context)) BETWEEN 1 AND 2000),
  related_request_id uuid REFERENCES public.coach_join_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  directory_hold_active boolean NOT NULL DEFAULT false,
  client_report_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (reporter_id <> target_user_id)
);

ALTER TABLE public.marketplace_reports
  ADD COLUMN IF NOT EXISTS reporter_ref text NOT NULL DEFAULT '';
ALTER TABLE public.marketplace_reports
  ADD COLUMN IF NOT EXISTS target_ref text NOT NULL DEFAULT '';
ALTER TABLE public.marketplace_reports
  ADD COLUMN IF NOT EXISTS directory_hold_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.marketplace_reports
  ADD COLUMN IF NOT EXISTS client_report_id uuid;

ALTER TABLE public.marketplace_reports
  ALTER COLUMN reporter_id DROP NOT NULL;
ALTER TABLE public.marketplace_reports
  ALTER COLUMN target_user_id DROP NOT NULL;

ALTER TABLE public.marketplace_reports
  DROP CONSTRAINT IF EXISTS marketplace_reports_reporter_id_fkey;
ALTER TABLE public.marketplace_reports
  DROP CONSTRAINT IF EXISTS marketplace_reports_target_user_id_fkey;
ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_reporter_id_fkey
    FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.marketplace_reports
  ADD CONSTRAINT marketplace_reports_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_reports_client_id_uidx
  ON public.marketplace_reports (reporter_id, client_report_id)
  WHERE client_report_id IS NOT NULL AND reporter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketplace_reports_status_idx
  ON public.marketplace_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_reports_hold_idx
  ON public.marketplace_reports (target_user_id)
  WHERE directory_hold_active;

COMMENT ON TABLE public.marketplace_reports IS
  'Marketplace reports for Prometheus review. Not a public coach review. Survives account deletion with SET NULL ids and durable refs.';
COMMENT ON COLUMN public.marketplace_reports.directory_hold_active IS
  'Per-report directory hold. Coach.directory_suspended is the OR of active holds.';
COMMENT ON COLUMN public.marketplace_reports.reporter_ref IS
  'Durable reporter provenance (user:<uid>). Kept after auth user deletion.';
COMMENT ON COLUMN public.marketplace_reports.target_ref IS
  'Durable target provenance (user:<uid>). Kept after auth user deletion.';

CREATE TABLE IF NOT EXISTS public.marketplace_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.marketplace_reports(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN (
    'acknowledge', 'dismiss', 'resolve', 'suspend_directory', 'restore_directory'
  )),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  actor text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'marketplace_moderation_actions'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%report_id%'
      AND pg_get_constraintdef(c.oid) ILIKE '%CASCADE%'
  LOOP
    EXECUTE format('ALTER TABLE public.marketplace_moderation_actions DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.marketplace_moderation_actions
  DROP CONSTRAINT IF EXISTS marketplace_moderation_actions_report_id_fkey;
ALTER TABLE public.marketplace_moderation_actions
  ADD CONSTRAINT marketplace_moderation_actions_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES public.marketplace_reports(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS marketplace_reports_reporter_idx
  ON public.marketplace_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_moderation_actions_report_idx
  ON public.marketplace_moderation_actions (report_id, created_at);

COMMENT ON TABLE public.marketplace_moderation_actions IS
  'Auditable moderation actions on marketplace reports. service_role only. actor is marketplace_audit_actor(), never a client-supplied id. Not a public coach review. Report deletion is restricted so audit is retained.';
COMMENT ON COLUMN public.marketplace_moderation_actions.actor IS
  'Durable provenance from marketplace_audit_actor (user:<uid> or role:<role>). Not CURRENT_USER and not a client argument.';

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

CREATE OR REPLACE FUNCTION public.marketplace_refresh_directory_suspended(p_coach uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_coach IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.coach_profiles SET
    directory_suspended = EXISTS (
      SELECT 1 FROM public.marketplace_reports r
      WHERE r.target_user_id = p_coach
        AND r.directory_hold_active
    ),
    updated_at = clock_timestamp()
  WHERE coach_id = p_coach;
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_refresh_directory_suspended(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_refresh_directory_suspended(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_marketplace_report(
  p_target uuid,
  p_subject_type text,
  p_category text,
  p_context text,
  p_request uuid,
  p_client_report_id uuid
)
RETURNS public.marketplace_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.marketplace_reports;
  v_actor text := public.marketplace_audit_actor();
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
  PERFORM pg_advisory_xact_lock(20014502, hashtext('report:' || v_uid::text));
  IF p_client_report_id IS NOT NULL THEN
    SELECT * INTO v_result
    FROM public.marketplace_reports
    WHERE reporter_id = v_uid AND client_report_id = p_client_report_id;
    IF FOUND THEN
      RETURN v_result;
    END IF;
  END IF;
  IF (
    SELECT count(*) FROM public.marketplace_reports
    WHERE reporter_id = v_uid AND status IN ('open', 'in_review')
  ) >= 10 THEN
    RAISE EXCEPTION 'report_limit';
  END IF;
  INSERT INTO public.marketplace_reports (
    reporter_id, target_user_id, reporter_ref, target_ref,
    subject_type, category, context, related_request_id, client_report_id
  ) VALUES (
    v_uid, p_target, v_actor, 'user:' || p_target::text,
    p_subject_type, p_category, btrim(p_context), p_request, p_client_report_id
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

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
BEGIN
  RETURN public.submit_marketplace_report(
    p_target, p_subject_type, p_category, p_context, p_request, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid, uuid) TO authenticated;

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
  v_actor text := public.marketplace_audit_actor();
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
    IF v_row.status IN ('resolved', 'dismissed') THEN RAISE EXCEPTION 'report_closed'; END IF;
    v_row.directory_hold_active := true;
    IF v_row.status = 'open' THEN v_row.status := 'in_review'; END IF;
  ELSIF p_action = 'restore_directory' THEN
    v_row.directory_hold_active := false;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;
  UPDATE public.marketplace_reports
    SET status = v_row.status,
        directory_hold_active = v_row.directory_hold_active,
        updated_at = clock_timestamp()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  INSERT INTO public.marketplace_moderation_actions (report_id, action, note, actor)
    VALUES (v_row.id, p_action, v_note, v_actor);
  PERFORM public.marketplace_refresh_directory_suspended(v_row.target_user_id);
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_marketplace_report(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_marketplace_report(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid) IS
  'Member marketplace report. Not a public coach review.';
COMMENT ON FUNCTION public.submit_marketplace_report(uuid, text, text, text, uuid, uuid) IS
  'Member marketplace report with client_report_id idempotency. Quota is serialized per reporter.';
COMMENT ON FUNCTION public.review_marketplace_report(uuid, text, text) IS
  'service_role moderation action. Records marketplace_audit_actor. Directory hold is per report. Does not end a coaching relationship.';

CREATE OR REPLACE FUNCTION public.coach_has_verified_qualification(p_coach uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_coach IS NOT NULL
    AND (
      p_coach = auth.uid()
      OR public.marketplace_coach_discoverable(p_coach)
    )
    AND EXISTS (
      SELECT 1 FROM public.coach_qualifications q
      WHERE q.coach_id = p_coach
        AND public.qualification_effective_status(q.verification_status, q.expires_on) = 'verified'
    );
$$;

REVOKE ALL ON FUNCTION public.coach_has_verified_qualification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coach_has_verified_qualification(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_public_coach_qualifications(p_coach uuid)
RETURNS TABLE (
  id uuid,
  coach_id uuid,
  title text,
  qualification_type text,
  issuer text,
  declared_at timestamptz,
  verification_status text,
  verified_at timestamptz,
  expires_on date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    q.id,
    q.coach_id,
    q.title,
    q.qualification_type,
    q.issuer,
    q.declared_at,
    public.qualification_effective_status(q.verification_status, q.expires_on),
    q.verified_at,
    q.expires_on
  FROM public.coach_qualifications q
  WHERE q.coach_id = p_coach
    AND public.marketplace_coach_discoverable(q.coach_id)
    AND q.verification_status <> 'rejected'
  ORDER BY q.declared_at DESC, q.id;
$$;

CREATE OR REPLACE FUNCTION public.list_public_coach_qualification_cards(p_coaches uuid[])
RETURNS TABLE (
  id uuid,
  coach_id uuid,
  title text,
  qualification_type text,
  issuer text,
  declared_at timestamptz,
  verification_status text,
  verified_at timestamptz,
  expires_on date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    q.id,
    q.coach_id,
    q.title,
    q.qualification_type,
    q.issuer,
    q.declared_at,
    public.qualification_effective_status(q.verification_status, q.expires_on),
    q.verified_at,
    q.expires_on
  FROM public.coach_qualifications q
  WHERE p_coaches IS NOT NULL
    AND q.coach_id = ANY (p_coaches)
    AND public.marketplace_coach_discoverable(q.coach_id)
    AND q.verification_status <> 'rejected'
  ORDER BY q.coach_id, q.declared_at DESC, q.id;
$$;

REVOKE ALL ON FUNCTION public.list_public_coach_qualifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_coach_qualifications(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_public_coach_qualification_cards(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_coach_qualification_cards(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_coaching(
  p_coach uuid,
  p_public_name text,
  p_summary text,
  p_sharing_version integer,
  p_request_key uuid,
  p_snapshot jsonb
)
RETURNS public.coach_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_join_requests;
  v_snapshot jsonb := '{}'::jsonb;
  v_summary text := btrim(coalesce(p_summary, ''));
BEGIN
  IF v_uid IS NULL OR p_coach IS NULL OR p_coach = v_uid THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF p_sharing_version NOT IN (2, 3) THEN
    RAISE EXCEPTION 'consent_required';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'request_key_required';
  END IF;
  IF p_sharing_version = 3 THEN
    v_snapshot := public.marketplace_prospect_snapshot(p_snapshot);
    IF v_summary = '' THEN
      v_summary := coalesce(v_snapshot->>'summary', '');
    ELSIF NOT (v_snapshot ? 'summary') THEN
      v_snapshot := v_snapshot || jsonb_build_object('summary', v_summary);
    END IF;
  ELSE
    IF v_summary = '' AND p_snapshot IS NOT NULL AND jsonb_typeof(p_snapshot) = 'object' THEN
      v_summary := btrim(coalesce(p_snapshot->>'summary', ''));
    END IF;
    v_snapshot := CASE
      WHEN v_summary <> '' THEN jsonb_build_object('summary', v_summary)
      ELSE '{}'::jsonb
    END;
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id = v_uid FOR UPDATE;
  SELECT * INTO v_result
  FROM public.coach_join_requests
  WHERE client_id = v_uid AND client_request_id = p_request_key;
  IF FOUND THEN
    IF v_result.coach_id <> p_coach THEN
      RAISE EXCEPTION 'request_key_conflict';
    END IF;
    RETURN v_result;
  END IF;
  SELECT * INTO v_result
  FROM public.coach_join_requests
  WHERE client_id = v_uid
    AND coach_id = p_coach
    AND status IN ('pending', 'coach_accepted');
  IF FOUND THEN
    RETURN v_result;
  END IF;
  IF NOT public.marketplace_coach_discoverable(p_coach) THEN
    RAISE EXCEPTION 'coach_unavailable';
  END IF;
  PERFORM 1 FROM public.coach_profiles
    WHERE coach_id = p_coach AND accepting_clients
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach_unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'already_coached';
  END IF;
  INSERT INTO public.coach_join_requests (
    coach_id, client_id, public_name, summary, sharing_version, client_request_id, prospect_snapshot
  ) VALUES (
    p_coach, v_uid, btrim(p_public_name), v_summary, p_sharing_version, p_request_key, v_snapshot
  )
  ON CONFLICT (coach_id, client_id) WHERE status IN ('pending', 'coach_accepted')
  DO UPDATE SET updated_at = public.coach_join_requests.updated_at
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid, jsonb) TO authenticated;

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
  v_price text;
  v_acc jsonb := '[]'::jsonb;
  v_item jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_intent FROM public.marketplace_search_intents WHERE athlete_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_search_intent'; END IF;
  IF v_intent.discipline = '' OR v_intent.language = '' OR v_intent.format = '' THEN
    RAISE EXCEPTION 'intent_incomplete';
  END IF;
  IF v_intent.format <> 'online'
     AND (btrim(v_intent.area_city) = '' OR btrim(v_intent.area_country) = '') THEN
    RAISE EXCEPTION 'intent_incomplete';
  END IF;

  FOR v_row IN
    SELECT * FROM public.coach_profiles
    WHERE accepting_clients
      AND coach_id <> v_uid
      AND public.marketplace_coach_discoverable(coach_id)
    ORDER BY public_name, coach_id
  LOOP
    v_eligible := true;
    v_req := ARRAY[]::text[];
    v_pref := ARRAY[]::text[];
    v_missing := ARRAY[]::text[];
    v_reasons := ARRAY[]::text[];

    IF v_row.disciplines @> ARRAY[v_intent.discipline] THEN
      v_req := array_append(v_req, 'discipline'); v_reasons := array_append(v_reasons, 'discipline');
    ELSE
      v_eligible := false;
    END IF;

    IF v_row.languages @> ARRAY[v_intent.language] THEN
      v_req := array_append(v_req, 'language'); v_reasons := array_append(v_reasons, 'language');
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
      v_req := array_append(v_req, 'format'); v_reasons := array_append(v_reasons, 'format');
      IF v_intent.format <> 'online' THEN
        IF public.marketplace_location_matches(
          v_row.area_city, v_row.area_region, v_row.area_country,
          v_intent.area_city, v_intent.area_region, v_intent.area_country
        ) THEN
          v_req := array_append(v_req, 'area'); v_reasons := array_append(v_reasons, 'area');
        ELSE
          v_eligible := false;
        END IF;
      END IF;
    ELSE
      v_eligible := false;
    END IF;

    v_price := public.marketplace_listed_rate_decision(
      v_intent.budget_max_cents,
      v_intent.budget_period,
      v_intent.budget_currency,
      v_row.indicative_price_cents,
      v_row.indicative_price_period,
      v_row.indicative_price_currency
    );
    IF v_price = 'missing' THEN
      v_missing := array_append(v_missing, 'price');
    ELSIF v_price = 'over' THEN
      v_eligible := false;
    ELSIF v_price = 'match' THEN
      v_req := array_append(v_req, 'budget'); v_reasons := array_append(v_reasons, 'budget');
    END IF;

    IF v_intent.contact_frequency <> '' THEN
      IF v_row.contact_frequency = '' THEN v_missing := array_append(v_missing, 'contact_frequency');
      ELSIF v_row.contact_frequency = v_intent.contact_frequency THEN
        v_pref := array_append(v_pref, 'contact_frequency'); v_reasons := array_append(v_reasons, 'contact_frequency');
      END IF;
    END IF;
    IF v_intent.coaching_style <> '' THEN
      IF v_row.coaching_style = '' THEN v_missing := array_append(v_missing, 'coaching_style');
      ELSIF v_row.coaching_style = v_intent.coaching_style THEN
        v_pref := array_append(v_pref, 'coaching_style'); v_reasons := array_append(v_reasons, 'coaching_style');
      END IF;
    END IF;
    IF v_intent.autonomy <> '' THEN
      IF v_row.autonomy = '' THEN v_missing := array_append(v_missing, 'autonomy');
      ELSIF v_row.autonomy = v_intent.autonomy THEN
        v_pref := array_append(v_pref, 'autonomy'); v_reasons := array_append(v_reasons, 'autonomy');
      END IF;
    END IF;
    IF v_intent.experience_level <> '' THEN
      IF cardinality(v_row.experience_levels) = 0 THEN v_missing := array_append(v_missing, 'experience_level');
      ELSIF v_row.experience_levels @> ARRAY[v_intent.experience_level] THEN
        v_pref := array_append(v_pref, 'experience_level'); v_reasons := array_append(v_reasons, 'experience_level');
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
  'Eligible coach shortlist with blocking and preference reasons. Not a compatibility score. Not a payment. Uses marketplace_coach_discoverable.';
