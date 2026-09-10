-- Audit 31 août 2026: coach-owned kcal, tracking at invite, no client→coach self-promote,
-- fleet cron auth = FLEET_CRON_SECRET only.
-- Coaching copy only. Do not apply to live tracker / backup.

-- 1. Nutrition targets: NULL until the coach sends. Drop the fake 2000 default.
ALTER TABLE public.user_profiles
  ALTER COLUMN daily_calorie_target DROP DEFAULT,
  ALTER COLUMN protein_target DROP DEFAULT,
  ALTER COLUMN carbs_target DROP DEFAULT,
  ALTER COLUMN fat_target DROP DEFAULT;

-- Linked athletes without a sent calorie/onboarding draft keep the schema default 2000
-- as an invented target. Clear it. Sent drafts keep whatever the coach applied.
UPDATE public.user_profiles p
SET
  daily_calorie_target = NULL,
  protein_target = NULL,
  carbs_target = NULL,
  fat_target = NULL
WHERE p.daily_calorie_target = 2000
  AND EXISTS (
    SELECT 1 FROM public.coach_client_links l
    WHERE l.client_id = p.id AND l.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.coach_interventions i
    WHERE i.client_id = p.id
      AND i.status = 'sent'
      AND i.kind IN ('calorie_adjustment', 'onboarding_plan')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.client_tracking_config t
    WHERE t.client_id = p.id
      AND t.setup_completed_at IS NOT NULL
  );

-- Linked athlete cannot overwrite kcal/P/C/F. Coach RPC is_coach_of() still writes.
CREATE OR REPLACE FUNCTION public.protect_coach_nutrition_targets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_coach_of(NEW.id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coach_client_links
    WHERE client_id = NEW.id AND status = 'active'
  ) THEN
    NEW.daily_calorie_target := OLD.daily_calorie_target;
    NEW.protein_target := OLD.protein_target;
    NEW.carbs_target := OLD.carbs_target;
    NEW.fat_target := OLD.fat_target;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_coach_nutrition_targets ON public.user_profiles;
CREATE TRIGGER protect_coach_nutrition_targets
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_coach_nutrition_targets();

REVOKE ALL ON FUNCTION public.protect_coach_nutrition_targets() FROM PUBLIC, anon, authenticated;

-- 2. Invite accept seeds tracking from the coach's defaults (not ALL_ON at first fetch).
CREATE OR REPLACE FUNCTION public.accept_coach_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite coach_invites%ROWTYPE;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM coach_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF v_invite.use_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;
  IF v_invite.coach_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self');
  END IF;

  SELECT coach_id INTO v_existing
  FROM coach_client_links
  WHERE client_id = v_uid AND status = 'active';

  IF v_existing IS NOT NULL AND v_existing <> v_invite.coach_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_coached');
  END IF;

  INSERT INTO coach_client_links (coach_id, client_id, status)
  VALUES (v_invite.coach_id, v_uid, 'active')
  ON CONFLICT (coach_id, client_id) DO UPDATE
    SET status = 'active', updated_at = now();

  UPDATE coach_invites
    SET use_count = use_count + 1
    WHERE id = v_invite.id;

  INSERT INTO user_roles (user_id, role, coaching_role)
  VALUES (v_uid, 'free', 'client')
  ON CONFLICT (user_id) DO UPDATE
    SET coaching_role = CASE
      WHEN user_roles.coaching_role = 'coach' THEN 'coach'
      ELSE 'client'
    END,
    updated_at = now();

  INSERT INTO client_tracking_config (
    coach_id, client_id,
    track_weight, track_checkins, track_nutrition, track_workouts, workout_focus,
    training_vars, nutrition_vars, checkin_vars
  )
  SELECT
    v_invite.coach_id,
    v_uid,
    COALESCE((cs.default_tracking->>'track_weight')::boolean, true),
    COALESCE((cs.default_tracking->>'track_checkins')::boolean, true),
    COALESCE((cs.default_tracking->>'track_nutrition')::boolean, true),
    COALESCE((cs.default_tracking->>'track_workouts')::boolean, true),
    COALESCE(cs.default_tracking->>'workout_focus', ''),
    COALESCE(
      cs.default_tracking->'training_vars',
      cs.default_tracking->'training',
      '{"sets":true,"reps":true,"reps_range":true,"rir":true,"load":true,"rest":true}'::jsonb
    ),
    COALESCE(
      cs.default_tracking->'nutrition_vars',
      cs.default_tracking->'nutrition',
      '{"calories":true,"protein":true,"carbs":true,"fat":true,"water":true,"steps":true}'::jsonb
    ),
    COALESCE(
      cs.default_tracking->'checkin_vars',
      cs.default_tracking->'checkin',
      '{"sleep_hours":true,"sleep_quality":true,"energy":true,"mood":true,"motivation":true,"hunger":true,"fatigue":true,"stress":true,"soreness":true,"joint_pain":true,"notes":true}'::jsonb
    )
  FROM (SELECT 1) AS _
  LEFT JOIN coach_settings cs ON cs.coach_id = v_invite.coach_id
  ON CONFLICT (coach_id, client_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'coach_id', v_invite.coach_id,
    'coach_name', COALESCE((SELECT full_name FROM user_profiles WHERE id = v_invite.coach_id), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_coach_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_coach_invite(text) TO authenticated;

-- 3. A linked client cannot self-promote to coach via set_coaching_role / /clients.
CREATE OR REPLACE FUNCTION public.set_coaching_role(p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_role NOT IN ('none', 'coach') THEN
    RAISE EXCEPTION 'Invalid coaching role';
  END IF;

  INSERT INTO user_roles (user_id, role, coaching_role)
  VALUES (v_uid, 'free', p_role)
  ON CONFLICT (user_id) DO UPDATE
    SET coaching_role = CASE
      WHEN user_roles.coaching_role = 'client' THEN 'client'
      WHEN p_role = 'coach' THEN 'coach'
      WHEN user_roles.coaching_role = 'coach' AND p_role = 'none' THEN
        CASE WHEN EXISTS (
          SELECT 1 FROM coach_client_links
          WHERE client_id = v_uid AND status = 'active'
        ) THEN 'client' ELSE 'none' END
      ELSE p_role
    END,
    updated_at = now()
  RETURNING coaching_role INTO v_current;

  RETURN v_current;
END;
$$;

REVOKE ALL ON FUNCTION public.set_coaching_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_coaching_role(text) TO authenticated;

-- 4. Fleet cron: dedicated secret only (no GROK_BOT_WEBHOOK_SECRET fallback).
CREATE OR REPLACE FUNCTION public.invoke_coach_fleet_round()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_req_id bigint;
BEGIN
  BEGIN
    SELECT ds.decrypted_secret
      INTO v_key
    FROM vault.decrypted_secrets ds
    WHERE ds.name = 'FLEET_CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE WARNING 'coach-fleet-round: no FLEET_CRON_SECRET in vault, skip cron invoke';
    RETURN NULL;
  END IF;

  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE WARNING 'coach-fleet-round: pg_net missing, skip cron invoke';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://phyuijjekxtjvipjtdfv.supabase.co/functions/v1/coach-fleet-round',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'X-Webhook-Key', v_key
    ),
    body := jsonb_build_object('trigger', 'cron')
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_coach_fleet_round() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_coach_fleet_round() TO postgres, service_role;

COMMENT ON FUNCTION public.invoke_coach_fleet_round() IS
  'Nightly pg_cron invoke of in-app coach-fleet-round. Auth via vault FLEET_CRON_SECRET only.';
