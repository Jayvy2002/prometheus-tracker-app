-- P6.1 entitlements. BEGIN/ROLLBACK. No durable writes.
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

CREATE FUNCTION pg_temp.as_service() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$;

INSERT INTO auth.users(id, email) VALUES
 ('c6100000-0000-4000-8000-000000000001', 'p61-solo@example.test'),
 ('c6100000-0000-4000-8000-000000000002', 'p61-coach@example.test'),
 ('c6100000-0000-4000-8000-000000000003', 'p61-client@example.test'),
 ('c6100000-0000-4000-8000-000000000004', 'p61-former@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c6100000-0000-4000-8000-000000000001', 'free', 'none'),
 ('c6100000-0000-4000-8000-000000000002', 'free', 'coach'),
 ('c6100000-0000-4000-8000-000000000003', 'free', 'client'),
 ('c6100000-0000-4000-8000-000000000004', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
INSERT INTO public.coach_client_links(coach_id, client_id, status) VALUES
 ('c6100000-0000-4000-8000-000000000002', 'c6100000-0000-4000-8000-000000000003', 'active');

-- ---------------------------------------------------------------------------
-- Grants: read own, write only through service_role.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF has_table_privilege('authenticated', 'public.account_entitlements', 'insert')
     OR has_table_privilege('authenticated', 'public.account_entitlements', 'update')
     OR has_table_privilege('authenticated', 'public.account_entitlements', 'delete')
     OR has_table_privilege('anon', 'public.account_entitlements', 'select')
     OR NOT has_table_privilege('authenticated', 'public.account_entitlements', 'select')
     OR has_function_privilege('authenticated', 'public.set_account_entitlement(uuid,text,text,text,timestamptz,integer,text)', 'execute')
     OR has_function_privilege('authenticated', 'public.effective_entitlements(uuid,timestamptz)', 'execute')
     OR has_function_privilege('authenticated', 'public.entitlement_access(text,timestamptz,timestamptz,timestamptz)', 'execute')
     OR has_function_privilege('anon', 'public.get_my_entitlements()', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.get_my_entitlements()', 'execute') THEN
    RAISE EXCEPTION 'entitlement grants mismatch';
  END IF;
END $$;

-- An account cannot grant itself anything.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c6100000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    PERFORM public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'active', 'billing');
    RAISE EXCEPTION 'self grant accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- No row and no stamped trial: no right, nothing blocked by this layer.
DO $$
DECLARE v jsonb := public.get_my_entitlements();
BEGIN
  IF v->'solo'->>'access' <> 'none' OR v->'coach'->>'access' <> 'none' THEN
    RAISE EXCEPTION 'empty account %', v;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Effective rules.
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT pg_temp.as_service();
DO $$
DECLARE
  v jsonb;
  v_grace timestamptz;
BEGIN
  -- Beta, open-ended.
  v := public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'beta', 'beta');
  IF v->'solo'->>'access' <> 'beta' THEN RAISE EXCEPTION 'beta %', v; END IF;

  -- Beta with an end in the past is expired, not silently open.
  v := public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'beta', 'beta', now() - interval '1 day');
  IF v->'solo'->>'access' <> 'expired' THEN RAISE EXCEPTION 'ended beta %', v; END IF;

  -- Canceled keeps the paid period until its end.
  v := public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'canceled', 'billing', now() + interval '3 days', NULL, 'canceled');
  IF v->'solo'->>'access' <> 'paid' THEN RAISE EXCEPTION 'canceled in period %', v; END IF;
  IF public.entitlement_access('canceled', now() - interval '1 second', NULL, now()) <> 'expired' THEN
    RAISE EXCEPTION 'canceled after period';
  END IF;

  -- A Solo past_due has no grace.
  v := public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'past_due', 'billing');
  IF v->'solo'->>'access' <> 'expired' THEN RAISE EXCEPTION 'solo past_due %', v; END IF;
  IF EXISTS (SELECT 1 FROM public.account_entitlements
              WHERE user_id = 'c6100000-0000-4000-8000-000000000001' AND grace_ends_at IS NOT NULL) THEN
    RAISE EXCEPTION 'solo got a grace';
  END IF;

  -- A trial row needs an end.
  BEGIN
    PERFORM public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'trial', 'trial');
    RAISE EXCEPTION 'open-ended trial accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- A Solo has no client limit.
  BEGIN
    PERFORM public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'active', 'billing', NULL, 3);
    RAISE EXCEPTION 'solo client limit accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_entitlement' THEN RAISE; END IF;
  END;
  -- Unknown values are refused.
  BEGIN
    PERFORM public.set_account_entitlement('c6100000-0000-4000-8000-000000000001', 'solo', 'premium', 'billing');
    RAISE EXCEPTION 'legacy premium accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_entitlement' THEN RAISE; END IF;
  END;

  -- Coach past_due: 7-day grace, stamped once, never extended.
  v := public.set_account_entitlement('c6100000-0000-4000-8000-000000000002', 'coach', 'past_due', 'billing', NULL, 2, 'past_due');
  IF v->'coach'->>'access' <> 'grace' THEN RAISE EXCEPTION 'coach grace %', v; END IF;
  SELECT grace_ends_at INTO v_grace FROM public.account_entitlements
   WHERE user_id = 'c6100000-0000-4000-8000-000000000002' AND product = 'coach';
  IF v_grace <> now() + public.coach_grace_interval() THEN RAISE EXCEPTION 'grace length %', v_grace; END IF;
  UPDATE public.account_entitlements SET grace_ends_at = grace_ends_at - interval '5 days'
   WHERE user_id = 'c6100000-0000-4000-8000-000000000002' AND product = 'coach';
  PERFORM public.set_account_entitlement('c6100000-0000-4000-8000-000000000002', 'coach', 'past_due', 'billing', NULL, 2, 'past_due');
  IF (SELECT grace_ends_at FROM public.account_entitlements
       WHERE user_id = 'c6100000-0000-4000-8000-000000000002' AND product = 'coach') <> v_grace - interval '5 days' THEN
    RAISE EXCEPTION 'a repeated past_due extended the grace';
  END IF;
  IF public.entitlement_access('past_due', NULL, now() - interval '1 second', now()) <> 'expired' THEN
    RAISE EXCEPTION 'grace after its end';
  END IF;
  -- Paid again: the grace is cleared.
  v := public.set_account_entitlement('c6100000-0000-4000-8000-000000000002', 'coach', 'active', 'billing', now() + interval '30 days', 1, 'active');
  IF v->'coach'->>'access' <> 'paid' OR (SELECT grace_ends_at FROM public.account_entitlements
       WHERE user_id = 'c6100000-0000-4000-8000-000000000002' AND product = 'coach') IS NOT NULL THEN
    RAISE EXCEPTION 'paid coach %', v;
  END IF;
  -- The limit is reported, never enforced here.
  IF (v->'coach'->>'active_clients')::int <> 1 OR (v->'coach'->>'over_limit')::boolean THEN
    RAISE EXCEPTION 'client count %', v;
  END IF;
