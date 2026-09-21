-- P4.2: explained marketplace matching. Blocking vs preferences. No compatibility percent.
-- Listed rates compare only when amount, period and currency are all present and compatible.
-- Beta currencies: EUR, USD, CAD. In-person matching uses structured city/region/country equality.

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
  ),
  ADD COLUMN IF NOT EXISTS indicative_price_currency text NOT NULL DEFAULT '' CHECK (
    indicative_price_currency IN ('', 'EUR', 'USD', 'CAD')
  ),
  ADD COLUMN IF NOT EXISTS area_city text NOT NULL DEFAULT '' CHECK (length(area_city) <= 80),
  ADD COLUMN IF NOT EXISTS area_region text NOT NULL DEFAULT '' CHECK (length(area_region) <= 80),
  ADD COLUMN IF NOT EXISTS area_country text NOT NULL DEFAULT '' CHECK (length(area_country) <= 80);

COMMENT ON COLUMN public.coach_profiles.indicative_price_cents IS
  'Optional listed rate amount in minor units for EUR/USD/CAD. Not a payment or payout.';
COMMENT ON COLUMN public.coach_profiles.indicative_price_period IS
  'Period of the listed rate. Compared only against an athlete budget of the same period.';
COMMENT ON COLUMN public.coach_profiles.indicative_price_currency IS
  'Beta listed-rate currency: EUR, USD or CAD. Empty means unspecified. Never inferred.';
COMMENT ON COLUMN public.coach_profiles.area_city IS
  'Normalized city for in-person matching. Equality only; not a substring of area.';
COMMENT ON COLUMN public.coach_profiles.area_region IS
  'Optional region/state/province. Compared only when both sides set it.';
