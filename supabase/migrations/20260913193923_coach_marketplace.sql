-- M4–M5 : annuaire opt-in. Une demande acceptée n’active pas le coaching.

CREATE TABLE IF NOT EXISTS public.coach_profiles (
  coach_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_name text NOT NULL CHECK (length(btrim(public_name)) BETWEEN 1 AND 100),
  introduction text NOT NULL DEFAULT '' CHECK (length(introduction) <= 2000),
  method text NOT NULL DEFAULT '' CHECK (length(method) <= 2000),
  offer text NOT NULL DEFAULT '' CHECK (length(offer) <= 2000),
  disciplines text[] NOT NULL DEFAULT '{}' CHECK (
    disciplines <@ ARRAY['strength', 'powerlifting', 'general_fitness']::text[]
    AND cardinality(disciplines) <= 3
  ),
  languages text[] NOT NULL DEFAULT '{}' CHECK (
    languages <@ ARRAY['fr', 'en']::text[]
    AND cardinality(languages) <= 2
  ),
  formats text[] NOT NULL DEFAULT '{}' CHECK (
    formats <@ ARRAY['online', 'in_person', 'hybrid']::text[]
    AND cardinality(formats) <= 3
  ),
  area text NOT NULL DEFAULT '' CHECK (length(area) <= 150),
  published boolean NOT NULL DEFAULT false,
  accepting_clients boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    NOT published OR (
      length(btrim(introduction)) > 0
      AND length(btrim(method)) > 0
      AND length(btrim(offer)) > 0
      AND cardinality(disciplines) > 0
      AND cardinality(languages) > 0
      AND cardinality(formats) > 0
      AND (
        NOT (formats && ARRAY['in_person', 'hybrid']::text[])
        OR length(btrim(area)) > 0
      )
    )
  )
);

COMMENT ON TABLE public.coach_profiles IS
  'Opt-in public coach directory. Unpublished rows are visible only to their owner.';

ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_profiles TO authenticated;
GRANT ALL ON public.coach_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_coach_eligible(p_coach uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_capabilities
      WHERE user_id = p_coach AND capability = 'coach'
    )
    AND (
      p_coach = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.coach_profiles
        WHERE coach_id = p_coach AND published
      )
    );
$$;

REVOKE ALL ON FUNCTION public.marketplace_coach_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_coach_eligible(uuid) TO authenticated;

DROP POLICY IF EXISTS marketplace_profile_read ON public.coach_profiles;
CREATE POLICY marketplace_profile_read ON public.coach_profiles
  FOR SELECT TO authenticated
  USING (
    coach_id = (SELECT auth.uid())
    OR (published AND public.marketplace_coach_eligible(coach_id))
  );

