-- P6.1 — Entitlements indépendants. Append-only.
-- Represents what an account may use commercially, per product, apart from
-- identity (user_roles / coach capability) and relations (coach_client_links).
-- Nothing here gates a feature, changes a capability or a relation: P6.2
-- decides the beta policy, P6.4 billing. No price, no quota value is decided.
-- Legacy user_roles.role ('free'/'premium') and public.subscriptions are not
-- read: Stripe functions are retired (410) and nothing writes them.

CREATE TABLE IF NOT EXISTS public.account_entitlements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product text NOT NULL CHECK (product IN ('solo', 'coach')),
  status text NOT NULL CHECK (status IN ('beta', 'trial', 'active', 'past_due', 'canceled')),
  source text NOT NULL CHECK (source IN ('beta', 'trial', 'billing', 'operator')),
  -- End of the beta grant, trial or paid period. NULL = open-ended (beta/active only).
  period_ends_at timestamptz,
  -- Coach only: set once when billing turns past_due, never extended.
  grace_ends_at timestamptz,
  -- Coach only: NULL means no limit decided. Reported, never enforced here.
  client_limit integer CHECK (client_limit IS NULL OR client_limit > 0),
  -- Raw provider status, for support. Not an access decision.
  billing_status text CHECK (billing_status IS NULL OR billing_status ~ '^[a-z_]{1,40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product),
  CONSTRAINT account_entitlements_coach_fields CHECK (
    product = 'coach' OR (grace_ends_at IS NULL AND client_limit IS NULL)
  ),
  CONSTRAINT account_entitlements_trial_has_end CHECK (
    status <> 'trial' OR period_ends_at IS NOT NULL
  ),
  CONSTRAINT account_entitlements_grace_only_past_due CHECK (
    grace_ends_at IS NULL OR status = 'past_due'
  )
);

COMMENT ON TABLE public.account_entitlements IS
  'P6.1 commercial entitlements per product. Separate from identity, capability and coaching relations. Written by service_role only.';

ALTER TABLE public.account_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_entitlements TO authenticated;
GRANT ALL ON public.account_entitlements TO service_role;

