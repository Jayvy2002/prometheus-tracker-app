-- P4.1: durable Coach qualifications. Verification is informational, never a
-- marketplace publish gate. No public coach reviews.

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

CREATE INDEX IF NOT EXISTS coach_qualifications_coach_idx
  ON public.coach_qualifications (coach_id, declared_at DESC, id);
CREATE INDEX IF NOT EXISTS coach_qualifications_review_idx
  ON public.coach_qualifications (verification_status, updated_at)
  WHERE verification_status = 'pending';

ALTER TABLE public.coach_qualifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_qualifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.coach_qualifications TO authenticated;
GRANT ALL ON TABLE public.coach_qualifications TO service_role;

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
  USING (
    coach_id = (SELECT auth.uid())
    OR (
      verification_status <> 'rejected'
      AND EXISTS (
        SELECT 1 FROM public.coach_profiles p
        WHERE p.coach_id = coach_qualifications.coach_id
          AND p.published
      )
    )
  );

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
    NULLIF(btrim(coalesce(p_proof_path, '')), ''),
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
  UPDATE public.coach_qualifications SET
    title = btrim(p_title),
    qualification_type = p_type,
    issuer = btrim(p_issuer),
    proof_path = NULLIF(btrim(coalesce(p_proof_path, '')), ''),
    expires_on = p_expires_on,
    verification_status = 'declared',
    verified_at = NULL,
    reviewer_id = NULL,
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
  UPDATE public.coach_qualifications SET
    verification_status = 'pending',
    verified_at = NULL,
    reviewer_id = NULL,
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
  );

CREATE POLICY "Coaches update qualification proofs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'qualification-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'qualification-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Coaches delete qualification proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'qualification-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Coaches read own qualification proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'qualification-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
