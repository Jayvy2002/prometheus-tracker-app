-- Suppression de compte compréhensible, avec fenêtre de récupération (Vision §30).
--
-- 1. La personne demande la suppression : accès coupé tout de suite (l'app
--    n'affiche plus que l'écran de récupération), profil marketplace masqué,
--    notifications arrêtées. Rien n'est encore détruit.
-- 2. Pendant la fenêtre, elle peut annuler : tout est rétabli tel quel.
-- 3. À échéance, la purge existante (transition Coach, nettoyage Storage
--    fail-closed, suppression Auth) s'exécute côté serveur via le cron.
--
-- Durée de la fenêtre : paramètre unique `account_deletion_window()`.
-- 14 jours pour la bêta, À VALIDER JURIDIQUEMENT avant la production finale.

CREATE OR REPLACE FUNCTION public.account_deletion_window()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT interval '14 days' $$;

REVOKE ALL ON FUNCTION public.account_deletion_window() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_window() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'cancelled', 'purging', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz NOT NULL,
  cancelled_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  -- What the request switched off, so a cancellation restores it exactly.
  restore jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(restore) = 'object')
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_due_idx
  ON public.account_deletion_requests (purge_after) WHERE status = 'pending';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.account_deletion_requests TO authenticated;
GRANT ALL ON TABLE public.account_deletion_requests TO service_role;

DROP POLICY IF EXISTS "Person reads own deletion request" ON public.account_deletion_requests;
CREATE POLICY "Person reads own deletion request" ON public.account_deletion_requests
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Person: request / cancel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.account_deletion_requests;
  v_profile public.user_profiles;
  v_published boolean;
  v_restore jsonb := '{}'::jsonb;
  v_active integer;
  v_self integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(20024200, hashtext(v_uid::text));

  SELECT * INTO v_row FROM public.account_deletion_requests WHERE user_id = v_uid FOR UPDATE;
  IF FOUND AND v_row.status IN ('pending', 'purging') THEN
    -- Idempotent: asking twice never moves the date.
    RETURN jsonb_build_object('status', v_row.status, 'purge_after', v_row.purge_after);
  END IF;

  -- Same rule as the purge preflight: the last operator cannot leave.
  SELECT count(*) FILTER (WHERE revoked_at IS NULL),
         count(*) FILTER (WHERE user_id = v_uid AND revoked_at IS NULL)
    INTO v_active, v_self
  FROM public.platform_operators;
  IF v_self = 1 AND v_active <= 1 THEN
    RAISE EXCEPTION 'last_operator';
  END IF;

  -- Switch off what reaches other people or the device, remembering it.
  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_uid FOR UPDATE;
  IF FOUND THEN
    v_restore := v_restore || jsonb_build_object(
      'notification_workout_enabled', v_profile.notification_workout_enabled,
      'notification_nutrition_enabled', v_profile.notification_nutrition_enabled,
      'notification_categories', coalesce(v_profile.notification_categories, 'null'::jsonb)
    );
    UPDATE public.user_profiles
       SET notification_workout_enabled = false,
           notification_nutrition_enabled = false,
           notification_categories = '{"messages":false,"coaching":false,"program":false,"decisions":false,"checkins":false}'::jsonb
     WHERE id = v_uid;
  END IF;
  SELECT published INTO v_published FROM public.coach_profiles WHERE coach_id = v_uid FOR UPDATE;
  IF FOUND THEN
    v_restore := v_restore || jsonb_build_object('coach_profile_published', v_published);
    UPDATE public.coach_profiles SET published = false WHERE coach_id = v_uid AND published;
  END IF;

  INSERT INTO public.account_deletion_requests AS r (user_id, status, requested_at, purge_after, restore)
  VALUES (v_uid, 'pending', now(), now() + public.account_deletion_window(), v_restore)
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'pending',
        requested_at = excluded.requested_at,
        purge_after = excluded.purge_after,
        cancelled_at = NULL,
        attempts = 0,
        last_error = NULL,
        restore = excluded.restore
  RETURNING * INTO v_row;

  -- Pending notifications will not be sent.
  DELETE FROM public.notification_outbox WHERE user_id = v_uid AND sent_at IS NULL;

  RETURN jsonb_build_object('status', v_row.status, 'purge_after', v_row.purge_after);
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.account_deletion_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(20024200, hashtext(v_uid::text));
  SELECT * INTO v_row FROM public.account_deletion_requests WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  IF v_row.status = 'purging' THEN
    -- The purge already started: too late to undo safely.
    RAISE EXCEPTION 'deletion_in_progress';
  END IF;

  IF v_row.restore ? 'notification_workout_enabled' THEN
    UPDATE public.user_profiles
       SET notification_workout_enabled = coalesce((v_row.restore->>'notification_workout_enabled')::boolean, notification_workout_enabled),
           notification_nutrition_enabled = coalesce((v_row.restore->>'notification_nutrition_enabled')::boolean, notification_nutrition_enabled),
           notification_categories = CASE
             WHEN jsonb_typeof(v_row.restore->'notification_categories') = 'object' THEN v_row.restore->'notification_categories'
             ELSE NULL
           END
     WHERE id = v_uid;
  END IF;
  IF (v_row.restore->>'coach_profile_published')::boolean IS TRUE THEN
    UPDATE public.coach_profiles SET published = true WHERE coach_id = v_uid;
  END IF;

  UPDATE public.account_deletion_requests
     SET status = 'cancelled', cancelled_at = now(), restore = '{}'::jsonb
   WHERE user_id = v_uid;
  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

