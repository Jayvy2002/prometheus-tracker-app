-- Vision §19: one thread per relationship, now with replies, references to
-- canonical objects and private attachments stored per thread.
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

CREATE FUNCTION pg_temp.expect_error(p_sql text, p_like text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE p_like THEN
      RAISE EXCEPTION 'expected error like %, got %', p_like, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error like %, statement succeeded: %', p_like, p_sql;
END;
$$;

-- 1 Coach, 2 active client, 3 stranger, 4 prospect, 5 other client of the Coach.
INSERT INTO auth.users(id, email) VALUES
 ('c7c00000-0000-4000-8000-000000000001', 'c7c-coach@example.test'),
 ('c7c00000-0000-4000-8000-000000000002', 'c7c-client@example.test'),
 ('c7c00000-0000-4000-8000-000000000003', 'c7c-stranger@example.test'),
 ('c7c00000-0000-4000-8000-000000000004', 'c7c-prospect@example.test'),
 ('c7c00000-0000-4000-8000-000000000005', 'c7c-client2@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c7c00000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c7c00000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c7c00000-0000-4000-8000-000000000003', 'free', 'none'),
 ('c7c00000-0000-4000-8000-000000000004', 'free', 'none'),
 ('c7c00000-0000-4000-8000-000000000005', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
INSERT INTO public.coach_client_links(coach_id, client_id, status) VALUES
 ('c7c00000-0000-4000-8000-000000000001', 'c7c00000-0000-4000-8000-000000000002', 'active'),
 ('c7c00000-0000-4000-8000-000000000001', 'c7c00000-0000-4000-8000-000000000005', 'active');

-- Objects that can be referenced.
INSERT INTO public.athlete_goals(id, user_id, kind, status, created_by) VALUES
 ('c7c00000-0000-4000-8000-0000000000a1', 'c7c00000-0000-4000-8000-000000000002', 'performance', 'active', 'c7c00000-0000-4000-8000-000000000002'),
 ('c7c00000-0000-4000-8000-0000000000a2', 'c7c00000-0000-4000-8000-000000000005', 'performance', 'active', 'c7c00000-0000-4000-8000-000000000005');
INSERT INTO public.programs(id, owner_id, name) VALUES
 ('c7c00000-0000-4000-8000-0000000000b1', 'c7c00000-0000-4000-8000-000000000001', 'Bloc force'),
 ('c7c00000-0000-4000-8000-0000000000b2', 'c7c00000-0000-4000-8000-000000000003', 'Programme d’un inconnu');

DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.coach_message_bilan_owned()', 'execute')
     OR has_function_privilege('anon', 'public.message_thread_writable(text,text)', 'execute') THEN
    RAISE EXCEPTION 'rich message grants mismatch';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'message-attachments') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'message-attachments bucket must be private';
  END IF;
  -- Descriptor shape is closed.
  IF public.message_attachments_valid('[{"path":"x","kind":"image","mime":"image/png","size":1,"name":"a"}]') THEN
    RAISE EXCEPTION 'bad path accepted';
  END IF;
  IF public.message_attachments_valid(jsonb_build_array(jsonb_build_object(
      'path', 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f1.png',
      'kind', 'image', 'mime', 'image/png', 'size', 10, 'name', 'a.png', 'extra', 'nope'))) THEN
    RAISE EXCEPTION 'unknown descriptor key accepted';
  END IF;
  IF public.message_attachments_valid(jsonb_build_array(jsonb_build_object(
      'path', 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f1.png',
      'kind', 'image', 'mime', 'image/png', 'size', 30000000, 'name', 'a.png'))) THEN
    RAISE EXCEPTION 'oversized attachment accepted';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

-- Coach uploads into the thread folder, sends text + attachment + program reference.
SELECT pg_temp.as_user('c7c00000-0000-4000-8000-000000000001');
INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES (
  'message-attachments',
  'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f1.mp4',
  auth.uid(), auth.uid()::text
);
DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, program_id, attachments)
  VALUES (
    auth.uid(), 'c7c00000-0000-4000-8000-000000000002', auth.uid(), 'Regarde ta technique au squat', 'general_followup',
    'c7c00000-0000-4000-8000-0000000000b1',
    jsonb_build_array(jsonb_build_object(
      'path', 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f1.mp4',
      'kind', 'video', 'mime', 'video/mp4', 'size', 1200000, 'name', 'squat.mp4', 'duration_s', 18))
  ) RETURNING id INTO v_id;
  PERFORM set_config('c7c.first', v_id::text, true);

  -- A sent attachment is part of the thread: its uploader cannot remove it.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE name = 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f1.mp4';
  PERFORM set_config('storage.allow_delete_query', 'false', true);
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE name = 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f1.mp4'
  ) THEN
    RAISE EXCEPTION 'sent attachment removed';
  END IF;
END $$;

-- Coach: foreign program, another client's goal, attachment of another thread, missing file, two refs, empty.
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, program_id)
  VALUES (auth.uid(), 'c7c00000-0000-4000-8000-000000000002', auth.uid(), 'x', 'general_followup', 'c7c00000-0000-4000-8000-0000000000b2')
$q$, 'program_not_in_relationship');
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, goal_id)
  VALUES (auth.uid(), 'c7c00000-0000-4000-8000-000000000002', auth.uid(), 'x', 'general_followup', 'c7c00000-0000-4000-8000-0000000000a2')
$q$, 'goal_not_client');
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, attachments)
  VALUES (auth.uid(), 'c7c00000-0000-4000-8000-000000000005', auth.uid(), 'x', 'general_followup',
    jsonb_build_array(jsonb_build_object(
      'path', 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f1.mp4',
      'kind', 'video', 'mime', 'video/mp4', 'size', 1200000, 'name', 'squat.mp4')))
