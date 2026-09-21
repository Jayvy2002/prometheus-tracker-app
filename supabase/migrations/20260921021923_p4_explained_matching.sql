-- P4.2: explained marketplace matching. Blocking vs preferences. No compatibility percent.

ALTER TABLE public.coach_profiles
  ADD COLUMN IF NOT EXISTS contact_frequency text NOT NULL DEFAULT '' CHECK (
    contact_frequency IN ('', 'weekly', 'biweekly', 'monthly', 'flexible')
  ),
  ADD COLUMN IF NOT EXISTS coaching_style text NOT NULL DEFAULT '' CHECK (
    coaching_style IN ('', 'directive', 'collaborative', 'autonomous')
  ),
  ADD COLUMN IF NOT EXISTS autonomy text NOT NULL DEFAULT '' CHECK (
    autonomy IN ('', 'low', 'medium', 'high')
  ),
  ADD COLUMN IF NOT EXISTS experience_levels text[] NOT NULL DEFAULT '{}' CHECK (
    experience_levels <@ ARRAY['beginner', 'intermediate', 'advanced']::text[]
    AND cardinality(experience_levels) <= 3
  ),
  ADD COLUMN IF NOT EXISTS indicative_price_cents integer CHECK (indicative_price_cents IS NULL OR indicative_price_cents > 0),
  ADD COLUMN IF NOT EXISTS indicative_price_period text NOT NULL DEFAULT 'on_request' CHECK (
    indicative_price_period IN ('on_request', 'session', 'month', 'program')
  );

COMMENT ON COLUMN public.coach_profiles.indicative_price_cents IS
  'Optional listed rate for matching only. Not a payment or payout.';

CREATE TABLE IF NOT EXISTS public.marketplace_search_intents (
  athlete_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discipline text NOT NULL DEFAULT '' CHECK (discipline IN ('', 'strength', 'powerlifting', 'general_fitness')),
  language text NOT NULL DEFAULT '' CHECK (language IN ('', 'fr', 'en')),
  format text NOT NULL DEFAULT '' CHECK (format IN ('', 'online', 'in_person', 'hybrid')),
  area text NOT NULL DEFAULT '' CHECK (length(area) <= 150),
  budget_max_cents integer CHECK (budget_max_cents IS NULL OR budget_max_cents > 0),
  contact_frequency text NOT NULL DEFAULT '' CHECK (contact_frequency IN ('', 'weekly', 'biweekly', 'monthly', 'flexible')),
  coaching_style text NOT NULL DEFAULT '' CHECK (coaching_style IN ('', 'directive', 'collaborative', 'autonomous')),
  autonomy text NOT NULL DEFAULT '' CHECK (autonomy IN ('', 'low', 'medium', 'high')),
  experience_level text NOT NULL DEFAULT '' CHECK (experience_level IN ('', 'beginner', 'intermediate', 'advanced')),
  secondary_notes text NOT NULL DEFAULT '' CHECK (length(secondary_notes) <= 500),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE public.marketplace_search_intents IS
  'Athlete marketplace search questionnaire. Blocking filters vs preferences. Not a compatibility score.';

ALTER TABLE public.marketplace_search_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_search_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_search_intents TO authenticated;
GRANT ALL ON TABLE public.marketplace_search_intents TO service_role;

DROP POLICY IF EXISTS search_intent_owner ON public.marketplace_search_intents;
CREATE POLICY search_intent_owner ON public.marketplace_search_intents
  FOR SELECT TO authenticated
  USING (athlete_id = (SELECT auth.uid()));

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
  v_price integer;
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
  v_price := NULLIF(p_profile->>'indicative_price_cents', '')::integer;
  INSERT INTO public.coach_profiles (
    coach_id, public_name, introduction, method, offer,
    disciplines, languages, formats, area, published, accepting_clients,
    contact_frequency, coaching_style, autonomy, experience_levels,
    indicative_price_cents, indicative_price_period
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
    coalesce((p_profile->>'accepting_clients')::boolean, false),
    coalesce(p_profile->>'contact_frequency', ''),
    coalesce(p_profile->>'coaching_style', ''),
    coalesce(p_profile->>'autonomy', ''),
    ARRAY(
      SELECT DISTINCT btrim(v.elem)
      FROM jsonb_array_elements_text(coalesce(p_profile->'experience_levels', '[]'::jsonb)) AS v(elem)
      WHERE length(btrim(v.elem)) > 0
    ),
    v_price,
    coalesce(NULLIF(p_profile->>'indicative_price_period', ''), 'on_request')
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
    contact_frequency = excluded.contact_frequency,
    coaching_style = excluded.coaching_style,
    autonomy = excluded.autonomy,
    experience_levels = excluded.experience_levels,
    indicative_price_cents = excluded.indicative_price_cents,
    indicative_price_period = excluded.indicative_price_period,
    updated_at = clock_timestamp()
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_coach_profile(jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_coach_profile(jsonb, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_marketplace_search_intent(p_intent jsonb)
RETURNS public.marketplace_search_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.marketplace_search_intents;
  v_budget integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_budget := NULLIF(p_intent->>'budget_max_cents', '')::integer;
  INSERT INTO public.marketplace_search_intents (
    athlete_id, discipline, language, format, area, budget_max_cents,
    contact_frequency, coaching_style, autonomy, experience_level, secondary_notes
  ) VALUES (
    v_uid,
    coalesce(p_intent->>'discipline', ''),
    coalesce(p_intent->>'language', ''),
    coalesce(p_intent->>'format', ''),
    coalesce(p_intent->>'area', ''),
    v_budget,
    coalesce(p_intent->>'contact_frequency', ''),
    coalesce(p_intent->>'coaching_style', ''),
    coalesce(p_intent->>'autonomy', ''),
    coalesce(p_intent->>'experience_level', ''),
    coalesce(p_intent->>'secondary_notes', '')
  )
  ON CONFLICT (athlete_id) DO UPDATE SET
    discipline = excluded.discipline,
    language = excluded.language,
    format = excluded.format,
    area = excluded.area,
    budget_max_cents = excluded.budget_max_cents,
    contact_frequency = excluded.contact_frequency,
    coaching_style = excluded.coaching_style,
    autonomy = excluded.autonomy,
    experience_level = excluded.experience_level,
    secondary_notes = excluded.secondary_notes,
    updated_at = clock_timestamp()
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_marketplace_search_intent(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_marketplace_search_intent(jsonb) TO authenticated;

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
    WHERE published AND accepting_clients AND coach_id <> v_uid
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
  'Eligible coach shortlist with blocking and preference reasons. Not a compatibility score. Not a payment.';
COMMENT ON FUNCTION public.save_marketplace_search_intent(jsonb) IS
  'Stores the athlete marketplace questionnaire. Writes go through this RPC only.';