-- ---------------------------------------------------------------------------
-- Service: claim due requests, report failures, list thread files
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_due_account_deletions(p_limit integer DEFAULT 10, p_now timestamptz DEFAULT now())
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only the purge worker (service key). current_user is the owner here, so it proves nothing.
  IF coalesce(nullif(auth.role(), ''), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  UPDATE public.account_deletion_requests r
     SET status = 'purging', attempts = r.attempts + 1
   WHERE r.user_id IN (
     SELECT d.user_id FROM public.account_deletion_requests d
     WHERE d.status = 'pending' AND d.purge_after <= p_now
     ORDER BY d.purge_after
     LIMIT LEAST(GREATEST(coalesce(p_limit, 10), 1), 50)
     FOR UPDATE SKIP LOCKED
   )
  RETURNING r.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_account_deletions(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_account_deletions(integer, timestamptz) TO service_role;

-- A failed purge goes back to the queue (never silently dropped); after 5 tries it waits for an operator.
CREATE OR REPLACE FUNCTION public.release_account_deletion(p_user uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only the purge worker (service key). current_user is the owner here, so it proves nothing.
  IF coalesce(nullif(auth.role(), ''), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.account_deletion_requests
     SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
         last_error = left(coalesce(p_error, 'unknown'), 300)
   WHERE user_id = p_user AND status = 'purging';
END;
$$;

REVOKE ALL ON FUNCTION public.release_account_deletion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_account_deletion(uuid, text) TO service_role;

-- Message threads disappear with the account (FK cascade): their files go too,
-- whichever side of the thread the person was on.
CREATE OR REPLACE FUNCTION public.account_message_attachment_paths(p_user uuid)
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only the purge worker (service key). current_user is the owner here, so it proves nothing.
  IF coalesce(nullif(auth.role(), ''), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT o.name FROM storage.objects o
  WHERE o.bucket_id = 'message-attachments'
    AND (split_part(o.name, '/', 1) = p_user::text OR split_part(o.name, '/', 2) = p_user::text)
  ORDER BY o.name
  LIMIT 50000;
END;
$$;

REVOKE ALL ON FUNCTION public.account_message_attachment_paths(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_message_attachment_paths(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Cron: hourly purge of due requests through the delete-account function.
-- Needs the vault secret ACCOUNT_PURGE_CRON_SECRET (same value as the Edge
-- secret). Until it exists, the job fails loudly and nothing is deleted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoke_account_purge()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_req_id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_deletion_requests WHERE status = 'pending' AND purge_after <= now()
  ) THEN
    RETURN NULL;
  END IF;
  BEGIN
    SELECT ds.decrypted_secret INTO v_key FROM vault.decrypted_secrets ds WHERE ds.name = 'ACCOUNT_PURGE_CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'account purge: no ACCOUNT_PURGE_CRON_SECRET in vault';
  END IF;
  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION 'account purge: pg_net missing';
  END IF;
  SELECT net.http_post(
    url := 'https://phyuijjekxtjvipjtdfv.supabase.co/functions/v1/delete-account',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{"mode":"purge_due"}'::jsonb
  ) INTO v_req_id;
  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_account_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_account_purge() TO postgres, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-deletion-purge') THEN
    PERFORM cron.unschedule('account-deletion-purge');
  END IF;
  PERFORM cron.schedule('account-deletion-purge', '40 * * * *', 'SELECT public.invoke_account_purge()');
END $$;

COMMENT ON TABLE public.account_deletion_requests IS
  'Vision §30: requested deletions wait account_deletion_window() (14 days, to be validated legally), then are purged by the delete-account function. restore holds what was switched off, for cancellation.';
