-- P5.4 minimal operator console.
-- Queues: qualifications, exercise proposals, merges, problem imports, reports.
-- Authenticated users may call the admin RPCs; every one fails closed unless the
-- caller is an active platform operator. service_role review functions stay
-- ungranted to authenticated. No subscriptions, no cost telemetry, no generic
-- back office.

CREATE TABLE IF NOT EXISTS public.platform_operators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  granted_by_ref text NOT NULL CHECK (char_length(granted_by_ref) BETWEEN 1 AND 80),
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_ref text NOT NULL CHECK (char_length(actor_ref) BETWEEN 1 AND 80),
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  subject_type text NOT NULL CHECK (char_length(subject_type) BETWEEN 1 AND 40),
  subject_id uuid,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS platform_admin_audit_subject_idx
  ON public.platform_admin_audit (action, subject_id, created_at DESC);

ALTER TABLE public.platform_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_operators FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_admin_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_operators TO service_role;
GRANT ALL ON TABLE public.platform_admin_audit TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.platform_operators o
      WHERE o.user_id = auth.uid()
        AND o.revoked_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated, service_role;

COMMENT ON FUNCTION public.is_platform_operator() IS
  'True only for the current user when an active platform_operators row exists. Does not list other operators.';

CREATE OR REPLACE FUNCTION public.admin_require(p_confirm boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF coalesce(p_confirm, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  RETURN public.marketplace_audit_actor();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_require(boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_audit(
  p_actor text,
  p_action text,
  p_subject_type text,
  p_subject uuid,
  p_note text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.platform_admin_audit (actor_id, actor_ref, action, subject_type, subject_id, note)
  VALUES (auth.uid(), p_actor, p_action, p_subject_type, p_subject, left(coalesce(p_note, ''), 500));
$$;

REVOKE ALL ON FUNCTION public.admin_audit(text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_proof_access_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_operator()
    AND coalesce((storage.foldername(p_name))[2], '') <> ''
    AND EXISTS (
      SELECT 1 FROM public.platform_admin_audit a
      WHERE a.actor_id = auth.uid()
        AND a.action = 'open_qualification_proof'
        AND a.subject_id::text = (storage.foldername(p_name))[2]
        AND a.created_at > clock_timestamp() - interval '10 minutes'
    );
$$;

REVOKE ALL ON FUNCTION public.admin_proof_access_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_proof_access_allowed(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Operators read audited qualification proofs" ON storage.objects;
CREATE POLICY "Operators read audited qualification proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'qualification-proofs'
    AND public.admin_proof_access_allowed(name)
  );

-- Existing review RPCs stay service_role-only at the grant layer.
-- An operator reaches them only through the admin wrappers below.
CREATE OR REPLACE FUNCTION public.review_coach_qualification(
  p_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS public.coach_qualifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result public.coach_qualifications;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_actor text := public.marketplace_audit_actor();
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role'
     AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_decision NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_decision = 'rejected' AND v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  SELECT * INTO v_result
  FROM public.coach_qualifications
  WHERE id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_result.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'qualification_locked';
  END IF;
  UPDATE public.coach_qualifications SET
    verification_status = p_decision,
    verified_at = CASE WHEN p_decision = 'verified' THEN clock_timestamp() ELSE NULL END,
    reviewer_id = auth.uid(),
    reviewer_ref = v_actor,
    review_note = v_note,
    updated_at = clock_timestamp()
  WHERE id = p_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

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
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role'
     AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO v_row FROM public.marketplace_reports WHERE id = p_report;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.lock_marketplace_directory_hold(v_row.target_user_id);
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

CREATE OR REPLACE FUNCTION public.grant_platform_operator(p_user uuid, p_confirm boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := coalesce(nullif(auth.role(), ''), current_user);
  v_actor text;
BEGIN
  IF coalesce(p_confirm, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  IF v_role IS DISTINCT FROM 'service_role' AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  v_actor := public.marketplace_audit_actor();
  INSERT INTO public.platform_operators (user_id, granted_by_ref)
  VALUES (p_user, v_actor)
  ON CONFLICT (user_id) DO UPDATE
    SET revoked_at = NULL,
        granted_at = clock_timestamp(),
        granted_by_ref = excluded.granted_by_ref;
  PERFORM public.admin_audit(v_actor, 'grant_operator', 'operator', p_user, '');
  RETURN jsonb_build_object('status', 'granted', 'user_id', p_user);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_platform_operator(p_user uuid, p_confirm boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_active integer;
BEGIN
  v_actor := public.admin_require(p_confirm);
  SELECT count(*) INTO v_active
  FROM public.platform_operators
  WHERE revoked_at IS NULL;
  IF v_active <= 1 AND p_user = auth.uid() THEN
    RAISE EXCEPTION 'last_operator';
  END IF;
  UPDATE public.platform_operators
    SET revoked_at = clock_timestamp()
  WHERE user_id = p_user
    AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  PERFORM public.admin_audit(v_actor, 'revoke_operator', 'operator', p_user, '');
  RETURN jsonb_build_object('status', 'revoked', 'user_id', p_user);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_operators()
RETURNS TABLE (user_id uuid, granted_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT o.user_id, o.granted_at
  FROM public.platform_operators o
  WHERE o.revoked_at IS NULL
  ORDER BY o.granted_at, o.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_pending_qualifications()
RETURNS TABLE (
  id uuid,
  title text,
  qualification_type text,
  issuer text,
  declared_at timestamptz,
  expires_on date,
  proof_present boolean,
  coach_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT q.id, q.title, q.qualification_type, q.issuer, q.declared_at, q.expires_on,
         (q.proof_path IS NOT NULL),
         coalesce(left(p.full_name, 80), '')
  FROM public.coach_qualifications q
  LEFT JOIN public.user_profiles p ON p.id = q.coach_id
  WHERE q.verification_status = 'pending'
  ORDER BY q.declared_at, q.id
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_open_qualification_proof(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_path text;
  v_mime text := '';
  v_size bigint := 0;
BEGIN
  v_actor := public.admin_require(true);
  SELECT q.proof_path INTO v_path
  FROM public.coach_qualifications q
  WHERE q.id = p_id
    AND q.verification_status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'proof_missing';
  END IF;
  SELECT coalesce(o.metadata->>'mimetype', ''),
         coalesce((o.metadata->>'size')::bigint, 0)
    INTO v_mime, v_size
  FROM storage.objects o
  WHERE o.bucket_id = 'qualification-proofs'
    AND o.name = v_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proof_missing';
  END IF;
  PERFORM public.admin_audit(v_actor, 'open_qualification_proof', 'qualification', p_id, v_mime);
  RETURN jsonb_build_object('proof_path', v_path, 'mime', v_mime, 'byte_size', v_size);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_qualification(
  p_id uuid,
  p_decision text,
  p_note text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.coach_qualifications;
BEGIN
  v_actor := public.admin_require(p_confirm);
  v_row := public.review_coach_qualification(p_id, p_decision, p_note);
  PERFORM public.admin_audit(v_actor, 'review_qualification', 'qualification', p_id, p_decision);
  RETURN jsonb_build_object('id', v_row.id, 'verification_status', v_row.verification_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_exercise_proposals()
RETURNS TABLE (
  id uuid,
  name text,
  muscles text,
  description text,
  suggestion_name_fr text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT r.id,
         r.name,
         coalesce(r.muscles, ''),
         left(coalesce(r.description, ''), 400),
         left(coalesce(r.ai_suggestion->>'name_fr', ''), 120),
         r.created_at
  FROM public.exercise_requests r
  WHERE r.status IN ('pending', 'processing')
  ORDER BY r.created_at, r.id
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_exercise_duplicates(p_limit integer DEFAULT 30)
RETURNS TABLE (left_id uuid, right_id uuid, left_name text, right_name text, score real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT * FROM public.list_exercise_duplicate_candidates(p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_match_exercise_proposal(
  p_id uuid,
  p_exercise uuid,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_status text;
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF NOT EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.id = p_exercise AND e.merged_into_id IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  UPDATE public.exercise_requests
    SET status = 'matched',
        result_exercise_id = p_exercise,
        updated_at = clock_timestamp()
  WHERE id = p_id
    AND status IN ('pending', 'processing')
    AND result_exercise_id IS NULL
  RETURNING status INTO v_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  PERFORM public.admin_audit(v_actor, 'match_exercise', 'exercise_request', p_id, p_exercise::text);
  RETURN jsonb_build_object('status', v_status, 'exercise_id', p_exercise, 'applied', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_exercise_proposal(
  p_id uuid,
  p_note text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  UPDATE public.exercise_requests
    SET status = 'rejected',
        error_message = left(v_note, 500),
        updated_at = clock_timestamp()
  WHERE id = p_id
    AND status IN ('pending', 'processing')
    AND result_exercise_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  PERFORM public.admin_audit(v_actor, 'reject_exercise', 'exercise_request', p_id, v_note);
  RETURN jsonb_build_object('status', 'rejected', 'applied', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_exercise_proposal(
  p_id uuid,
  p_name text,
  p_name_fr text,
  p_category text,
  p_equipment text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_name text := btrim(coalesce(p_name, ''));
  v_fr text := btrim(coalesce(p_name_fr, ''));
  v_norm text;
  v_fr_norm text;
  v_id uuid;
  v_muscles text;
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF p_category NOT IN ('compound', 'isolation', 'cardio', 'stretch', 'plyometric')
     OR p_equipment NOT IN ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other') THEN
    RAISE EXCEPTION 'invalid_exercise';
  END IF;
  v_norm := public.exercise_normalize_name(v_name);
  IF v_norm IS NULL OR length(v_norm) < 2 THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  SELECT coalesce(muscles, '') INTO v_muscles
  FROM public.exercise_requests
  WHERE id = p_id
    AND status IN ('pending', 'processing')
    AND result_exercise_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  IF public.resolve_exercise_catalog(v_name) IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_catalog';
  END IF;
  BEGIN
    INSERT INTO public.exercises (
      name, name_fr, primary_muscles, category, equipment, verified, created_by
    ) VALUES (
      v_name,
      v_fr,
      CASE WHEN btrim(v_muscles) = '' THEN '{}'::text[] ELSE ARRAY[left(btrim(v_muscles), 80)] END,
      p_category,
      p_equipment,
      true,
      NULL
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'name_taken';
  END;
  INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
  VALUES (v_id, v_name, 'und', v_norm, 'proposal');
  v_fr_norm := public.exercise_normalize_name(v_fr);
  IF v_fr_norm IS NOT NULL AND v_fr_norm IS DISTINCT FROM v_norm AND NOT EXISTS (
    SELECT 1 FROM public.exercise_aliases WHERE normalized = v_fr_norm
  ) THEN
    INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
    VALUES (v_id, v_fr, 'fr', v_fr_norm, 'proposal');
  END IF;
  UPDATE public.exercise_requests
    SET status = 'approved',
        result_exercise_id = v_id,
        updated_at = clock_timestamp()
  WHERE id = p_id;
  PERFORM public.admin_audit(v_actor, 'approve_exercise', 'exercise_request', p_id, v_id::text);
  RETURN jsonb_build_object('status', 'approved', 'exercise_id', v_id, 'applied', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_merge_exercises(
  p_winner uuid,
  p_loser uuid,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_result jsonb;
BEGIN
  v_actor := public.admin_require(p_confirm);
  v_result := public.merge_exercises(p_winner, p_loser, true);
  PERFORM public.admin_audit(v_actor, 'merge_exercises', 'exercise', p_loser, p_winner::text);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_problem_imports()
RETURNS TABLE (
  id uuid,
  kind text,
  status text,
  created_at timestamptz,
  row_count integer,
  error_count integer,
  ready_count integer,
  ignored_count integer,
  subject_kind text,
  coach_label text,
  error_codes text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT i.id, i.kind, i.status, i.created_at, i.row_count, i.error_count,
         i.ready_count, i.ignored_count,
         CASE WHEN i.provisional_dossier_id IS NULL THEN 'account' ELSE 'provisional' END,
         coalesce(left(p.full_name, 80), ''),
         coalesce((
           SELECT array_agg(DISTINCT r.error_code)
           FROM public.coach_import_rows r
           WHERE r.import_id = i.id
             AND r.error_code IS NOT NULL
         ), ARRAY[]::text[])
  FROM public.coach_imports i
  LEFT JOIN public.user_profiles p ON p.id = i.coach_id
  WHERE (i.status = 'failed' OR i.error_count > 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.platform_admin_audit a
      WHERE a.action = 'acknowledge_import'
        AND a.subject_id = i.id
    )
  ORDER BY i.created_at DESC, i.id
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_acknowledge_problem_import(
  p_id uuid,
  p_note text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
  v_status text;
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  SELECT i.status INTO v_status
  FROM public.coach_imports i
  WHERE i.id = p_id
    AND (i.status = 'failed' OR i.error_count > 0);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  PERFORM public.admin_audit(v_actor, 'acknowledge_import', 'import', p_id, v_note);
  RETURN jsonb_build_object('status', 'acknowledged', 'import_status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_open_reports()
RETURNS TABLE (
  id uuid,
  status text,
  subject_type text,
  category text,
  context text,
  directory_hold_active boolean,
  created_at timestamptz,
  target_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT r.id, r.status, r.subject_type, r.category, left(r.context, 500),
         r.directory_hold_active, r.created_at,
         coalesce(left(p.full_name, 80), '')
  FROM public.marketplace_reports r
  LEFT JOIN public.user_profiles p ON p.id = r.target_user_id
  WHERE r.status IN ('open', 'in_review')
  ORDER BY r.created_at, r.id
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_marketplace_report(
  p_report uuid,
  p_action text,
  p_note text,
  p_confirm boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text;
  v_row public.marketplace_reports;
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
BEGIN
  v_actor := public.admin_require(p_confirm);
  IF p_action NOT IN ('acknowledge', 'dismiss', 'resolve', 'suspend_directory', 'restore_directory') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF p_action <> 'acknowledge' AND v_note IS NULL THEN
    RAISE EXCEPTION 'review_note_required';
  END IF;
  v_row := public.review_marketplace_report(p_report, p_action, coalesce(v_note, ''));
  PERFORM public.admin_audit(v_actor, 'review_report', 'report', p_report, p_action);
  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'directory_hold_active', v_row.directory_hold_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_platform_operator(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_platform_operator(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_revoke_platform_operator(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_platform_operator(uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_operators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_operators() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_pending_qualifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_qualifications() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_open_qualification_proof(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_open_qualification_proof(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_review_qualification(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_qualification(uuid, text, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_exercise_proposals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_exercise_proposals() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_exercise_duplicates(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_exercise_duplicates(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_match_exercise_proposal(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_exercise_proposal(uuid, uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_reject_exercise_proposal(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_exercise_proposal(uuid, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_approve_exercise_proposal(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_exercise_proposal(uuid, text, text, text, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_merge_exercises(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_merge_exercises(uuid, uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_problem_imports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_problem_imports() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_acknowledge_problem_import(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_acknowledge_problem_import(uuid, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_open_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_open_reports() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_review_marketplace_report(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_marketplace_report(uuid, text, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_review_qualification(uuid, text, text, boolean) IS
  'Operator qualification review. Returns status only. Proof bytes stay in Storage and require a fresh audited open.';
COMMENT ON FUNCTION public.admin_merge_exercises(uuid, uuid, boolean) IS
  'Operator wrapper around merge_exercises. Does not rewrite written exercise names.';
COMMENT ON FUNCTION public.admin_list_problem_imports() IS
  'Failed or row-error imports. Omits filename, raw rows, mapping, and subject ids.';
COMMENT ON FUNCTION public.admin_list_open_reports() IS
  'Open marketplace reports for operators. Omits reporter identity.';
