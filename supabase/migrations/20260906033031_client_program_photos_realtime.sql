-- Client live loop: assigned program *content* (days / lifts) and progress photos.
-- Coaching copy: phyuijjekxtjvipjtdfv. Do not apply to the live / backup project.
-- No new tables. Realtime on tables the client app already reads (RLS unchanged).
-- program_days / program_day_exercises have no client_id — replica identity FULL so
-- DELETE payloads still include the row; the client refetches fetchMyAssignment.

ALTER TABLE public.program_days REPLICA IDENTITY FULL;
ALTER TABLE public.program_day_exercises REPLICA IDENTITY FULL;
ALTER TABLE public.progress_photos REPLICA IDENTITY FULL;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.program_days;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip program_days';
END;
$pub$;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.program_day_exercises;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip program_day_exercises';
END;
$pub$;

DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.progress_photos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing; skip progress_photos';
END;
$pub$;
