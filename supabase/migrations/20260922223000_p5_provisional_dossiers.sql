-- P5.2 provisional client dossier. No Auth user is created. coach_client_links
-- stay unused until the athlete explicitly accepts coaching. Imported rows
-- stay in provisional tables until confirm_provisional_claim copies them.

CREATE TABLE IF NOT EXISTS public.coach_provisional_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('preparing', 'invited', 'attached', 'revoked')),
  attached_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  attached_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT coach_provisional_dossiers_attach_ck CHECK (
    (status = 'attached' AND attached_user_id IS NOT NULL AND attached_at IS NOT NULL)
    OR (status <> 'attached' AND attached_user_id IS NULL AND attached_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS coach_provisional_dossiers_coach_idx
  ON public.coach_provisional_dossiers (coach_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.coach_provisional_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.coach_provisional_dossiers(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (
    email = lower(email)
    AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'revoked', 'consumed', 'expired')),
  expires_at timestamptz NOT NULL,
  consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT coach_provisional_invites_consume_ck CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL)
    OR (status <> 'consumed' AND consumed_at IS NULL AND consumed_by IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_provisional_invites_one_pending
  ON public.coach_provisional_invites (dossier_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.coach_provisional_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.coach_provisional_dossiers(id) ON DELETE CASCADE,
  import_id uuid REFERENCES public.coach_imports(id) ON DELETE SET NULL,
  name text NOT NULL,
  performed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.coach_provisional_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.coach_provisional_workouts(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL,
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.coach_provisional_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.coach_provisional_exercises(id) ON DELETE CASCADE,
  set_type text NOT NULL DEFAULT 'working',
  weight_kg numeric,
  reps integer,
  rir integer,
  completed boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.coach_provisional_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.coach_provisional_dossiers(id) ON DELETE CASCADE,
  import_id uuid REFERENCES public.coach_imports(id) ON DELETE SET NULL,
  weight_kg numeric NOT NULL,
  measured_at date NOT NULL,
  notes text,
  UNIQUE (dossier_id, measured_at)
);

CREATE TABLE IF NOT EXISTS public.coach_provisional_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid UNIQUE REFERENCES public.coach_provisional_dossiers(id) ON DELETE SET NULL,
  coach_ref text NOT NULL CHECK (coach_ref ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_id uuid,
  email text NOT NULL,
  workout_count integer NOT NULL CHECK (workout_count >= 0),
  weight_count integer NOT NULL CHECK (weight_count >= 0),
  skipped_weight_count integer NOT NULL DEFAULT 0 CHECK (skipped_weight_count >= 0),
  coaching_status text NOT NULL CHECK (
    coaching_status IN ('not_requested', 'active', 'already_coached', 'coach_unavailable', 'invalid_target')
  ),
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.coach_provisional_claim_workouts (
  claim_id uuid NOT NULL REFERENCES public.coach_provisional_claims(id) ON DELETE CASCADE,
  provisional_workout_id uuid NOT NULL,
  workout_id uuid REFERENCES public.workouts(id) ON DELETE SET NULL,
  source_name text NOT NULL,
  source_performed_at timestamptz NOT NULL,
  PRIMARY KEY (claim_id, provisional_workout_id)
);

CREATE TABLE IF NOT EXISTS public.coach_provisional_claim_weights (
  claim_id uuid NOT NULL REFERENCES public.coach_provisional_claims(id) ON DELETE CASCADE,
  provisional_weight_id uuid NOT NULL,
  weight_id uuid REFERENCES public.weight_measurements(id) ON DELETE SET NULL,
  measured_at date NOT NULL,
  applied boolean NOT NULL,
  PRIMARY KEY (claim_id, provisional_weight_id)
);

ALTER TABLE public.coach_imports
  ADD COLUMN IF NOT EXISTS provisional_dossier_id uuid REFERENCES public.coach_provisional_dossiers(id) ON DELETE CASCADE;

ALTER TABLE public.coach_imports
  ALTER COLUMN subject_user_id DROP NOT NULL;

ALTER TABLE public.coach_imports
  DROP CONSTRAINT IF EXISTS coach_imports_subject_xor_dossier;

ALTER TABLE public.coach_imports
  ADD CONSTRAINT coach_imports_subject_xor_dossier CHECK (
    (subject_user_id IS NOT NULL AND provisional_dossier_id IS NULL)
    OR (subject_user_id IS NULL AND provisional_dossier_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS coach_imports_dossier_fingerprint_idx
  ON public.coach_imports (coach_id, provisional_dossier_id, file_sha256, mapping_hash)
  WHERE status IN ('previewed', 'committed') AND provisional_dossier_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coach_imports_dossier_source_idx
  ON public.coach_imports (provisional_dossier_id, file_sha256)
  WHERE status = 'committed' AND provisional_dossier_id IS NOT NULL;

ALTER TABLE public.coach_import_rows
  ADD COLUMN IF NOT EXISTS applied_provisional_workout_id uuid
  REFERENCES public.coach_provisional_workouts(id) ON DELETE SET NULL;

ALTER TABLE public.coach_provisional_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_claim_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_provisional_claim_weights ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.coach_provisional_dossiers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_invites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_workouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_exercises FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_sets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_weights FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_claim_workouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coach_provisional_claim_weights FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.coach_provisional_dossiers TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_invites TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_workouts TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_exercises TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_sets TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_weights TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_claims TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_claim_workouts TO authenticated, service_role;
GRANT SELECT ON TABLE public.coach_provisional_claim_weights TO authenticated, service_role;
GRANT ALL ON TABLE public.coach_provisional_dossiers TO service_role;
GRANT ALL ON TABLE public.coach_provisional_invites TO service_role;
GRANT ALL ON TABLE public.coach_provisional_workouts TO service_role;
GRANT ALL ON TABLE public.coach_provisional_exercises TO service_role;
GRANT ALL ON TABLE public.coach_provisional_sets TO service_role;
GRANT ALL ON TABLE public.coach_provisional_weights TO service_role;
GRANT ALL ON TABLE public.coach_provisional_claims TO service_role;
GRANT ALL ON TABLE public.coach_provisional_claim_workouts TO service_role;
GRANT ALL ON TABLE public.coach_provisional_claim_weights TO service_role;

DROP POLICY IF EXISTS coach_provisional_dossiers_select ON public.coach_provisional_dossiers;
CREATE POLICY coach_provisional_dossiers_select ON public.coach_provisional_dossiers
  FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS coach_provisional_invites_select ON public.coach_provisional_invites;
CREATE POLICY coach_provisional_invites_select ON public.coach_provisional_invites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_provisional_dossiers d
      WHERE d.id = dossier_id AND d.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS coach_provisional_workouts_select ON public.coach_provisional_workouts;
CREATE POLICY coach_provisional_workouts_select ON public.coach_provisional_workouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_provisional_dossiers d
      WHERE d.id = dossier_id AND d.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS coach_provisional_exercises_select ON public.coach_provisional_exercises;
CREATE POLICY coach_provisional_exercises_select ON public.coach_provisional_exercises
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_provisional_workouts w
      JOIN public.coach_provisional_dossiers d ON d.id = w.dossier_id
      WHERE w.id = workout_id AND d.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS coach_provisional_sets_select ON public.coach_provisional_sets;
CREATE POLICY coach_provisional_sets_select ON public.coach_provisional_sets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_provisional_exercises e
      JOIN public.coach_provisional_workouts w ON w.id = e.workout_id
      JOIN public.coach_provisional_dossiers d ON d.id = w.dossier_id
      WHERE e.id = exercise_id AND d.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS coach_provisional_weights_select ON public.coach_provisional_weights;
CREATE POLICY coach_provisional_weights_select ON public.coach_provisional_weights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_provisional_dossiers d
      WHERE d.id = dossier_id AND d.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS coach_provisional_claims_select ON public.coach_provisional_claims;
CREATE POLICY coach_provisional_claims_select ON public.coach_provisional_claims
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR coach_ref = 'user:' || (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS coach_provisional_claim_workouts_select ON public.coach_provisional_claim_workouts;
CREATE POLICY coach_provisional_claim_workouts_select ON public.coach_provisional_claim_workouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_provisional_claims c
      WHERE c.id = claim_id
        AND (
          c.user_id = (SELECT auth.uid())
          OR c.coach_ref = 'user:' || (SELECT auth.uid())::text
        )
    )
  );

DROP POLICY IF EXISTS coach_provisional_claim_weights_select ON public.coach_provisional_claim_weights;
CREATE POLICY coach_provisional_claim_weights_select ON public.coach_provisional_claim_weights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_provisional_claims c
      WHERE c.id = claim_id
        AND (
          c.user_id = (SELECT auth.uid())
          OR c.coach_ref = 'user:' || (SELECT auth.uid())::text
        )
    )
  );

DROP POLICY IF EXISTS coach_imports_select ON public.coach_imports;
CREATE POLICY coach_imports_select ON public.coach_imports
  FOR SELECT TO authenticated
  USING (
    coach_id = (SELECT auth.uid())
    AND (
      subject_user_id = (SELECT auth.uid())
      OR (
        subject_user_id IS NOT NULL
        AND public.is_coach_of(subject_user_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.coach_provisional_dossiers d
        WHERE d.id = provisional_dossier_id
          AND d.coach_id = (SELECT auth.uid())
      )
    )
  );

CREATE OR REPLACE FUNCTION public.lock_coach_import_provisional(p_dossier uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_dossier IS NULL THEN
    RAISE EXCEPTION 'invalid_subject';
  END IF;
  PERFORM pg_advisory_xact_lock(20014507, pg_catalog.hashtext(p_dossier::text));
END;
$$;

REVOKE ALL ON FUNCTION public.lock_coach_import_provisional(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.lock_coach_import_provisional(uuid) IS
  'Commit and claim mutex for one provisional dossier. Class 20014507. Not the athlete mutex 20014506.';

CREATE OR REPLACE FUNCTION public.coach_import_assert_dossier(p_dossier uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_capabilities c
    WHERE c.user_id = v_uid AND c.capability = 'coach'
  ) THEN
    RAISE EXCEPTION 'coach_capability_required';
  END IF;
  IF p_dossier IS NULL THEN RAISE EXCEPTION 'invalid_subject'; END IF;
  PERFORM public.lock_coach_relationship_lifecycle(v_uid);
  IF NOT public.coach_relationship_is_open(v_uid) THEN
    RAISE EXCEPTION 'coach_account_closed';
  END IF;
  SELECT d.status, d.coach_id INTO v_status, v_owner
  FROM public.coach_provisional_dossiers d
  WHERE d.id = p_dossier;
  IF NOT FOUND OR v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_status NOT IN ('preparing', 'invited') THEN
    RAISE EXCEPTION 'dossier_closed';
  END IF;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_assert_dossier(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_require_open_coach()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_capabilities c
    WHERE c.user_id = v_uid AND c.capability = 'coach'
  ) THEN
    RAISE EXCEPTION 'coach_capability_required';
  END IF;
  PERFORM public.lock_coach_relationship_lifecycle(v_uid);
  IF NOT public.coach_relationship_is_open(v_uid) THEN
    RAISE EXCEPTION 'coach_account_closed';
  END IF;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_require_open_coach() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provisional_normalize_email(p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(v_email) > 200 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.provisional_normalize_email(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_provisional_dossier(p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_id uuid;
BEGIN
  v_uid := public.coach_require_open_coach();
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  INSERT INTO public.coach_provisional_dossiers (coach_id, display_name, status)
  VALUES (v_uid, v_name, 'preparing')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'display_name', v_name, 'status', 'preparing');
END;
$$;

REVOKE ALL ON FUNCTION public.create_provisional_dossier(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_provisional_dossier(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_provisional_dossiers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_capabilities c
    WHERE c.user_id = v_uid AND c.capability = 'coach'
  ) THEN
    RAISE EXCEPTION 'coach_capability_required';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        d.id,
        d.display_name,
        d.status,
        d.created_at,
        d.attached_at,
        (
          SELECT count(*) FROM public.coach_provisional_workouts w WHERE w.dossier_id = d.id
        ) AS workout_count,
        (
          SELECT count(*) FROM public.coach_provisional_weights w WHERE w.dossier_id = d.id
        ) AS weight_count,
        (
          SELECT i.email FROM public.coach_provisional_invites i
          WHERE i.dossier_id = d.id AND i.status = 'pending'
          LIMIT 1
        ) AS invite_email,
        (
          SELECT i.expires_at FROM public.coach_provisional_invites i
          WHERE i.dossier_id = d.id AND i.status = 'pending'
          LIMIT 1
        ) AS invite_expires_at
      FROM public.coach_provisional_dossiers d
      WHERE d.coach_id = v_uid
      ORDER BY d.created_at DESC
      LIMIT 100
    ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_provisional_dossiers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_provisional_dossiers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_provisional_dossier(p_dossier uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_status text;
BEGIN
  v_uid := public.coach_require_open_coach();
  PERFORM public.lock_coach_import_provisional(p_dossier);
  SELECT status INTO v_status
  FROM public.coach_provisional_dossiers
  WHERE id = p_dossier AND coach_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status = 'attached' THEN RAISE EXCEPTION 'dossier_attached'; END IF;
  IF v_status = 'revoked' THEN
    RETURN jsonb_build_object('id', p_dossier, 'status', 'revoked');
  END IF;
  UPDATE public.coach_provisional_invites
     SET status = 'revoked'
   WHERE dossier_id = p_dossier AND status = 'pending';
  UPDATE public.coach_provisional_dossiers
     SET status = 'revoked', updated_at = clock_timestamp()
   WHERE id = p_dossier;
  RETURN jsonb_build_object('id', p_dossier, 'status', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_provisional_dossier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_provisional_dossier(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_provisional_dossier(p_dossier uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_status text;
BEGIN
  v_uid := public.coach_require_open_coach();
  PERFORM public.lock_coach_import_provisional(p_dossier);
  SELECT status INTO v_status
  FROM public.coach_provisional_dossiers
  WHERE id = p_dossier AND coach_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status = 'attached' THEN RAISE EXCEPTION 'dossier_attached'; END IF;
  DELETE FROM public.coach_provisional_dossiers WHERE id = p_dossier;
  RETURN jsonb_build_object('id', p_dossier, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_provisional_dossier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_provisional_dossier(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invite_provisional_dossier(p_dossier uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_status text;
  v_email text;
  v_token text;
  v_hash text;
  v_expires timestamptz;
BEGIN
  v_uid := public.coach_import_assert_dossier(p_dossier);
  v_email := public.provisional_normalize_email(p_email);
  PERFORM public.lock_coach_import_provisional(p_dossier);
  SELECT status INTO v_status
  FROM public.coach_provisional_dossiers
  WHERE id = p_dossier AND coach_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status NOT IN ('preparing', 'invited') THEN
    RAISE EXCEPTION 'dossier_closed';
  END IF;
  UPDATE public.coach_provisional_invites
     SET status = 'revoked'
   WHERE dossier_id = p_dossier AND status = 'pending';
  v_token := encode(
    pg_catalog.sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')),
    'hex'
  );
  v_hash := public.coach_import_sha256(v_token);
  v_expires := clock_timestamp() + interval '14 days';
  INSERT INTO public.coach_provisional_invites (dossier_id, email, token_hash, status, expires_at)
  VALUES (p_dossier, v_email, v_hash, 'pending', v_expires);
  UPDATE public.coach_provisional_dossiers
     SET status = 'invited', updated_at = clock_timestamp()
   WHERE id = p_dossier;
  RETURN jsonb_build_object(
    'dossier_id', p_dossier,
    'email', v_email,
    'expires_at', v_expires,
    'token', v_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_provisional_dossier(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_provisional_dossier(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_provisional_invite(p_dossier uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_status text;
BEGIN
  v_uid := public.coach_require_open_coach();
  PERFORM public.lock_coach_import_provisional(p_dossier);
  SELECT status INTO v_status
  FROM public.coach_provisional_dossiers
  WHERE id = p_dossier AND coach_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_status = 'attached' THEN RAISE EXCEPTION 'dossier_attached'; END IF;
  UPDATE public.coach_provisional_invites
     SET status = 'revoked'
   WHERE dossier_id = p_dossier AND status = 'pending';
  IF v_status = 'invited' THEN
    UPDATE public.coach_provisional_dossiers
       SET status = 'preparing', updated_at = clock_timestamp()
     WHERE id = p_dossier;
    v_status := 'preparing';
  END IF;
  RETURN jsonb_build_object('id', p_dossier, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_provisional_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_provisional_invite(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provisional_caller_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT lower(btrim(email)) FROM auth.users WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.provisional_caller_email() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provisional_claim_summary(p_claim public.coach_provisional_claims)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'already_attached', true,
    'claim_id', p_claim.id,
    'dossier_id', p_claim.dossier_id,
    'workout_count', p_claim.workout_count,
    'weight_count', p_claim.weight_count,
    'skipped_weight_count', p_claim.skipped_weight_count,
    'coaching_status', p_claim.coaching_status
  );
$$;

REVOKE ALL ON FUNCTION public.provisional_claim_summary(public.coach_provisional_claims) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_provisional_claim(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_invite public.coach_provisional_invites;
  v_dossier public.coach_provisional_dossiers;
  v_email text;
  v_coach_name text;
  v_sessions jsonb;
  v_weights jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_token IS NULL OR char_length(btrim(p_token)) < 32 THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  v_hash := public.coach_import_sha256(btrim(p_token));
  SELECT * INTO v_invite FROM public.coach_provisional_invites WHERE token_hash = v_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  PERFORM public.lock_coach_import_provisional(v_invite.dossier_id);
  SELECT * INTO v_dossier
  FROM public.coach_provisional_dossiers
  WHERE id = v_invite.dossier_id
  FOR UPDATE;
  SELECT * INTO v_invite
  FROM public.coach_provisional_invites
  WHERE id = v_invite.id
  FOR UPDATE;
  IF v_dossier.status = 'attached' AND v_dossier.attached_user_id = v_uid THEN
    RETURN (
      SELECT public.provisional_claim_summary(c)
      FROM public.coach_provisional_claims c
      WHERE c.dossier_id = v_dossier.id
    );
  END IF;
  IF v_invite.status = 'revoked' OR v_dossier.status = 'revoked' THEN
    RAISE EXCEPTION 'invite_revoked';
  END IF;
  IF v_invite.status = 'expired' OR v_invite.expires_at <= clock_timestamp() THEN
    IF v_invite.status = 'pending' THEN
      UPDATE public.coach_provisional_invites SET status = 'expired' WHERE id = v_invite.id;
    END IF;
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF v_invite.status <> 'pending' OR v_dossier.status NOT IN ('preparing', 'invited') THEN
    RAISE EXCEPTION 'invite_consumed';
  END IF;
  v_email := public.provisional_caller_email();
  IF v_email IS NULL OR v_email IS DISTINCT FROM v_invite.email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;
  SELECT coalesce(nullif(btrim(p.full_name), ''), '') INTO v_coach_name
  FROM public.user_profiles p
  WHERE p.id = v_dossier.coach_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', q.civil,
    'name', q.name,
    'exercises', q.exercises
  ) ORDER BY q.civil, q.name), '[]'::jsonb)
  INTO v_sessions
  FROM (
    SELECT
      (w.performed_at AT TIME ZONE 'UTC')::date AS civil,
      w.name,
      coalesce((
        SELECT jsonb_agg(e.name ORDER BY e.order_index)
        FROM public.coach_provisional_exercises e
        WHERE e.workout_id = w.id
      ), '[]'::jsonb) AS exercises
    FROM public.coach_provisional_workouts w
    WHERE w.dossier_id = v_dossier.id
  ) q;
  SELECT coalesce(jsonb_agg(w.measured_at ORDER BY w.measured_at), '[]'::jsonb)
  INTO v_weights
  FROM public.coach_provisional_weights w
  WHERE w.dossier_id = v_dossier.id;
  RETURN jsonb_build_object(
    'ok', true,
    'already_attached', false,
    'dossier_id', v_dossier.id,
    'display_name', v_dossier.display_name,
    'coach_name', coalesce(v_coach_name, ''),
    'workout_count', jsonb_array_length(v_sessions),
    'weight_count', jsonb_array_length(v_weights),
    'sessions', v_sessions,
    'weight_dates', v_weights
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_provisional_claim(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_provisional_claim(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_provisional_claim(
  p_token text,
  p_accept_data boolean,
  p_accept_coaching boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_invite public.coach_provisional_invites;
  v_dossier public.coach_provisional_dossiers;
  v_email text;
  v_claim public.coach_provisional_claims;
  v_src public.coach_provisional_workouts;
  v_ex public.coach_provisional_exercises;
  v_wid uuid;
  v_eid uuid;
  v_weight public.coach_provisional_weights;
  v_weight_id uuid;
  v_workouts integer := 0;
  v_weights integer := 0;
  v_skipped integer := 0;
  v_coaching text := 'not_requested';
  v_claim_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_token IS NULL OR char_length(btrim(p_token)) < 32 THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  v_hash := public.coach_import_sha256(btrim(p_token));
  SELECT * INTO v_invite FROM public.coach_provisional_invites WHERE token_hash = v_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  PERFORM public.lock_coach_import_provisional(v_invite.dossier_id);
  SELECT * INTO v_dossier
  FROM public.coach_provisional_dossiers
  WHERE id = v_invite.dossier_id
  FOR UPDATE;
  SELECT * INTO v_invite FROM public.coach_provisional_invites WHERE id = v_invite.id FOR UPDATE;
  IF v_dossier.status = 'attached' THEN
    IF v_dossier.attached_user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'invite_consumed';
    END IF;
    SELECT * INTO v_claim FROM public.coach_provisional_claims WHERE dossier_id = v_dossier.id;
    RETURN public.provisional_claim_summary(v_claim);
  END IF;
  IF coalesce(p_accept_data, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  IF v_invite.status = 'revoked' OR v_dossier.status = 'revoked' THEN
    RAISE EXCEPTION 'invite_revoked';
  END IF;
  IF v_invite.status = 'expired' OR v_invite.expires_at <= clock_timestamp() THEN
    IF v_invite.status = 'pending' THEN
      UPDATE public.coach_provisional_invites SET status = 'expired' WHERE id = v_invite.id;
    END IF;
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_consumed';
  END IF;
  v_email := public.provisional_caller_email();
  IF v_email IS NULL OR v_email IS DISTINCT FROM v_invite.email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  v_claim_id := gen_random_uuid();
  INSERT INTO public.coach_provisional_claims (
    id, dossier_id, coach_ref, user_id, invite_id, email,
    workout_count, weight_count, skipped_weight_count, coaching_status
  ) VALUES (
    v_claim_id, v_dossier.id, 'user:' || v_dossier.coach_id::text, v_uid, v_invite.id, v_email,
    0, 0, 0, 'not_requested'
  );

  FOR v_src IN
    SELECT * FROM public.coach_provisional_workouts
    WHERE dossier_id = v_dossier.id
    ORDER BY performed_at, id
    FOR UPDATE
  LOOP
    INSERT INTO public.workouts (user_id, name, date, completed, notes)
    VALUES (v_uid, v_src.name, v_src.performed_at, true, '')
    RETURNING id INTO v_wid;
    FOR v_ex IN
      SELECT * FROM public.coach_provisional_exercises
      WHERE workout_id = v_src.id
      ORDER BY order_index, id
    LOOP
      INSERT INTO public.workout_exercises (workout_id, name, order_index, notes)
      VALUES (v_wid, v_ex.name, v_ex.order_index, v_ex.notes)
      RETURNING id INTO v_eid;
      INSERT INTO public.workout_sets (
        exercise_id, set_type, weight_kg, reps, rir, completed, order_index
      )
      SELECT v_eid, s.set_type, s.weight_kg, s.reps, s.rir, s.completed, s.order_index
      FROM public.coach_provisional_sets s
      WHERE s.exercise_id = v_ex.id
      ORDER BY s.order_index;
    END LOOP;
    INSERT INTO public.coach_provisional_claim_workouts (
      claim_id, provisional_workout_id, workout_id, source_name, source_performed_at
    ) VALUES (v_claim_id, v_src.id, v_wid, v_src.name, v_src.performed_at);
    v_workouts := v_workouts + 1;
  END LOOP;

  FOR v_weight IN
    SELECT * FROM public.coach_provisional_weights
    WHERE dossier_id = v_dossier.id
    ORDER BY measured_at
    FOR UPDATE
  LOOP
    BEGIN
      INSERT INTO public.weight_measurements (user_id, weight_kg, measured_at, notes)
      VALUES (v_uid, v_weight.weight_kg, v_weight.measured_at, coalesce(v_weight.notes, ''))
      RETURNING id INTO v_weight_id;
      INSERT INTO public.coach_provisional_claim_weights (
        claim_id, provisional_weight_id, weight_id, measured_at, applied
      ) VALUES (v_claim_id, v_weight.id, v_weight_id, v_weight.measured_at, true);
      v_weights := v_weights + 1;
    EXCEPTION
      WHEN unique_violation THEN
        INSERT INTO public.coach_provisional_claim_weights (
          claim_id, provisional_weight_id, weight_id, measured_at, applied
        ) VALUES (v_claim_id, v_weight.id, NULL, v_weight.measured_at, false);
        v_skipped := v_skipped + 1;
    END;
  END LOOP;

  IF coalesce(p_accept_coaching, false) THEN
    BEGIN
      PERFORM public.activate_coaching_relationship(v_dossier.coach_id, v_uid);
      v_coaching := 'active';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM IN ('already_coached', 'coach_unavailable', 'invalid_target') THEN
          v_coaching := SQLERRM;
        ELSE
          RAISE;
        END IF;
    END;
  END IF;

  UPDATE public.coach_provisional_claims
     SET workout_count = v_workouts,
         weight_count = v_weights,
         skipped_weight_count = v_skipped,
         coaching_status = v_coaching
   WHERE id = v_claim_id
   RETURNING * INTO v_claim;
  UPDATE public.coach_provisional_invites
     SET status = 'consumed', consumed_by = v_uid, consumed_at = clock_timestamp()
   WHERE id = v_invite.id;
  UPDATE public.coach_provisional_dossiers
     SET status = 'attached',
         attached_user_id = v_uid,
         attached_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = v_dossier.id;
  RETURN public.provisional_claim_summary(v_claim);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_provisional_claim(text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_provisional_claim(text, boolean, boolean) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.coach_import_finish_subject_conflict(
  p_uid uuid,
  p_subject uuid,
  p_dossier uuid,
  p_key text,
  p_hash text,
  p_map_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_row public.coach_imports;
BEGIN
  IF p_dossier IS NULL AND p_subject IS DISTINCT FROM p_uid THEN
    PERFORM public.lock_coach_relationship_lifecycle(p_uid);
  END IF;
  SELECT id INTO v_id
  FROM public.coach_imports
  WHERE coach_id = p_uid AND idempotency_key = p_key;
  IF FOUND THEN
    PERFORM public.lock_coach_import(v_id);
    SELECT * INTO v_row FROM public.coach_imports WHERE id = v_id FOR UPDATE;
    IF NOT FOUND
       OR v_row.subject_user_id IS DISTINCT FROM p_subject
       OR v_row.provisional_dossier_id IS DISTINCT FROM p_dossier THEN
      RAISE EXCEPTION 'import_conflict';
    END IF;
    IF v_row.status = 'committed' THEN
      IF v_row.file_sha256 = p_hash AND v_row.mapping_hash = p_map_hash THEN
        RETURN public.coach_import_view(v_row);
      END IF;
      RAISE EXCEPTION 'import_conflict';
    END IF;
    IF v_row.file_sha256 IS DISTINCT FROM p_hash THEN
      RAISE EXCEPTION 'file_changed';
    END IF;
    IF v_row.mapping_hash = p_map_hash THEN
      RETURN public.coach_import_view(v_row);
    END IF;
    RAISE EXCEPTION 'import_conflict';
  END IF;
  SELECT id INTO v_id
  FROM public.coach_imports
  WHERE coach_id = p_uid
    AND file_sha256 = p_hash
    AND mapping_hash = p_map_hash
    AND status IN ('previewed', 'committed')
    AND (
      (p_dossier IS NULL AND subject_user_id = p_subject)
      OR (p_dossier IS NOT NULL AND provisional_dossier_id = p_dossier)
    );
  IF FOUND THEN
    PERFORM public.lock_coach_import(v_id);
    SELECT * INTO v_row FROM public.coach_imports WHERE id = v_id FOR UPDATE;
    IF FOUND
       AND v_row.subject_user_id IS NOT DISTINCT FROM p_subject
       AND v_row.provisional_dossier_id IS NOT DISTINCT FROM p_dossier
       AND v_row.file_sha256 = p_hash
       AND v_row.mapping_hash = p_map_hash
       AND v_row.status IN ('previewed', 'committed') THEN
      RETURN public.coach_import_view(v_row);
    END IF;
  END IF;
  RAISE EXCEPTION 'import_conflict';
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_finish_subject_conflict(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_actor_can_read(p_import public.coach_imports)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_import.coach_id IS NOT NULL
    AND p_import.coach_id = auth.uid()
    AND (
      p_import.subject_user_id = auth.uid()
      OR (
        p_import.subject_user_id IS NOT NULL
        AND public.is_coach_of(p_import.subject_user_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.coach_provisional_dossiers d
        WHERE d.id = p_import.provisional_dossier_id
          AND d.coach_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.coach_import_actor_can_read(public.coach_imports) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_import_duplicate_report(p_import public.coach_imports)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'workout_id', q.id,
      'name', q.name,
      'date', q.civil
    ) ORDER BY q.civil, q.name)
    FROM (
      SELECT DISTINCT w.id, w.name, (w.date AT TIME ZONE 'UTC')::date AS civil
      FROM public.workouts w
      WHERE p_import.provisional_dossier_id IS NULL
        AND p_import.kind = 'workout'
        AND w.user_id = p_import.subject_user_id
        AND NOT EXISTS (
          SELECT 1 FROM public.coach_import_rows own
          WHERE own.import_id = p_import.id
            AND own.applied_workout_id = w.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.coach_import_rows r
          WHERE r.import_id = p_import.id
            AND r.status IN ('ready', 'applied')
            AND (r.planned->>'date')::date = (w.date AT TIME ZONE 'UTC')::date
            AND (
              lower(btrim(w.name)) = lower(btrim(coalesce(
                nullif(btrim(r.planned->>'session_name'), ''),
                to_char((r.planned->>'date')::date, 'YYYY-MM-DD')
              )))
              OR EXISTS (
                SELECT 1 FROM public.workout_exercises e
                WHERE e.workout_id = w.id
                  AND lower(btrim(e.name)) = lower(btrim(r.planned->>'exercise'))
              )
            )
        )
      UNION
      SELECT DISTINCT w.id, w.name, (w.performed_at AT TIME ZONE 'UTC')::date AS civil
      FROM public.coach_provisional_workouts w
      WHERE p_import.provisional_dossier_id IS NOT NULL
        AND p_import.kind = 'workout'
        AND w.dossier_id = p_import.provisional_dossier_id
        AND NOT EXISTS (
          SELECT 1 FROM public.coach_import_rows own
          WHERE own.import_id = p_import.id
            AND own.applied_provisional_workout_id = w.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.coach_import_rows r
          WHERE r.import_id = p_import.id
            AND r.status IN ('ready', 'applied')
            AND (r.planned->>'date')::date = (w.performed_at AT TIME ZONE 'UTC')::date
            AND (
              lower(btrim(w.name)) = lower(btrim(coalesce(
                nullif(btrim(r.planned->>'session_name'), ''),
                to_char((r.planned->>'date')::date, 'YYYY-MM-DD')
              )))
              OR EXISTS (
                SELECT 1 FROM public.coach_provisional_exercises e
                WHERE e.workout_id = w.id
                  AND lower(btrim(e.name)) = lower(btrim(r.planned->>'exercise'))
              )
            )
        )
    ) q
  ), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.coach_import_duplicate_report(public.coach_imports) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_coach_imports()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM public.coach_import_expire_previews(auth.uid());
  RETURN coalesce((
    SELECT jsonb_agg(public.coach_import_view(i, 0, 0, false) ORDER BY i.created_at DESC)
    FROM (
      SELECT * FROM public.coach_imports i
      WHERE i.coach_id = auth.uid()
        AND i.status IN ('previewed', 'committed')
        AND (
          i.subject_user_id = auth.uid()
          OR public.is_coach_of(i.subject_user_id)
          OR EXISTS (
            SELECT 1 FROM public.coach_provisional_dossiers d
            WHERE d.id = i.provisional_dossier_id AND d.coach_id = auth.uid()
          )
        )
      ORDER BY created_at DESC
      LIMIT 20
    ) i
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_coach_imports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_coach_imports() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_coach_import(
  p_subject_user_id uuid,
  p_filename text,
  p_source_text text,
  p_mapping jsonb,
  p_idempotency_key text,
  p_provisional_dossier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_dossier uuid;
  v_mapping jsonb;
  v_hash text;
  v_map_hash text;
  v_existing public.coach_imports;
  v_import public.coach_imports;
  v_parsed record;
  v_headers text[];
  v_plan jsonb;
  v_ready integer := 0;
  v_error integer := 0;
  v_ignored integer := 0;
  v_rows integer := 0;
  v_found uuid;
  v_new_id uuid;
  v_have boolean := false;
  v_self uuid := NULL;
  v_dup_hash text;
  v_key text := btrim(p_idempotency_key);
BEGIN
  IF p_provisional_dossier_id IS NOT NULL AND p_subject_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_subject';
  END IF;
  IF p_provisional_dossier_id IS NOT NULL THEN
    v_uid := public.coach_import_assert_dossier(p_provisional_dossier_id);
    v_dossier := p_provisional_dossier_id;
  ELSE
    v_uid := public.coach_import_assert_actor(p_subject_user_id);
    v_dossier := NULL;
  END IF;
  IF p_filename IS NULL OR char_length(btrim(p_filename)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_filename';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(v_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  v_mapping := public.coach_import_normalized_mapping(p_mapping);
  v_hash := public.coach_import_sha256(p_source_text);
  v_map_hash := public.coach_import_sha256(v_mapping::text);
  PERFORM public.coach_import_expire_previews(v_uid);

  SELECT id INTO v_found
  FROM public.coach_imports
  WHERE coach_id = v_uid AND idempotency_key = v_key;
  IF FOUND THEN
    PERFORM public.lock_coach_import(v_found);
    SELECT * INTO v_existing FROM public.coach_imports WHERE id = v_found FOR UPDATE;
    IF NOT FOUND THEN
      v_found := NULL;
    ELSIF v_existing.subject_user_id IS DISTINCT FROM p_subject_user_id
       OR v_existing.provisional_dossier_id IS DISTINCT FROM v_dossier THEN
      RAISE EXCEPTION 'import_conflict';
    ELSIF v_existing.status = 'committed' THEN
      IF v_existing.file_sha256 = v_hash AND v_existing.mapping_hash = v_map_hash THEN
        RETURN public.coach_import_view(v_existing);
      END IF;
      RAISE EXCEPTION 'import_conflict';
    ELSIF v_existing.status = 'previewed' AND v_existing.file_sha256 IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'file_changed';
    ELSE
      DELETE FROM public.coach_import_rows WHERE import_id = v_existing.id;
      v_import := v_existing;
      v_have := true;
    END IF;
  END IF;

  IF v_have THEN
    v_self := v_import.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_imports committed
    WHERE committed.file_sha256 = v_hash
      AND committed.status = 'committed'
      AND committed.id IS DISTINCT FROM v_self
      AND (
        (v_dossier IS NULL AND committed.subject_user_id = p_subject_user_id)
        OR (v_dossier IS NOT NULL AND committed.provisional_dossier_id = v_dossier)
      )
      AND NOT (
        committed.coach_id = v_uid
        AND committed.mapping_hash = v_map_hash
      )
  ) THEN
    RAISE EXCEPTION 'already_imported';
  END IF;

  IF NOT v_have THEN
    SELECT id INTO v_found
    FROM public.coach_imports
    WHERE coach_id = v_uid
      AND file_sha256 = v_hash
      AND mapping_hash = v_map_hash
      AND status IN ('previewed', 'committed')
      AND (
        (v_dossier IS NULL AND subject_user_id = p_subject_user_id)
        OR (v_dossier IS NOT NULL AND provisional_dossier_id = v_dossier)
      );
    IF FOUND THEN
      PERFORM public.lock_coach_import(v_found);
      SELECT * INTO v_existing FROM public.coach_imports WHERE id = v_found FOR UPDATE;
      IF FOUND
         AND v_existing.subject_user_id IS NOT DISTINCT FROM p_subject_user_id
       AND v_existing.provisional_dossier_id IS NOT DISTINCT FROM v_dossier
         AND v_existing.file_sha256 = v_hash
         AND v_existing.mapping_hash = v_map_hash
         AND v_existing.status IN ('previewed', 'committed') THEN
        RETURN public.coach_import_view(v_existing);
      END IF;
    END IF;
    PERFORM public.lock_coach_import_quota(v_uid);
    IF (
      SELECT count(*) FROM public.coach_imports
      WHERE coach_id = v_uid AND status = 'previewed'
    ) >= 20 THEN
      RAISE EXCEPTION 'preview_quota';
    END IF;
    v_new_id := gen_random_uuid();
    PERFORM public.lock_coach_import(v_new_id);
    INSERT INTO public.coach_imports (
      id, coach_id, coach_ref, subject_user_id, provisional_dossier_id, status, kind, filename, file_sha256,
      mapping, mapping_hash, idempotency_key, source_headers
    ) VALUES (
      v_new_id, v_uid, 'user:' || v_uid::text, p_subject_user_id, v_dossier, 'previewed', v_mapping->>'kind',
      btrim(p_filename), v_hash, v_mapping, v_map_hash, v_key, '[]'::jsonb
    )
    RETURNING * INTO v_import;
  END IF;

  FOR v_parsed IN
    SELECT * FROM public.coach_import_parse_csv(p_source_text, v_mapping->>'delimiter')
  LOOP
    IF v_parsed.row_no = 1 THEN
      v_headers := v_parsed.cells;
      PERFORM public.coach_import_assert_headers(v_headers, v_mapping);
      CONTINUE;
    END IF;
    v_rows := v_rows + 1;
    v_plan := public.coach_import_plan_row(v_mapping->>'kind', v_mapping, v_headers, v_parsed.cells);
    INSERT INTO public.coach_import_rows (import_id, row_no, raw, status, error_code, planned)
    VALUES (
      v_import.id,
      v_parsed.row_no - 1,
      to_jsonb(v_parsed.cells),
      v_plan->>'status',
      v_plan->>'error_code',
      v_plan
    );
    IF v_plan->>'status' = 'ready' THEN v_ready := v_ready + 1;
    ELSIF v_plan->>'status' = 'ignored' THEN v_ignored := v_ignored + 1;
    ELSE v_error := v_error + 1;
    END IF;
  END LOOP;

  WITH ranked AS (
    SELECT r.id,
           row_number() OVER (
             PARTITION BY r.planned->>'date', coalesce(r.planned->>'session_name', ''), r.planned->>'exercise'
             ORDER BY r.row_no
           ) AS n
    FROM public.coach_import_rows r
    WHERE r.import_id = v_import.id
      AND r.status = 'ready'
      AND coalesce((r.planned->>'derive_set')::boolean, false)
  )
  UPDATE public.coach_import_rows r
     SET planned = jsonb_set(r.planned, '{set_index}', to_jsonb(ranked.n), true)
    FROM ranked
   WHERE r.id = ranked.id;

  v_import.kind := v_mapping->>'kind';
  v_dup_hash := public.coach_import_duplicate_hash(v_import);
  UPDATE public.coach_imports
     SET mapping = v_mapping,
         mapping_hash = v_map_hash,
         file_sha256 = v_hash,
         filename = btrim(p_filename),
         kind = v_mapping->>'kind',
         source_headers = to_jsonb(coalesce(v_headers, ARRAY[]::text[])),
         status = 'previewed',
         created_at = CASE
           WHEN v_import.status IN ('cancelled', 'failed') THEN clock_timestamp()
           ELSE created_at
         END,
         row_count = v_rows,
         ready_count = v_ready,
         ignored_count = v_ignored,
         error_count = v_error,
         duplicate_set_hash = v_dup_hash
   WHERE id = v_import.id
   RETURNING * INTO v_import;

  RETURN public.coach_import_view(v_import);
EXCEPTION
  WHEN unique_violation THEN
    RETURN public.coach_import_finish_subject_conflict(v_uid, p_subject_user_id, v_dossier, v_key, v_hash, v_map_hash);
END;
$$;



REVOKE ALL ON FUNCTION public.preview_coach_import(uuid, text, text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_coach_import(
  p_subject_user_id uuid,
  p_filename text,
  p_source_text text,
  p_mapping jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.preview_coach_import(
    p_subject_user_id, p_filename, p_source_text, p_mapping, p_idempotency_key, NULL::uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_coach_import(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_coach_import(uuid, text, text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_provisional_import(
  p_dossier uuid,
  p_filename text,
  p_source_text text,
  p_mapping jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.preview_coach_import(
    NULL::uuid, p_filename, p_source_text, p_mapping, p_idempotency_key, p_dossier
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_provisional_import(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_provisional_import(uuid, text, text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_coach_import(
  p_import_id uuid,
  p_file_sha256 text,
  p_mapping jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_subject uuid;
  v_dossier uuid;
  v_coach uuid;
  v_import public.coach_imports;
  v_mapping jsonb;
  v_map_hash text;
  v_row public.coach_import_rows;
  v_wid uuid;
  v_eid uuid;
  v_weight uuid;
  v_applied integer := 0;
  v_session text;
  v_date date;
  v_ex text;
  v_ex_ord integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_import_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT subject_user_id, provisional_dossier_id, coach_id INTO v_subject, v_dossier, v_coach
  FROM public.coach_imports
  WHERE id = p_import_id;
  IF NOT FOUND OR v_coach IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_dossier IS NOT NULL AND v_subject IS NOT NULL THEN
    RAISE EXCEPTION 'import_conflict';
  END IF;
  IF v_dossier IS NOT NULL THEN
    v_uid := public.coach_import_assert_dossier(v_dossier);
  ELSE
    v_uid := public.coach_import_assert_actor(v_subject);
  END IF;
  PERFORM public.lock_coach_import(p_import_id);
  SELECT * INTO v_import FROM public.coach_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND OR v_import.coach_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_import.subject_user_id IS DISTINCT FROM v_subject
     OR v_import.provisional_dossier_id IS DISTINCT FROM v_dossier THEN
    RAISE EXCEPTION 'import_conflict';
  END IF;
  IF v_import.status = 'committed' THEN
    RETURN public.coach_import_view(v_import);
  END IF;
  IF v_import.file_sha256 <> lower(p_file_sha256) THEN RAISE EXCEPTION 'file_changed'; END IF;
  v_mapping := public.coach_import_normalized_mapping(p_mapping);
  v_map_hash := public.coach_import_sha256(v_mapping::text);
  IF v_map_hash <> v_import.mapping_hash THEN RAISE EXCEPTION 'mapping_changed'; END IF;
  PERFORM public.coach_import_assert_headers(
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_import.source_headers)), ARRAY[]::text[]),
    v_mapping
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_import_rows
    WHERE import_id = v_import.id AND status = 'ready'
  ) THEN
    RAISE EXCEPTION 'nothing_to_import';
  END IF;
  IF v_import.provisional_dossier_id IS NULL THEN
    PERFORM public.coach_import_lock_active_link(v_uid, v_import.subject_user_id);
    PERFORM public.lock_coach_import_subject(v_import.subject_user_id);
  ELSE
    PERFORM public.lock_coach_import_provisional(v_import.provisional_dossier_id);
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_provisional_dossiers d
      WHERE d.id = v_import.provisional_dossier_id
        AND d.coach_id = v_uid
        AND d.status IN ('preparing', 'invited')
    ) THEN
      RAISE EXCEPTION 'dossier_closed';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coach_imports other
    WHERE other.file_sha256 = v_import.file_sha256
      AND other.status = 'committed'
      AND other.id <> v_import.id
      AND (
        (v_import.provisional_dossier_id IS NULL AND other.subject_user_id = v_import.subject_user_id)
        OR (v_import.provisional_dossier_id IS NOT NULL AND other.provisional_dossier_id = v_import.provisional_dossier_id)
      )
  ) THEN
    RAISE EXCEPTION 'already_imported';
  END IF;
  IF v_import.kind = 'workout' THEN
    IF coalesce((v_mapping->>'acknowledge_duplicates')::boolean, false) THEN
      IF public.coach_import_duplicate_hash(v_import) IS DISTINCT FROM v_import.duplicate_set_hash THEN
        RAISE EXCEPTION 'duplicates_changed';
      END IF;
    ELSIF public.coach_import_duplicate_report(v_import) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'potential_duplicate';
    END IF;
  END IF;

  IF v_import.provisional_dossier_id IS NOT NULL THEN
    IF v_import.kind = 'body_weight' THEN
      FOR v_row IN
        SELECT * FROM public.coach_import_rows
        WHERE import_id = v_import.id AND status = 'ready'
        ORDER BY row_no
        FOR UPDATE
      LOOP
        v_date := (v_row.planned->>'date')::date;
        BEGIN
          INSERT INTO public.coach_provisional_weights (dossier_id, import_id, weight_kg, measured_at, notes)
          VALUES (
            v_import.provisional_dossier_id,
            v_import.id,
            (v_row.planned->>'body_weight_kg')::numeric,
            v_date,
            v_row.planned->>'notes'
          );
          UPDATE public.coach_import_rows
             SET status = 'applied'
           WHERE id = v_row.id;
          v_applied := v_applied + 1;
        EXCEPTION
          WHEN unique_violation THEN
            UPDATE public.coach_import_rows
               SET status = 'ignored', error_code = 'already_exists'
             WHERE id = v_row.id;
        END;
      END LOOP;
    ELSE
      FOR v_date, v_session IN
        SELECT (planned->>'date')::date, coalesce(planned->>'session_name', '')
        FROM public.coach_import_rows
        WHERE import_id = v_import.id AND status = 'ready'
        GROUP BY 1, 2
        ORDER BY min(row_no)
      LOOP
        INSERT INTO public.coach_provisional_workouts (dossier_id, import_id, name, performed_at)
        VALUES (
          v_import.provisional_dossier_id,
          v_import.id,
          CASE WHEN v_session <> '' THEN v_session ELSE to_char(v_date, 'YYYY-MM-DD') END,
          ((v_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC')
        )
        RETURNING id INTO v_wid;
        v_ex_ord := 0;
        FOR v_ex IN
          SELECT planned->>'exercise'
          FROM public.coach_import_rows
          WHERE import_id = v_import.id
            AND status = 'ready'
            AND (planned->>'date')::date = v_date
            AND coalesce(planned->>'session_name', '') = v_session
          GROUP BY planned->>'exercise'
          ORDER BY min(row_no)
        LOOP
          v_ex_ord := v_ex_ord + 1;
          INSERT INTO public.coach_provisional_exercises (workout_id, name, order_index, notes)
          VALUES (
            v_wid,
            v_ex,
            v_ex_ord,
            coalesce((
              SELECT string_agg(
                concat(coalesce(r.planned->>'set_index', r.row_no::text), ' · ', r.planned->>'notes'),
                E'\n' ORDER BY r.row_no
              )
              FROM public.coach_import_rows r
              WHERE r.import_id = v_import.id
                AND r.status = 'ready'
                AND (r.planned->>'date')::date = v_date
                AND coalesce(r.planned->>'session_name', '') = v_session
                AND r.planned->>'exercise' = v_ex
                AND coalesce(r.planned->>'notes', '') <> ''
            ), '')
          )
          RETURNING id INTO v_eid;
          INSERT INTO public.coach_provisional_sets (
            exercise_id, set_type, weight_kg, reps, rir, completed, order_index
          )
          SELECT
            v_eid,
            'working',
            (r.planned->>'load_kg')::numeric,
            (r.planned->>'reps')::int,
            (r.planned->>'rir')::int,
            true,
            row_number() OVER (ORDER BY r.row_no)
          FROM public.coach_import_rows r
          WHERE r.import_id = v_import.id
            AND r.status = 'ready'
            AND (r.planned->>'date')::date = v_date
            AND coalesce(r.planned->>'session_name', '') = v_session
            AND r.planned->>'exercise' = v_ex
          ORDER BY r.row_no;
          UPDATE public.coach_import_rows
             SET status = 'applied', applied_provisional_workout_id = v_wid
           WHERE import_id = v_import.id
             AND status = 'ready'
             AND (planned->>'date')::date = v_date
             AND coalesce(planned->>'session_name', '') = v_session
             AND planned->>'exercise' = v_ex;
        END LOOP;
      END LOOP;
      SELECT count(*) INTO v_applied
      FROM public.coach_import_rows
      WHERE import_id = v_import.id AND status = 'applied';
    END IF;
  ELSIF v_import.kind = 'body_weight' THEN
    FOR v_row IN
      SELECT * FROM public.coach_import_rows
      WHERE import_id = v_import.id AND status = 'ready'
      ORDER BY row_no
      FOR UPDATE
    LOOP
      v_date := (v_row.planned->>'date')::date;
      BEGIN
        IF EXISTS (
          SELECT 1 FROM public.weight_measurements w
          WHERE w.user_id = v_import.subject_user_id AND w.measured_at = v_date
        ) THEN
          RAISE unique_violation;
        END IF;
        INSERT INTO public.weight_measurements (user_id, weight_kg, measured_at, notes)
        VALUES (
          v_import.subject_user_id,
          (v_row.planned->>'body_weight_kg')::numeric,
          v_date,
          v_row.planned->>'notes'
        )
        RETURNING id INTO v_weight;
        UPDATE public.coach_import_rows
           SET status = 'applied', applied_weight_id = v_weight
         WHERE id = v_row.id;
        v_applied := v_applied + 1;
      EXCEPTION
        WHEN unique_violation THEN
          UPDATE public.coach_import_rows
             SET status = 'ignored', error_code = 'already_exists'
           WHERE id = v_row.id;
      END;
    END LOOP;
  ELSE
    FOR v_date, v_session IN
      SELECT (planned->>'date')::date, coalesce(planned->>'session_name', '')
      FROM public.coach_import_rows
      WHERE import_id = v_import.id AND status = 'ready'
      GROUP BY 1, 2
      ORDER BY min(row_no)
    LOOP
      INSERT INTO public.workouts (user_id, name, date, completed, notes)
      VALUES (
        v_import.subject_user_id,
        CASE WHEN v_session <> '' THEN v_session ELSE to_char(v_date, 'YYYY-MM-DD') END,
        ((v_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC'),
        true,
        ''
      )
      RETURNING id INTO v_wid;
      v_ex_ord := 0;
      FOR v_ex IN
        SELECT planned->>'exercise'
        FROM public.coach_import_rows
        WHERE import_id = v_import.id
          AND status = 'ready'
          AND (planned->>'date')::date = v_date
          AND coalesce(planned->>'session_name', '') = v_session
        GROUP BY planned->>'exercise'
        ORDER BY min(row_no)
      LOOP
        v_ex_ord := v_ex_ord + 1;
        INSERT INTO public.workout_exercises (workout_id, name, order_index, notes)
        VALUES (
          v_wid,
          v_ex,
          v_ex_ord,
          coalesce((
            SELECT string_agg(
              concat(coalesce(r.planned->>'set_index', r.row_no::text), ' · ', r.planned->>'notes'),
              E'\n' ORDER BY r.row_no
            )
            FROM public.coach_import_rows r
            WHERE r.import_id = v_import.id
              AND r.status = 'ready'
              AND (r.planned->>'date')::date = v_date
              AND coalesce(r.planned->>'session_name', '') = v_session
              AND r.planned->>'exercise' = v_ex
              AND coalesce(r.planned->>'notes', '') <> ''
          ), '')
        )
        RETURNING id INTO v_eid;
        INSERT INTO public.workout_sets (
          exercise_id, set_type, weight_kg, reps, rir, completed, order_index
        )
        SELECT
          v_eid,
          'working',
          (r.planned->>'load_kg')::numeric,
          (r.planned->>'reps')::int,
          (r.planned->>'rir')::int,
          true,
          row_number() OVER (ORDER BY r.row_no)
        FROM public.coach_import_rows r
        WHERE r.import_id = v_import.id
          AND r.status = 'ready'
          AND (r.planned->>'date')::date = v_date
          AND coalesce(r.planned->>'session_name', '') = v_session
          AND r.planned->>'exercise' = v_ex
        ORDER BY r.row_no;
        UPDATE public.coach_import_rows
           SET status = 'applied', applied_workout_id = v_wid
         WHERE import_id = v_import.id
           AND status = 'ready'
           AND (planned->>'date')::date = v_date
           AND coalesce(planned->>'session_name', '') = v_session
           AND planned->>'exercise' = v_ex;
      END LOOP;
    END LOOP;
    SELECT count(*) INTO v_applied
    FROM public.coach_import_rows
    WHERE import_id = v_import.id AND status = 'applied';
  END IF;

  UPDATE public.coach_imports
     SET status = 'committed',
         committed_at = clock_timestamp(),
         applied_count = v_applied,
         ignored_count = (
           SELECT count(*) FROM public.coach_import_rows
           WHERE import_id = v_import.id AND status = 'ignored'
         )
   WHERE id = v_import.id
   RETURNING * INTO v_import;

  RETURN public.coach_import_view(v_import);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'already_imported';
END;
$$;


