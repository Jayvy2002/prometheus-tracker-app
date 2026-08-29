-- Client live loop: assigned program, messages, coach-confirmed nutrition targets.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to the live / backup project.
-- No new tables. Realtime on tables the client app already reads.

ALTER TABLE public.coach_messages REPLICA IDENTITY FULL;
ALTER TABLE public.program_assignments REPLICA IDENTITY FULL;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip coach_messages';
END;
$pub$;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.program_assignments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip program_assignments';
END;
$pub$;

-- Filter is the PK `id`, so DEFAULT replica identity is enough for user_profiles.
DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip user_profiles';
END;
$pub$;