END $$;

-- An entitlement never touches capability or relations.
DO $$ BEGIN
  IF (SELECT coaching_role FROM public.user_roles WHERE user_id = 'c6100000-0000-4000-8000-000000000002') <> 'coach'
     OR NOT EXISTS (SELECT 1 FROM public.coach_client_links
                     WHERE coach_id = 'c6100000-0000-4000-8000-000000000002' AND status = 'active') THEN
    RAISE EXCEPTION 'entitlement write changed identity or relation';
  END IF;
END $$;
DO $$ BEGIN
  IF public.set_account_entitlement('c6100000-0000-4000-8000-000000000002', 'coach', 'past_due', 'billing')->'coach'->>'access' <> 'grace' THEN
    RAISE EXCEPTION 'coach should be in grace';
  END IF;
END $$;
DO $$ BEGIN
  UPDATE public.account_entitlements SET grace_ends_at = now() - interval '1 minute'
   WHERE user_id = 'c6100000-0000-4000-8000-000000000002' AND product = 'coach';
  IF public.effective_entitlements('c6100000-0000-4000-8000-000000000002')->'coach'->>'access' <> 'expired' THEN
    RAISE EXCEPTION 'grace should be over';
  END IF;
  IF (SELECT coaching_role FROM public.user_roles WHERE user_id = 'c6100000-0000-4000-8000-000000000002') <> 'coach'
     OR NOT EXISTS (SELECT 1 FROM public.coach_client_links
                     WHERE coach_id = 'c6100000-0000-4000-8000-000000000002' AND status = 'active') THEN
    RAISE EXCEPTION 'expired coach lost capability or client';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Solo trial after a Coach leaves (P1.5 stamp stays the source).