$q$, 'attachment_not_in_thread');
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, attachments)
  VALUES (auth.uid(), 'c7c00000-0000-4000-8000-000000000002', auth.uid(), '', 'general_followup',
    jsonb_build_array(jsonb_build_object(
      'path', 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f9.png',
      'kind', 'image', 'mime', 'image/png', 'size', 10, 'name', 'ghost.png')))
$q$, 'attachment_missing');
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, program_id, goal_id)
  VALUES (auth.uid(), 'c7c00000-0000-4000-8000-000000000002', auth.uid(), 'x', 'general_followup',
    'c7c00000-0000-4000-8000-0000000000b1', 'c7c00000-0000-4000-8000-0000000000a1')
$q$, '%coach_messages_one_ref%');
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key)
  VALUES (auth.uid(), 'c7c00000-0000-4000-8000-000000000002', auth.uid(), '   ', 'general_followup')
$q$, '%coach_messages_body_length_check%');
-- Upload into a thread the Coach is not part of.
SELECT pg_temp.expect_error($q$
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES (
    'message-attachments',
    'c7c00000-0000-4000-8000-000000000003/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f2.png',
    auth.uid(), auth.uid()::text)
$q$, '%row-level security%');

-- Client: voice-only reply to the Coach's message, about their own goal.
SELECT pg_temp.as_user('c7c00000-0000-4000-8000-000000000002');
INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES (
  'message-attachments',
  'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f3.webm',
  auth.uid(), auth.uid()::text
);
DO $$
DECLARE
  n int;
BEGIN
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, reply_to_id, goal_id, attachments)
  VALUES (
    'c7c00000-0000-4000-8000-000000000001', auth.uid(), auth.uid(), '', 'reply',
    current_setting('c7c.first')::uuid,
    'c7c00000-0000-4000-8000-0000000000a1',
    jsonb_build_array(jsonb_build_object(
      'path', 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f3.webm',
      'kind', 'audio', 'mime', 'audio/webm', 'size', 40000, 'name', 'vocal.webm', 'duration_s', 12))
  );
  -- Both parties read the thread's files.
  SELECT count(*) INTO n FROM storage.objects
  WHERE bucket_id = 'message-attachments'
    AND name LIKE 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/%';
  IF n <> 2 THEN RAISE EXCEPTION 'client sees % thread files, expected 2', n; END IF;
  -- The recipient can only mark as read: content stays as sent.
  BEGIN
    UPDATE public.coach_messages SET attachments = '[]'::jsonb WHERE id = current_setting('c7c.first')::uuid;
    RAISE EXCEPTION 'recipient rewrote attachments';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
-- A reply must stay in its thread; the client cannot point at the Coach's other client.
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, goal_id)
  VALUES ('c7c00000-0000-4000-8000-000000000001', auth.uid(), auth.uid(), 'x', 'reply', 'c7c00000-0000-4000-8000-0000000000a2')
$q$, 'goal_not_client');
-- An unsent upload can be cleaned by its uploader.
INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES (
  'message-attachments',
  'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f4.pdf',
  auth.uid(), auth.uid()::text
);
DO $$
DECLARE
  n int;
BEGIN
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE name = 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f4.pdf';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('storage.allow_delete_query', 'false', true);
  IF n <> 1 THEN RAISE EXCEPTION 'unsent upload not removable'; END IF;
END $$;

-- Stranger: sees no thread file, cannot upload there.
SELECT pg_temp.as_user('c7c00000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'message-attachments') THEN
    RAISE EXCEPTION 'stranger reads message attachments';
  END IF;
END $$;
SELECT pg_temp.expect_error($q$
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES (
    'message-attachments',
    'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000002/c7c00000-0000-4000-8000-0000000000f5.png',
    auth.uid(), auth.uid()::text)
$q$, '%row-level security%');

-- Prospect: text and attachments before activation, never references.
SELECT pg_temp.as_user('c7c00000-0000-4000-8000-000000000001');
SELECT public.save_my_coach_profile('{"public_name":"Rich Coach","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["fr"],"formats":["online"],"published":true,"accepting_clients":true}');
SELECT pg_temp.as_user('c7c00000-0000-4000-8000-000000000004');
SELECT public.request_coaching(
  'c7c00000-0000-4000-8000-000000000001', 'Prospect', 'Looking for a coach', 3,
  'c7c00000-0000-4000-8000-0000000000c1', '{"summary":"Looking for a coach"}'::jsonb
);
INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES (
  'message-attachments',
  'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000004/c7c00000-0000-4000-8000-0000000000f6.jpg',
  auth.uid(), auth.uid()::text
);
INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, attachments)
VALUES (
  'c7c00000-0000-4000-8000-000000000001', auth.uid(), auth.uid(), 'Mon dernier bilan', 'reply',
  jsonb_build_array(jsonb_build_object(
    'path', 'c7c00000-0000-4000-8000-000000000001/c7c00000-0000-4000-8000-000000000004/c7c00000-0000-4000-8000-0000000000f6.jpg',
    'kind', 'image', 'mime', 'image/jpeg', 'size', 5000, 'name', 'bilan.jpg'))
);
SELECT pg_temp.expect_error($q$
  INSERT INTO public.coach_messages(coach_id, client_id, sender_id, body, template_key, exercise_name)
  VALUES ('c7c00000-0000-4000-8000-000000000001', auth.uid(), auth.uid(), 'Mon squat', 'reply', 'Squat')
$q$, 'refs_need_active_relationship');

ROLLBACK;
\echo 'rich messages: replies in thread, canonical references owned, attachments private per thread, prospect text only, content immutable'
