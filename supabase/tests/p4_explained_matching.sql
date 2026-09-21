-- P4.2 matching: blocking vs preferences, eligible shortlist only, no percent.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.as_user(p uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
END;
$$;

CREATE FUNCTION pg_temp.clear_jwt() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

INSERT INTO auth.users(id, email) VALUES
 ('c4200000-0000-4000-8000-000000000001', 'p42-alpha@example.test'),
 ('c4200000-0000-4000-8000-000000000002', 'p42-bravo@example.test'),
 ('c4200000-0000-4000-8000-000000000003', 'p42-charlie@example.test'),
 ('c4200000-0000-4000-8000-000000000004', 'p42-delta@example.test'),
 ('c4200000-0000-4000-8000-000000000005', 'p42-echo@example.test'),
 ('c4200000-0000-4000-8000-000000000006', 'p42-foxtrot@example.test'),
 ('c4200000-0000-4000-8000-000000000007', 'p42-golf@example.test'),
 ('c4200000-0000-4000-8000-000000000008', 'p42-hidden@example.test'),
 ('c4200000-0000-4000-8000-000000000009', 'p42-athlete@example.test'),
 ('c4200000-0000-4000-8000-00000000000a', 'p42-other@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c4200000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000002', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000003', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000004', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000005', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000006', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000007', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000008', 'free', 'coach'),
 ('c4200000-0000-4000-8000-000000000009', 'free', 'none'),
 ('c4200000-0000-4000-8000-00000000000a', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;

DO $$ BEGIN
  IF to_regclass('public.marketplace_search_intents') IS NULL THEN
    RAISE EXCEPTION 'search intents table missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.marketplace_search_intents'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled on search intents';
  END IF;
  IF has_table_privilege('authenticated', 'public.marketplace_search_intents', 'insert')
     OR has_table_privilege('authenticated', 'public.marketplace_search_intents', 'update')
     OR has_table_privilege('authenticated', 'public.marketplace_search_intents', 'delete')
     OR has_table_privilege('anon', 'public.marketplace_search_intents', 'select') THEN
    RAISE EXCEPTION 'direct search intent writes granted';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.save_marketplace_search_intent(jsonb)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.explain_marketplace_matches()', 'execute')
     OR has_function_privilege('anon', 'public.explain_marketplace_matches()', 'execute') THEN
    RAISE EXCEPTION 'matching grants mismatch';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000009');
DO $$ BEGIN
  BEGIN
    PERFORM public.explain_marketplace_matches();
    RAISE EXCEPTION 'explained without intent';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'no_search_intent' THEN RAISE; END IF;
  END;
END $$;

SELECT public.save_marketplace_search_intent('{"discipline":"","language":"fr","format":"online"}');
DO $$ BEGIN
  BEGIN
    PERFORM public.explain_marketplace_matches();
    RAISE EXCEPTION 'explained incomplete intent';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'intent_incomplete' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.marketplace_search_intents(athlete_id) VALUES (auth.uid());
    RAISE EXCEPTION 'direct intent insert allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000001');
SELECT public.save_my_coach_profile('{"public_name":"Alpha","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true,"contact_frequency":"weekly","coaching_style":"collaborative","autonomy":"medium","experience_levels":["beginner"],"indicative_price_cents":4000,"indicative_price_period":"month"}');
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000002');
SELECT public.save_my_coach_profile('{"public_name":"Bravo","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true,"contact_frequency":"weekly","indicative_price_cents":4000,"indicative_price_period":"month"}');
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000003');
SELECT public.save_my_coach_profile('{"public_name":"Charlie","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true}');
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000004');
SELECT public.save_my_coach_profile('{"public_name":"Delta","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true,"indicative_price_cents":4000,"indicative_price_period":"month"}');
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000005');
SELECT public.save_my_coach_profile('{"public_name":"Echo","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true,"indicative_price_cents":4000,"indicative_price_period":"month"}');
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000006');
SELECT public.save_my_coach_profile('{"public_name":"Foxtrot","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true,"indicative_price_cents":20000,"indicative_price_period":"month"}');
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000007');
SELECT public.save_my_coach_profile('{"public_name":"Golf","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["en"],"formats":["online"],"published":true,"accepting_clients":true}');
SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000008');
SELECT public.save_my_coach_profile('{"public_name":"Hidden","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":false,"accepting_clients":true}');

SELECT pg_temp.as_user('c4200000-0000-4000-8000-000000000009');
SELECT public.save_marketplace_search_intent('{"discipline":"strength","language":"fr","format":"online","contact_frequency":"weekly","coaching_style":"collaborative","autonomy":"medium","experience_level":"beginner"}');

DO $$
DECLARE
  v_rows jsonb;
BEGIN
  v_rows := public.explain_marketplace_matches();
  IF jsonb_typeof(v_rows) <> 'array' THEN RAISE EXCEPTION 'shortlist was not an array'; END IF;
  IF jsonb_array_length(v_rows) <> 5 THEN RAISE EXCEPTION 'shortlist exceeded five'; END IF;
  IF v_rows->0->>'public_name' <> 'Alpha' OR v_rows->1->>'public_name' <> 'Bravo' THEN
    RAISE EXCEPTION 'preference order lost';
  END IF;
  IF v_rows::text LIKE '%Golf%' OR v_rows::text LIKE '%Hidden%' OR v_rows::text LIKE '%Foxtrot%' THEN
    RAISE EXCEPTION 'incompatible coach filled the shortlist';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) item WHERE (item->>'eligible') IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION 'ineligible row returned';
  END IF;
END $$;

SELECT public.save_marketplace_search_intent('{"discipline":"strength","language":"fr","format":"online","budget_max_cents":5000,"contact_frequency":"weekly","coaching_style":"collaborative","autonomy":"medium","experience_level":"beginner"}');
DO $$
DECLARE
  v_rows jsonb;
  v_charlie jsonb;
BEGIN
  v_rows := public.explain_marketplace_matches();
  IF v_rows::text LIKE '%Foxtrot%' OR v_rows::text LIKE '%Golf%' THEN
    RAISE EXCEPTION 'over-budget coach remained eligible';
  END IF;
  SELECT item INTO v_charlie FROM jsonb_array_elements(v_rows) item WHERE item->>'public_name' = 'Charlie';
  IF v_charlie IS NULL THEN RAISE EXCEPTION 'missing price became ineligible'; END IF;
  IF NOT (v_charlie->'missing_information' @> '["price"]'::jsonb) THEN
    RAISE EXCEPTION 'missing price not reported';
  END IF;
END $$;

SELECT public.save_marketplace_search_intent('{"discipline":"strength","language":"fr","format":"in_person","area":"Paris"}');
DO $$
DECLARE
  v_rows jsonb;
BEGIN
  v_rows := public.explain_marketplace_matches();
  IF jsonb_array_length(v_rows) <> 0 THEN
    RAISE EXCEPTION 'in-person mismatch still listed';
  END IF;
END $$;

SELECT pg_temp.as_user('c4200000-0000-4000-8000-00000000000a');
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.marketplace_search_intents
    WHERE athlete_id = 'c4200000-0000-4000-8000-000000000009'
  ) THEN RAISE EXCEPTION 'other athlete read search intent'; END IF;
END $$;

RESET ROLE;
SELECT pg_temp.clear_jwt();
\echo 'p4.2 matching: blocking vs prefs, shortlist eligible only, no percent'
COMMIT;