-- ---------------------------------------------------------------------------
UPDATE public.user_profiles SET solo_trial_ends_at = now() + interval '10 days'
 WHERE id = 'c6100000-0000-4000-8000-000000000004';
DO $$
DECLARE v jsonb := public.effective_entitlements('c6100000-0000-4000-8000-000000000004');
BEGIN
  IF v->'solo'->>'access' <> 'trial' OR v->'solo'->>'source' <> 'trial' THEN RAISE EXCEPTION 'stamped trial %', v; END IF;
END $$;
UPDATE public.user_profiles SET solo_trial_ends_at = now() - interval '1 day'
 WHERE id = 'c6100000-0000-4000-8000-000000000004';
DO $$
DECLARE v jsonb := public.effective_entitlements('c6100000-0000-4000-8000-000000000004');
BEGIN
  IF v->'solo'->>'access' <> 'expired' THEN RAISE EXCEPTION 'expired trial %', v; END IF;
END $$;
-- A beta right wins over an expired trial.
DO $$ BEGIN
  IF public.set_account_entitlement('c6100000-0000-4000-8000-000000000004', 'solo', 'beta', 'beta')->'solo'->>'access' <> 'beta' THEN
    RAISE EXCEPTION 'beta should win over an expired trial';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Isolation: a Coach never reads a client's rights, nor the reverse.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF public.set_account_entitlement('c6100000-0000-4000-8000-000000000003', 'solo', 'active', 'billing')->'solo'->>'access' <> 'paid' THEN
    RAISE EXCEPTION 'open-ended paid solo';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c6100000-0000-4000-8000-000000000002');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.account_entitlements WHERE user_id <> 'c6100000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'coach read another account''s rights';
  END IF;
  IF public.get_my_entitlements()->'solo'->>'access' <> 'none' THEN
    RAISE EXCEPTION 'coach inherited a client right';
  END IF;
END $$;
SELECT pg_temp.as_user('c6100000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.account_entitlements) <> 1 THEN
    RAISE EXCEPTION 'client row visibility';
  END IF;
  IF public.get_my_entitlements()->'coach'->>'access' <> 'none' THEN
    RAISE EXCEPTION 'client inherited the coach right';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Account deletion removes the rows (the user owns them).
-- ---------------------------------------------------------------------------
RESET ROLE;
DELETE FROM public.coach_client_links WHERE client_id = 'c6100000-0000-4000-8000-000000000003';
DELETE FROM auth.users WHERE id = 'c6100000-0000-4000-8000-000000000003';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.account_entitlements WHERE user_id = 'c6100000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'rights survived the account';
  END IF;
END $$;

ROLLBACK;
SELECT 'p6.1 entitlements: separate from identity and relations, service-only writes, beta/paid/trial/grace/expired, coach grace once, own-only reads' AS result;