DROP POLICY IF EXISTS account_entitlements_read_own ON public.account_entitlements;
CREATE POLICY account_entitlements_read_own ON public.account_entitlements
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Write path (service_role only): billing webhook, beta policy, operator.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_account_entitlement(
  p_user_id uuid,
  p_product text,
  p_status text,
  p_source text,
  p_period_ends_at timestamptz DEFAULT NULL,
  p_client_limit integer DEFAULT NULL,
  p_billing_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev public.account_entitlements%ROWTYPE;
  v_grace timestamptz;
BEGIN
  IF coalesce(nullif(auth.role(), ''), current_user) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF p_product NOT IN ('solo', 'coach')
     OR p_status NOT IN ('beta', 'trial', 'active', 'past_due', 'canceled')
     OR p_source NOT IN ('beta', 'trial', 'billing', 'operator') THEN
    RAISE EXCEPTION 'invalid_entitlement';
  END IF;
  IF p_product = 'solo' AND p_client_limit IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_entitlement';
  END IF;

  SELECT * INTO v_prev FROM public.account_entitlements e
   WHERE e.user_id = p_user_id AND e.product = p_product
   FOR UPDATE;

  -- Coach grace: stamped once when billing turns past_due, never extended by
  -- a repeated past_due event, cleared when the account is no longer past_due.
  IF p_product = 'coach' AND p_status = 'past_due' THEN
    v_grace := CASE
      WHEN v_prev.status = 'past_due' AND v_prev.grace_ends_at IS NOT NULL THEN v_prev.grace_ends_at
      ELSE now() + public.coach_grace_interval()
    END;
  END IF;

  INSERT INTO public.account_entitlements AS e (
    user_id, product, status, source, period_ends_at, grace_ends_at, client_limit, billing_status
  ) VALUES (
    p_user_id, p_product, p_status, p_source, p_period_ends_at, v_grace, p_client_limit, p_billing_status
  )
  ON CONFLICT (user_id, product) DO UPDATE SET
    status = excluded.status,
    source = excluded.source,
    period_ends_at = excluded.period_ends_at,
    grace_ends_at = excluded.grace_ends_at,
    client_limit = excluded.client_limit,
    billing_status = excluded.billing_status,
    updated_at = now();

  RETURN public.effective_entitlements(p_user_id, now());
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_entitlement(uuid, text, text, text, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_entitlement(uuid, text, text, text, timestamptz, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Effective state. One rule set, mirrored in src/features/entitlements.
-- access: beta | paid | trial | grace | expired | none
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entitlement_access(
  p_status text,
  p_period_ends_at timestamptz,
  p_grace_ends_at timestamptz,
  p_at timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status IS NULL THEN 'none'
    WHEN p_status = 'beta' THEN
      CASE WHEN p_period_ends_at IS NULL OR p_period_ends_at > p_at THEN 'beta' ELSE 'expired' END
    WHEN p_status = 'active' THEN
      CASE WHEN p_period_ends_at IS NULL OR p_period_ends_at > p_at THEN 'paid' ELSE 'expired' END
    -- Canceled keeps what was paid until the end of the period.
    WHEN p_status = 'canceled' THEN
      CASE WHEN p_period_ends_at IS NOT NULL AND p_period_ends_at > p_at THEN 'paid' ELSE 'expired' END
    WHEN p_status = 'trial' THEN
      CASE WHEN p_period_ends_at > p_at THEN 'trial' ELSE 'expired' END
    -- Only the Coach has a grace period (7 days). A Solo past_due has none.
    WHEN p_status = 'past_due' THEN
      CASE WHEN p_grace_ends_at IS NOT NULL AND p_grace_ends_at > p_at THEN 'grace' ELSE 'expired' END
    ELSE 'none'
  END
$$;

REVOKE ALL ON FUNCTION public.entitlement_access(text, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entitlement_access(text, timestamptz, timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.effective_entitlements(p_user_id uuid, p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_solo public.account_entitlements%ROWTYPE;
  v_coach public.account_entitlements%ROWTYPE;
  v_trial_ends timestamptz;
  v_solo_access text;
  v_solo_ends timestamptz;
  v_solo_source text;
  v_active_clients integer;
BEGIN
  SELECT * INTO v_solo FROM public.account_entitlements e WHERE e.user_id = p_user_id AND e.product = 'solo';
  SELECT * INTO v_coach FROM public.account_entitlements e WHERE e.user_id = p_user_id AND e.product = 'coach';
  -- P1.5 stays the source of the Solo trial after a Coach leaves (14 days, once).
  SELECT p.solo_trial_ends_at INTO v_trial_ends FROM public.user_profiles p WHERE p.id = p_user_id;

  v_solo_access := public.entitlement_access(v_solo.status, v_solo.period_ends_at, NULL, p_at);
  v_solo_ends := v_solo.period_ends_at;
  v_solo_source := v_solo.source;
  -- The stamped trial counts only when no stronger Solo right exists.
  IF v_solo_access IN ('none', 'expired') AND v_trial_ends IS NOT NULL THEN
    IF v_trial_ends > p_at THEN
      v_solo_access := 'trial';
      v_solo_ends := v_trial_ends;
      v_solo_source := 'trial';
    ELSIF v_solo_access = 'none' THEN
      v_solo_access := 'expired';
      v_solo_ends := v_trial_ends;
      v_solo_source := 'trial';
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_active_clients
    FROM public.coach_client_links l
   WHERE l.coach_id = p_user_id AND l.status = 'active';

  RETURN jsonb_build_object(
    'solo', jsonb_build_object(
      'access', v_solo_access,
      'source', v_solo_source,
      'ends_at', v_solo_ends,
      'billing_status', v_solo.billing_status
    ),
    'coach', jsonb_build_object(
      'access', public.entitlement_access(v_coach.status, v_coach.period_ends_at, v_coach.grace_ends_at, p_at),
      'source', v_coach.source,
      'ends_at', CASE WHEN v_coach.status = 'past_due' THEN v_coach.grace_ends_at ELSE v_coach.period_ends_at END,
      'billing_status', v_coach.billing_status,
      'client_limit', v_coach.client_limit,
      'active_clients', v_active_clients,
      'over_limit', v_coach.client_limit IS NOT NULL AND v_active_clients > v_coach.client_limit
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.effective_entitlements(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_entitlements(uuid, timestamptz) TO service_role;

-- The account's own view. Never another account's, whatever the relation.
CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  RETURN public.effective_entitlements(v_uid, now());
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated, service_role;
