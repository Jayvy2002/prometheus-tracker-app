-- Vision §30: deletion is requested, access withdrawn at once, recoverable
-- during the window, purged only when due, by the service alone.
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

-- 1 coach with a published profile and notifications on, 2 other person, 3 client of 1.
INSERT INTO auth.users(id, email) VALUES
 ('c7e00000-0000-4000-8000-000000000001', 'c7e-coach@example.test'),
 ('c7e00000-0000-4000-8000-000000000002', 'c7e-other@example.test'),
 ('c7e00000-0000-4000-8000-000000000003', 'c7e-client@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c7e00000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c7e00000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c7e00000-0000-4000-8000-000000000003', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
UPDATE public.user_profiles
   SET notification_workout_enabled = true,
       notification_nutrition_enabled = true,
       notification_categories = '{"messages":true,"checkins":false}'::jsonb
 WHERE id = 'c7e00000-0000-4000-8000-000000000001';
INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES
 ('message-attachments', 'c7e00000-0000-4000-8000-000000000001/c7e00000-0000-4000-8000-000000000003/c7e00000-0000-4000-8000-0000000000f1.png', 'c7e00000-0000-4000-8000-000000000001', 'c7e00000-0000-4000-8000-000000000001'),
 ('message-attachments', 'c7e00000-0000-4000-8000-0000000000aa/c7e00000-0000-4000-8000-000000000001/c7e00000-0000-4000-8000-0000000000f2.pdf', 'c7e00000-0000-4000-8000-000000000001', 'c7e00000-0000-4000-8000-000000000001'),
 ('message-attachments', 'c7e00000-0000-4000-8000-0000000000aa/c7e00000-0000-4000-8000-000000000002/c7e00000-0000-4000-8000-0000000000f3.pdf', 'c7e00000-0000-4000-8000-000000000002', 'c7e00000-0000-4000-8000-000000000002');

DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.claim_due_account_deletions(integer,timestamptz)', 'execute')
     OR has_function_privilege('authenticated', 'public.release_account_deletion(uuid,text)', 'execute')
     OR has_function_privilege('authenticated', 'public.account_message_attachment_paths(uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.invoke_account_purge()', 'execute')
     OR has_function_privilege('anon', 'public.request_account_deletion()', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.request_account_deletion()', 'execute')
     OR has_table_privilege('authenticated', 'public.account_deletion_requests', 'insert')
     OR has_table_privilege('authenticated', 'public.account_deletion_requests', 'update') THEN
    RAISE EXCEPTION 'account deletion grants mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-deletion-purge' AND command = 'SELECT public.invoke_account_purge()') THEN
    RAISE EXCEPTION 'purge job missing';
  END IF;
END $$;

-- Coach publishes a profile.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c7e00000-0000-4000-8000-000000000001');
SELECT public.save_my_coach_profile('{"public_name":"Deleting Coach","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true}');

-- Request: nothing deleted, access withdrawn, idempotent.
DO $$
DECLARE
  v jsonb;
  v2 jsonb;
  p public.user_profiles;
BEGIN
  v := public.request_account_deletion();
  IF v->>'status' <> 'pending' THEN RAISE EXCEPTION 'request status %', v->>'status'; END IF;
  IF (v->>'purge_after')::timestamptz < now() + interval '13 days' THEN RAISE EXCEPTION 'window too short'; END IF;
  v2 := public.request_account_deletion();
  IF v2->>'purge_after' <> v->>'purge_after' THEN RAISE EXCEPTION 'second request moved the date'; END IF;
  SELECT * INTO p FROM public.user_profiles WHERE id = auth.uid();
  IF p.notification_workout_enabled OR p.notification_nutrition_enabled
     OR (p.notification_categories->>'messages')::boolean THEN
    RAISE EXCEPTION 'notifications still on while pending';
  END IF;
  IF EXISTS (SELECT 1 FROM public.coach_profiles WHERE coach_id = auth.uid() AND published) THEN
    RAISE EXCEPTION 'marketplace profile still visible while pending';
  END IF;
  -- The account and its data are untouched until the purge.
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()) THEN RAISE EXCEPTION 'profile removed at request'; END IF;
END $$;

