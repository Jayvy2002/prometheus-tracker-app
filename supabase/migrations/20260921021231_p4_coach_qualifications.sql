-- P4.1: durable Coach qualifications. Verification is informational, never a
-- marketplace publish gate. No public coach reviews. Proof and internal review
-- fields stay on the owner surface only.

CREATE TABLE IF NOT EXISTS public.coach_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  qualification_type text NOT NULL CHECK (
    qualification_type IN ('certification', 'degree', 'license', 'continuing_education', 'other')
  ),
  issuer text NOT NULL CHECK (length(btrim(issuer)) BETWEEN 1 AND 160),
  declared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  proof_path text CHECK (proof_path IS NULL OR length(btrim(proof_path)) BETWEEN 1 AND 500),
  verification_status text NOT NULL DEFAULT 'declared' CHECK (
    verification_status IN ('declared', 'pending', 'verified', 'rejected', 'expired')
  ),
  verified_at timestamptz,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_ref text NOT NULL DEFAULT '',
  expires_on date,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    verification_status <> 'verified'
    OR verified_at IS NOT NULL
  ),
  CHECK (
    verification_status <> 'rejected'
    OR length(btrim(coalesce(review_note, ''))) > 0
  )
);

COMMENT ON TABLE public.coach_qualifications IS
  'Coach-declared credentials. verified is a Prometheus review badge, not a ranking and not required to coach or publish.';
COMMENT ON COLUMN public.coach_qualifications.proof_path IS
  'Private storage path owned by this coach and this qualification. Never part of the public badge surface.';
COMMENT ON COLUMN public.coach_qualifications.reviewer_ref IS
  'Durable review provenance (user:<uid> or role:<role>). Not a public field.';
COMMENT ON COLUMN public.coach_qualifications.review_note IS
  'Internal review note for the owner and reviewers. Not a public field.';

CREATE INDEX IF NOT EXISTS coach_qualifications_coach_idx
  ON public.coach_qualifications (coach_id, declared_at DESC, id);
CREATE INDEX IF NOT EXISTS coach_qualifications_review_idx
  ON public.coach_qualifications (verification_status, updated_at)
  WHERE verification_status = 'pending';