CREATE OR REPLACE FUNCTION public.save_my_coach_profile(
  p_profile jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.coach_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_previous public.coach_profiles;
  v_result public.coach_profiles;
BEGIN
  PERFORM 1 FROM public.user_capabilities
    WHERE user_id = v_uid AND capability = 'coach'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach_required';
  END IF;
  SELECT * INTO v_previous FROM public.coach_profiles WHERE coach_id = v_uid FOR UPDATE;
  IF v_previous.coach_id IS NOT NULL AND v_previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'profile_changed';
  END IF;
  IF v_previous.coach_id IS NULL AND p_expected_updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'profile_changed';
  END IF;
  INSERT INTO public.coach_profiles (
    coach_id, public_name, introduction, method, offer,
    disciplines, languages, formats, area, published, accepting_clients
  ) VALUES (
    v_uid,
    btrim(p_profile->>'public_name'),
    coalesce(p_profile->>'introduction', ''),
    coalesce(p_profile->>'method', ''),
    coalesce(p_profile->>'offer', ''),
    ARRAY(
      SELECT DISTINCT btrim(v.elem)
      FROM jsonb_array_elements_text(coalesce(p_profile->'disciplines', '[]'::jsonb)) AS v(elem)
      WHERE length(btrim(v.elem)) > 0
    ),
    ARRAY(
      SELECT DISTINCT btrim(v.elem)
      FROM jsonb_array_elements_text(coalesce(p_profile->'languages', '[]'::jsonb)) AS v(elem)
      WHERE length(btrim(v.elem)) > 0
    ),
    ARRAY(
      SELECT DISTINCT btrim(v.elem)
      FROM jsonb_array_elements_text(coalesce(p_profile->'formats', '[]'::jsonb)) AS v(elem)
      WHERE length(btrim(v.elem)) > 0
    ),
    coalesce(p_profile->>'area', ''),
    coalesce((p_profile->>'published')::boolean, false),
    coalesce((p_profile->>'accepting_clients')::boolean, false)
  )
  ON CONFLICT (coach_id) DO UPDATE SET
    public_name = excluded.public_name,
    introduction = excluded.introduction,
    method = excluded.method,
    offer = excluded.offer,
    disciplines = excluded.disciplines,
    languages = excluded.languages,
    formats = excluded.formats,
    area = excluded.area,
    published = excluded.published,
    accepting_clients = excluded.accepting_clients,
    updated_at = clock_timestamp()
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_coach_profile(jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_coach_profile(jsonb, timestamptz) TO authenticated;

CREATE TABLE IF NOT EXISTS public.coach_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id uuid NOT NULL,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_name text NOT NULL CHECK (length(btrim(public_name)) BETWEEN 1 AND 100),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 1500),
  sharing_version integer NOT NULL DEFAULT 1 CHECK (sharing_version = 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (coach_id <> client_id)
);

COMMENT ON TABLE public.coach_join_requests IS
  'Directory requests. accepted does not create coach_client_links and is not a paid subscription.';

CREATE UNIQUE INDEX IF NOT EXISTS coach_join_requests_mutation
  ON public.coach_join_requests (client_id, client_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS coach_join_requests_open_pair
  ON public.coach_join_requests (coach_id, client_id)
  WHERE status IN ('pending', 'accepted');
CREATE INDEX IF NOT EXISTS coach_join_requests_client
  ON public.coach_join_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_join_requests_coach
  ON public.coach_join_requests (coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_profiles_directory
  ON public.coach_profiles (public_name, coach_id)
  WHERE published AND accepting_clients;

ALTER TABLE public.coach_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_join_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_join_requests TO authenticated;
GRANT ALL ON public.coach_join_requests TO service_role;

DROP POLICY IF EXISTS marketplace_request_participants ON public.coach_join_requests;
CREATE POLICY marketplace_request_participants ON public.coach_join_requests
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (coach_id, client_id));

CREATE OR REPLACE FUNCTION public.request_coaching(
  p_coach uuid,
  p_public_name text,
  p_summary text,
  p_sharing_version integer,
  p_request_key uuid
)
RETURNS public.coach_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_join_requests;
BEGIN
  IF v_uid IS NULL OR p_coach IS NULL OR p_coach = v_uid THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF p_sharing_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'consent_required';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'request_key_required';
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
  WHERE client_id = v_uid AND coach_id = p_coach AND status IN ('pending', 'accepted');
  IF FOUND THEN
    RETURN v_result;
  END IF;
  PERFORM 1 FROM public.coach_profiles
    WHERE coach_id = p_coach AND published AND accepting_clients
    FOR SHARE;
  IF NOT FOUND OR NOT public.marketplace_coach_eligible(p_coach) THEN
    RAISE EXCEPTION 'coach_unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'already_coached';
  END IF;
  INSERT INTO public.coach_join_requests (
    coach_id, client_id, public_name, summary, sharing_version, client_request_id
  ) VALUES (
    p_coach, v_uid, btrim(p_public_name), btrim(p_summary), p_sharing_version, p_request_key
  )
  ON CONFLICT (coach_id, client_id) WHERE status IN ('pending', 'accepted')
  DO UPDATE SET updated_at = coach_join_requests.updated_at
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_coaching_request(p_request uuid, p_status text)
RETURNS public.coach_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.coach_join_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT * INTO v_result
  FROM public.coach_join_requests
  WHERE id = p_request AND v_uid IN (coach_id, client_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;
  IF NOT (
    (v_uid = v_result.client_id AND p_status = 'withdrawn')
    OR (v_uid = v_result.coach_id AND p_status IN ('accepted', 'declined'))
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_result.status = p_status THEN
    RETURN v_result;
  END IF;
  IF v_result.status <> 'pending' AND NOT (v_result.status = 'accepted' AND p_status = 'withdrawn') THEN
    RAISE EXCEPTION 'request_closed';
  END IF;
  IF p_status = 'accepted' THEN
    PERFORM 1 FROM public.coach_profiles
      WHERE coach_id = v_uid AND published AND accepting_clients
      FOR SHARE;
    IF NOT FOUND OR NOT public.marketplace_coach_eligible(v_uid) THEN
      RAISE EXCEPTION 'coach_unavailable';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.coach_client_links
      WHERE client_id = v_result.client_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'already_coached';
    END IF;
  END IF;
  UPDATE public.coach_join_requests
  SET status = p_status, updated_at = clock_timestamp()
  WHERE id = p_request
  RETURNING * INTO v_result;
  -- Agreement grants neither dossier access nor a paid subscription.
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_coaching_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_coaching_request(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.save_my_coach_profile(jsonb, timestamptz) IS
  'Owner-only coach directory write. Authenticated has SELECT, never INSERT/UPDATE.';
COMMENT ON FUNCTION public.request_coaching(uuid, text, text, integer, uuid) IS
  'Creates a directory request. Never inserts coach_client_links.';
COMMENT ON FUNCTION public.respond_coaching_request(uuid, text) IS
  'accepted is an agreement only: no dossier access, no subscription, no payment.';