-- The service cannot purge before the date; the person cannot call the service.
DO $$ BEGIN
  BEGIN
    PERFORM public.claim_due_account_deletions(10, now() + interval '30 days');
    RAISE EXCEPTION 'person claimed purges';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.as_service();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.claim_due_account_deletions(10, now())) THEN
    RAISE EXCEPTION 'purged before the window ended';
  END IF;
END $$;

-- Cancel: everything back exactly as it was.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c7e00000-0000-4000-8000-000000000001');
DO $$
DECLARE
  p public.user_profiles;
BEGIN
  IF public.cancel_account_deletion()->>'status' <> 'cancelled' THEN RAISE EXCEPTION 'cancel failed'; END IF;
  SELECT * INTO p FROM public.user_profiles WHERE id = auth.uid();
  IF NOT p.notification_workout_enabled OR NOT p.notification_nutrition_enabled
     OR p.notification_categories IS DISTINCT FROM '{"messages":true,"checkins":false}'::jsonb THEN
    RAISE EXCEPTION 'notifications not restored: %', p.notification_categories;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coach_profiles WHERE coach_id = auth.uid() AND published) THEN
    RAISE EXCEPTION 'marketplace profile not restored';
  END IF;
  IF public.cancel_account_deletion()->>'status' <> 'none' THEN RAISE EXCEPTION 'second cancel not idempotent'; END IF;
  PERFORM public.request_account_deletion();
END $$;

-- Another person sees nothing of it.
SELECT pg_temp.as_user('c7e00000-0000-4000-8000-000000000002');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.account_deletion_requests) THEN RAISE EXCEPTION 'other person reads deletion requests'; END IF;
END $$;

-- Service: due only after the window, failures go back to the queue, then stop at 5.
RESET ROLE;
SELECT pg_temp.as_service();
DO $$
DECLARE
  v_ids uuid[];
  r public.account_deletion_requests;
  n int;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.claim_due_account_deletions(10, now() + interval '15 days') id;
  IF v_ids IS DISTINCT FROM ARRAY['c7e00000-0000-4000-8000-000000000001'::uuid] THEN RAISE EXCEPTION 'due claim %', v_ids; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_due_account_deletions(10, now() + interval '15 days')) THEN
    RAISE EXCEPTION 'purging request claimed twice';
  END IF;
  PERFORM public.release_account_deletion('c7e00000-0000-4000-8000-000000000001', 'storage_cleanup_failed');
  SELECT * INTO r FROM public.account_deletion_requests WHERE user_id = 'c7e00000-0000-4000-8000-000000000001';
  IF r.status <> 'pending' OR r.last_error <> 'storage_cleanup_failed' OR r.attempts <> 1 THEN
    RAISE EXCEPTION 'failure not requeued: % % %', r.status, r.last_error, r.attempts;
  END IF;
  FOR n IN 1..4 LOOP
    PERFORM public.claim_due_account_deletions(10, now() + interval '15 days');
    PERFORM public.release_account_deletion('c7e00000-0000-4000-8000-000000000001', 'again');
  END LOOP;
  SELECT * INTO r FROM public.account_deletion_requests WHERE user_id = 'c7e00000-0000-4000-8000-000000000001';
  IF r.status <> 'failed' THEN RAISE EXCEPTION 'retries never stop: % after % attempts', r.status, r.attempts; END IF;

  -- Thread files on both sides of the person's conversations, nobody else's.
  SELECT count(*) INTO n FROM public.account_message_attachment_paths('c7e00000-0000-4000-8000-000000000001');
  IF n <> 2 THEN RAISE EXCEPTION 'thread files %, expected 2', n; END IF;
END $$;

-- A person cannot cancel once the purge started.
UPDATE public.account_deletion_requests SET status = 'purging' WHERE user_id = 'c7e00000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('c7e00000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    PERFORM public.cancel_account_deletion();
    RAISE EXCEPTION 'cancelled during purge';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'deletion_in_progress' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
\echo 'account deletion window: request withdraws access and keeps data, cancel restores exactly, purge only when due and by the service, retries bounded'