ALTER TABLE public.coach_qualifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_qualifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.coach_qualifications TO authenticated;
GRANT ALL ON TABLE public.coach_qualifications TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_audit_actor()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL THEN 'user:' || auth.uid()::text
    ELSE 'role:' || coalesce(
      nullif(auth.role(), ''),
      nullif(current_setting('request.jwt.claim.role', true), ''),
      session_user
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_audit_actor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_audit_actor() TO service_role;

COMMENT ON FUNCTION public.marketplace_audit_actor() IS
  'Durable actor reference for marketplace review. Does not trust a client-supplied identifier.';

CREATE OR REPLACE FUNCTION public.qualification_owned_proof_path(p_coach uuid, p_id uuid, p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_coach IS NOT NULL
    AND p_id IS NOT NULL
    AND p_path IS NOT NULL
    AND p_path ~ (
      '^'
      || p_coach::text
      || '/'
      || p_id::text
      || '/proof-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp)$'
    );
$$;

REVOKE ALL ON FUNCTION public.qualification_owned_proof_path(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualification_owned_proof_path(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.qualification_proof_object_exists(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_path IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'qualification-proofs'
        AND name = p_path
    );
$$;

REVOKE ALL ON FUNCTION public.qualification_proof_object_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualification_proof_object_exists(text) TO service_role;

COMMENT ON FUNCTION public.qualification_proof_object_exists(text) IS
  'True when the exact qualification-proofs object exists. Used by submit and withdraw fail-safe; not a public listing.';

-- Proof files are removed only via the Storage API (.remove()). Never SQL-DELETE
-- storage.objects: that leaves a physical orphan. withdraw_coach_qualification
-- refuses with proof_cleanup_required while any object remains under the
-- qualification prefix.

DROP FUNCTION IF EXISTS public.qualification_delete_proof_objects(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.qualification_effective_status(p_status text, p_expires_on date)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status = 'verified'
      AND p_expires_on IS NOT NULL
      AND p_expires_on < CURRENT_DATE THEN 'expired'
    ELSE p_status
  END;
$$;

REVOKE ALL ON FUNCTION public.qualification_effective_status(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualification_effective_status(text, date) TO authenticated, service_role;

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
      OR EXISTS (
        SELECT 1 FROM public.coach_profiles p
        WHERE p.coach_id = p_coach AND p.published
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.coach_qualifications q
      WHERE q.coach_id = p_coach
        AND public.qualification_effective_status(q.verification_status, q.expires_on) = 'verified'
    );
$$;

REVOKE ALL ON FUNCTION public.coach_has_verified_qualification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coach_has_verified_qualification(uuid) TO authenticated;

DROP POLICY IF EXISTS qualifications_read ON public.coach_qualifications;
CREATE POLICY qualifications_read ON public.coach_qualifications
  FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));

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
  JOIN public.coach_profiles p ON p.coach_id = q.coach_id
  WHERE q.coach_id = p_coach
    AND p.published
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
  JOIN public.coach_profiles p ON p.coach_id = q.coach_id
  WHERE p_coaches IS NOT NULL
    AND q.coach_id = ANY (p_coaches)
    AND p.published
    AND q.verification_status <> 'rejected'
  ORDER BY q.coach_id, q.declared_at DESC, q.id;
$$;

REVOKE ALL ON FUNCTION public.list_public_coach_qualifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_coach_qualifications(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_public_coach_qualification_cards(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_coach_qualification_cards(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.list_public_coach_qualifications(uuid) IS
  'Public qualification badge surface. Excludes proof_path, reviewer_id, reviewer_ref and review_note.';
COMMENT ON FUNCTION public.list_public_coach_qualification_cards(uuid[]) IS
  'Bulk public qualification badge surface for directory cards. Excludes proof and internal review fields.';

CREATE OR REPLACE FUNCTION public.declare_coach_qualification(
  p_title text,
  p_type text,
  p_issuer text,
  p_proof_path text DEFAULT NULL,
  p_expires_on date DEFAULT NULL
)
RETURNS public.coach_qualifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_qualifications;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM 1 FROM public.user_capabilities
    WHERE user_id = v_uid AND capability = 'coach'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coach_required'; END IF;
  IF (
    SELECT count(*) FROM public.coach_qualifications WHERE coach_id = v_uid
  ) >= 20 THEN
    RAISE EXCEPTION 'qualification_limit';
  END IF;
  INSERT INTO public.coach_qualifications (
    coach_id, title, qualification_type, issuer, proof_path, expires_on
  ) VALUES (
    v_uid,
    btrim(p_title),
    p_type,
    btrim(p_issuer),
    NULL,
    p_expires_on
  )
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_coach_qualification(
  p_id uuid,
  p_title text,
  p_type text,
  p_issuer text,
  p_proof_path text DEFAULT NULL,
  p_expires_on date DEFAULT NULL
)
RETURNS public.coach_qualifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_qualifications;
  v_path text := NULLIF(btrim(coalesce(p_proof_path, '')), '');
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM 1 FROM public.user_capabilities
    WHERE user_id = v_uid AND capability = 'coach'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coach_required'; END IF;
  SELECT * INTO v_result
  FROM public.coach_qualifications
  WHERE id = p_id AND coach_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_result.verification_status NOT IN ('declared', 'rejected') THEN
    RAISE EXCEPTION 'qualification_locked';
  END IF;
  IF v_path IS NOT NULL AND NOT public.qualification_owned_proof_path(v_uid, p_id, v_path) THEN
    RAISE EXCEPTION 'invalid_proof_path';
  END IF;
  UPDATE public.coach_qualifications SET
    title = btrim(p_title),
    qualification_type = p_type,
    issuer = btrim(p_issuer),
    proof_path = v_path,
    expires_on = p_expires_on,
    verification_status = 'declared',
    verified_at = NULL,
    reviewer_id = NULL,
    reviewer_ref = '',
    review_note = NULL,
    updated_at = clock_timestamp()
  WHERE id = p_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_coach_qualification(p_id uuid)
RETURNS public.coach_qualifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_qualifications;
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM 1 FROM public.user_capabilities
    WHERE user_id = v_uid AND capability = 'coach'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coach_required'; END IF;
  SELECT * INTO v_result
  FROM public.coach_qualifications
  WHERE id = p_id AND coach_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_result.verification_status NOT IN ('declared', 'rejected') THEN
    RAISE EXCEPTION 'qualification_locked';
  END IF;
  IF v_result.proof_path IS NULL THEN
    RAISE EXCEPTION 'proof_required';
  END IF;
  IF NOT public.qualification_owned_proof_path(v_uid, p_id, v_result.proof_path) THEN
    RAISE EXCEPTION 'invalid_proof_path';
  END IF;
  IF NOT public.qualification_proof_object_exists(v_result.proof_path) THEN
    RAISE EXCEPTION 'proof_missing';
  END IF;
  UPDATE public.coach_qualifications SET
    verification_status = 'pending',
    verified_at = NULL,
    reviewer_id = NULL,
    reviewer_ref = '',
    review_note = NULL,
    updated_at = clock_timestamp()
  WHERE id = p_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_coach_qualification(p_id uuid)
RETURNS public.coach_qualifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_qualifications;
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM 1 FROM public.user_capabilities
    WHERE user_id = v_uid AND capability = 'coach'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coach_required'; END IF;
  SELECT * INTO v_result
  FROM public.coach_qualifications
  WHERE id = p_id AND coach_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_result.verification_status IN ('verified', 'expired') THEN
    RAISE EXCEPTION 'qualification_locked';
  END IF;
  IF v_result.verification_status = 'pending' THEN
    UPDATE public.coach_qualifications SET
      verification_status = 'declared',
      updated_at = clock_timestamp()
    WHERE id = p_id
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'qualification-proofs'
      AND (
        (v_result.proof_path IS NOT NULL AND name = v_result.proof_path)
        OR name LIKE (v_uid::text || '/' || p_id::text || '/%')
      )
  ) THEN
    RAISE EXCEPTION 'proof_cleanup_required';
  END IF;
  DELETE FROM public.coach_qualifications WHERE id = p_id RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

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
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
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

REVOKE ALL ON FUNCTION public.declare_coach_qualification(text, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.declare_coach_qualification(text, text, text, text, date) TO authenticated;
REVOKE ALL ON FUNCTION public.save_coach_qualification(uuid, text, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_coach_qualification(uuid, text, text, text, text, date) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_coach_qualification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_coach_qualification(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.withdraw_coach_qualification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_coach_qualification(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.review_coach_qualification(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_coach_qualification(uuid, text, text) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qualification-proofs',
  'qualification-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Coaches upload qualification proofs" ON storage.objects;
DROP POLICY IF EXISTS "Coaches update qualification proofs" ON storage.objects;
DROP POLICY IF EXISTS "Coaches delete qualification proofs" ON storage.objects;
DROP POLICY IF EXISTS "Coaches read own qualification proofs" ON storage.objects;

CREATE POLICY "Coaches upload qualification proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qualification-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.coach_qualifications q
      WHERE q.id::text = (storage.foldername(name))[2]
        AND q.coach_id = (SELECT auth.uid())
        AND q.verification_status IN ('declared', 'rejected')
    )
    AND storage.filename(name) ~ '^proof-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp)$'
  );

CREATE POLICY "Coaches delete qualification proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'qualification-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.coach_qualifications q
      WHERE q.id::text = (storage.foldername(name))[2]
        AND q.coach_id = (SELECT auth.uid())
        AND q.verification_status IN ('declared', 'rejected')
    )
  );

CREATE POLICY "Coaches read own qualification proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'qualification-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.coach_qualifications q
      WHERE q.id::text = (storage.foldername(name))[2]
        AND q.coach_id = (SELECT auth.uid())
    )
  );