COMMENT ON COLUMN public.coach_profiles.area_country IS
  'Normalized country for in-person matching. Required with city when format is not online.';

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
      AND t.relname = 'coach_profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%powerlifting%'
      AND pg_get_constraintdef(c.oid) ILIKE '%disciplines%'
  LOOP
    EXECUTE format('ALTER TABLE public.coach_profiles DROP CONSTRAINT %I', v_name);
  END LOOP;
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'coach_profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%indicative_price_currency%'
      AND pg_get_constraintdef(c.oid) ILIKE '%[A-Z]{3}%'
  LOOP
    EXECUTE format('ALTER TABLE public.coach_profiles DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.coach_profiles
  DROP CONSTRAINT IF EXISTS coach_profiles_indicative_price_currency_check;
ALTER TABLE public.coach_profiles
  ADD CONSTRAINT coach_profiles_indicative_price_currency_check CHECK (
    indicative_price_currency IN ('', 'EUR', 'USD', 'CAD')
  );

ALTER TABLE public.coach_profiles
  DROP CONSTRAINT IF EXISTS coach_profiles_disciplines_check;
ALTER TABLE public.coach_profiles
  ADD CONSTRAINT coach_profiles_disciplines_check CHECK (
    disciplines <@ ARRAY['strength', 'powerlifting', 'general_fitness', 'bodybuilding', 'hypertrophy']::text[]
    AND cardinality(disciplines) <= 8
  );

CREATE TABLE IF NOT EXISTS public.marketplace_search_intents (
  athlete_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discipline text NOT NULL DEFAULT '' CHECK (discipline IN ('', 'strength', 'powerlifting', 'general_fitness', 'bodybuilding', 'hypertrophy')),
  language text NOT NULL DEFAULT '' CHECK (language IN ('', 'fr', 'en')),
  format text NOT NULL DEFAULT '' CHECK (format IN ('', 'online', 'in_person', 'hybrid')),
  area text NOT NULL DEFAULT '' CHECK (length(area) <= 150),
  area_city text NOT NULL DEFAULT '' CHECK (length(area_city) <= 80),
  area_region text NOT NULL DEFAULT '' CHECK (length(area_region) <= 80),
  area_country text NOT NULL DEFAULT '' CHECK (length(area_country) <= 80),
  budget_max_cents integer CHECK (budget_max_cents IS NULL OR budget_max_cents > 0),
  budget_period text NOT NULL DEFAULT '' CHECK (budget_period IN ('', 'session', 'month', 'program')),
  budget_currency text NOT NULL DEFAULT '' CHECK (budget_currency IN ('', 'EUR', 'USD', 'CAD')),
  contact_frequency text NOT NULL DEFAULT '' CHECK (contact_frequency IN ('', 'weekly', 'biweekly', 'monthly', 'flexible')),
  coaching_style text NOT NULL DEFAULT '' CHECK (coaching_style IN ('', 'directive', 'collaborative', 'autonomous')),
  autonomy text NOT NULL DEFAULT '' CHECK (autonomy IN ('', 'low', 'medium', 'high')),
  experience_level text NOT NULL DEFAULT '' CHECK (experience_level IN ('', 'beginner', 'intermediate', 'advanced')),
  secondary_notes text NOT NULL DEFAULT '' CHECK (length(secondary_notes) <= 500),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.marketplace_search_intents
  ADD COLUMN IF NOT EXISTS area_city text NOT NULL DEFAULT '' CHECK (length(area_city) <= 80);
ALTER TABLE public.marketplace_search_intents
  ADD COLUMN IF NOT EXISTS area_region text NOT NULL DEFAULT '' CHECK (length(area_region) <= 80);
ALTER TABLE public.marketplace_search_intents
  ADD COLUMN IF NOT EXISTS area_country text NOT NULL DEFAULT '' CHECK (length(area_country) <= 80);

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
      AND t.relname = 'marketplace_search_intents'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%budget_currency%'
      AND pg_get_constraintdef(c.oid) ILIKE '%[A-Z]{3}%'
  LOOP
    EXECUTE format('ALTER TABLE public.marketplace_search_intents DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.marketplace_search_intents
  DROP CONSTRAINT IF EXISTS marketplace_search_intents_budget_currency_check;
ALTER TABLE public.marketplace_search_intents
  ADD CONSTRAINT marketplace_search_intents_budget_currency_check CHECK (
    budget_currency IN ('', 'EUR', 'USD', 'CAD')
  );

COMMENT ON TABLE public.marketplace_search_intents IS
  'Athlete marketplace search questionnaire. Blocking filters vs preferences. Not a compatibility score.';
COMMENT ON COLUMN public.marketplace_search_intents.budget_max_cents IS
  'Optional maximum listed rate. Compared only when period and currency match the Coach offer.';
COMMENT ON COLUMN public.marketplace_search_intents.budget_period IS
  'Period of the athlete budget. Empty means the budget is not comparable.';
COMMENT ON COLUMN public.marketplace_search_intents.budget_currency IS
  'Beta budget currency: EUR, USD or CAD. Empty means unspecified. Never inferred.';
COMMENT ON COLUMN public.marketplace_search_intents.area_city IS
  'Required with country when format is in_person or hybrid. Equality match only.';

ALTER TABLE public.marketplace_search_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_search_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_search_intents TO authenticated;
GRANT ALL ON TABLE public.marketplace_search_intents TO service_role;

DROP POLICY IF EXISTS search_intent_owner ON public.marketplace_search_intents;
CREATE POLICY search_intent_owner ON public.marketplace_search_intents
  FOR SELECT TO authenticated
  USING (athlete_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.marketplace_beta_currency(p_currency text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN upper(btrim(coalesce(p_currency, ''))) IN ('EUR', 'USD', 'CAD')
    THEN upper(btrim(p_currency))
    ELSE ''
  END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_beta_currency(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_beta_currency(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marketplace_listed_rate_decision(
  p_budget_cents integer,
  p_budget_period text,
  p_budget_currency text,
  p_price_cents integer,
  p_price_period text,
  p_price_currency text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_budget_cents IS NULL THEN 'skip'
    WHEN coalesce(p_budget_period, '') = ''
      OR public.marketplace_beta_currency(p_budget_currency) = ''
      OR p_price_cents IS NULL
      OR coalesce(p_price_period, '') IN ('', 'on_request')
      OR public.marketplace_beta_currency(p_price_currency) = ''
      OR p_price_period IS DISTINCT FROM p_budget_period
      OR public.marketplace_beta_currency(p_price_currency)
        IS DISTINCT FROM public.marketplace_beta_currency(p_budget_currency)
    THEN 'missing'
    WHEN p_price_cents > p_budget_cents THEN 'over'
    ELSE 'match'
  END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_listed_rate_decision(integer, text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_listed_rate_decision(integer, text, text, integer, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.marketplace_listed_rate_decision(integer, text, text, integer, text, text) IS
  'Budget vs listed rate. Ineligible only when amount, period and EUR/USD/CAD currency are comparable. Otherwise missing_information.';

CREATE OR REPLACE FUNCTION public.marketplace_location_matches(
  p_coach_city text,
  p_coach_region text,
  p_coach_country text,
  p_want_city text,
  p_want_region text,
  p_want_country text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    lower(btrim(coalesce(p_coach_city, ''))) <> ''
    AND lower(btrim(coalesce(p_coach_country, ''))) <> ''
    AND lower(btrim(coalesce(p_want_city, ''))) <> ''
    AND lower(btrim(coalesce(p_want_country, ''))) <> ''
    AND lower(btrim(p_coach_city)) = lower(btrim(p_want_city))
    AND lower(btrim(p_coach_country)) = lower(btrim(p_want_country))
    AND (
      btrim(coalesce(p_coach_region, '')) = ''
      OR btrim(coalesce(p_want_region, '')) = ''
      OR lower(btrim(p_coach_region)) = lower(btrim(p_want_region))
    );
$$;

REVOKE ALL ON FUNCTION public.marketplace_location_matches(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_location_matches(text, text, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.marketplace_location_matches(text, text, text, text, text, text) IS
  'Blocking in-person match: city and country equality. Region compared only when both sides set it. No substring matching.';

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
  v_period text;
  v_currency text;
  v_city text;
  v_region text;
  v_country text;
  v_area text;
  v_published boolean;
  v_accepting boolean;
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
  v_published := coalesce((p_profile->>'published')::boolean, false);
  v_accepting := coalesce((p_profile->>'accepting_clients')::boolean, false);
  IF (v_published OR v_accepting) AND NOT public.coach_relationship_is_open(v_uid) THEN
    RAISE EXCEPTION 'coach_account_closed';
  END IF;
  v_price := NULLIF(p_profile->>'indicative_price_cents', '')::integer;
  v_period := coalesce(NULLIF(p_profile->>'indicative_price_period', ''), 'on_request');
  v_currency := public.marketplace_beta_currency(p_profile->>'indicative_price_currency');
  IF v_period = 'on_request' OR v_price IS NULL OR v_currency = '' THEN
    v_price := NULL;
    v_period := 'on_request';
    v_currency := '';
  END IF;
  v_city := left(btrim(coalesce(p_profile->>'area_city', '')), 80);
  v_region := left(btrim(coalesce(p_profile->>'area_region', '')), 80);
  v_country := left(btrim(coalesce(p_profile->>'area_country', '')), 80);
  IF v_city <> '' OR v_country <> '' THEN
    v_area := left(concat_ws(', ', NULLIF(v_city, ''), NULLIF(v_region, ''), NULLIF(v_country, '')), 150);
  ELSE
    v_area := left(coalesce(p_profile->>'area', ''), 150);
  END IF;
  INSERT INTO public.coach_profiles (
    coach_id, public_name, introduction, method, offer,
    disciplines, languages, formats, area, area_city, area_region, area_country,
    published, accepting_clients,
    contact_frequency, coaching_style, autonomy, experience_levels,
    indicative_price_cents, indicative_price_period, indicative_price_currency
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
    v_area,
    v_city,
    v_region,
    v_country,
    v_published,
    v_accepting,
    coalesce(p_profile->>'contact_frequency', ''),
    coalesce(p_profile->>'coaching_style', ''),
    coalesce(p_profile->>'autonomy', ''),
    ARRAY(
      SELECT DISTINCT btrim(v.elem)
      FROM jsonb_array_elements_text(coalesce(p_profile->'experience_levels', '[]'::jsonb)) AS v(elem)
      WHERE length(btrim(v.elem)) > 0
    ),
    v_price,
    v_period,
    v_currency
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
    area_city = excluded.area_city,
    area_region = excluded.area_region,
    area_country = excluded.area_country,
    published = excluded.published,
    accepting_clients = excluded.accepting_clients,
    contact_frequency = excluded.contact_frequency,
    coaching_style = excluded.coaching_style,
    autonomy = excluded.autonomy,
    experience_levels = excluded.experience_levels,
    indicative_price_cents = excluded.indicative_price_cents,
    indicative_price_period = excluded.indicative_price_period,
    indicative_price_currency = excluded.indicative_price_currency,
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
  v_period text;
  v_currency text;
  v_city text;
  v_region text;
  v_country text;
  v_area text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_budget := NULLIF(p_intent->>'budget_max_cents', '')::integer;
  v_period := coalesce(p_intent->>'budget_period', '');
  v_currency := public.marketplace_beta_currency(p_intent->>'budget_currency');
  IF v_budget IS NULL OR v_currency = '' THEN
    v_budget := NULL;
    v_period := '';
    v_currency := '';
  END IF;
  v_city := left(btrim(coalesce(p_intent->>'area_city', '')), 80);
  v_region := left(btrim(coalesce(p_intent->>'area_region', '')), 80);
  v_country := left(btrim(coalesce(p_intent->>'area_country', '')), 80);
  IF v_city <> '' OR v_country <> '' THEN
    v_area := left(concat_ws(', ', NULLIF(v_city, ''), NULLIF(v_region, ''), NULLIF(v_country, '')), 150);
  ELSE
    v_area := left(coalesce(p_intent->>'area', ''), 150);
  END IF;
  INSERT INTO public.marketplace_search_intents (
    athlete_id, discipline, language, format, area, area_city, area_region, area_country,
    budget_max_cents, budget_period, budget_currency,
    contact_frequency, coaching_style, autonomy, experience_level, secondary_notes
  ) VALUES (
    v_uid,
    coalesce(p_intent->>'discipline', ''),
    coalesce(p_intent->>'language', ''),
    coalesce(p_intent->>'format', ''),
    v_area,
    v_city,
    v_region,
    v_country,
    v_budget,
    v_period,
    v_currency,
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
    area_city = excluded.area_city,
    area_region = excluded.area_region,
    area_country = excluded.area_country,
    budget_max_cents = excluded.budget_max_cents,
    budget_period = excluded.budget_period,
    budget_currency = excluded.budget_currency,
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
    WHERE published AND accepting_clients AND coach_id <> v_uid
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
  'Eligible coach shortlist with blocking and preference reasons. Not a compatibility score. Not a payment.';
COMMENT ON FUNCTION public.save_marketplace_search_intent(jsonb) IS
  'Stores the athlete marketplace questionnaire. Writes go through this RPC only.';
