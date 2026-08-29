-- Coach UX: last visit timestamp + optional prescription fields + coach-created drafts.
-- Coaching copy only: phyuijjekxtjvipjtdfv. Do not apply to the live tracker.

ALTER TABLE public.coach_client_links
  ADD COLUMN IF NOT EXISTS last_visited_at timestamptz;

ALTER TABLE public.program_day_exercises
  ADD COLUMN IF NOT EXISTS default_reps_min integer,
  ADD COLUMN IF NOT EXISTS default_rir integer;

DROP POLICY IF EXISTS "Coaches insert interventions for their clients" ON public.coach_interventions;
CREATE POLICY "Coaches insert interventions for their clients"
  ON public.coach_interventions FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = (select auth.uid())
    AND (client_id IS NULL OR public.is_coach_of(client_id))
  );

GRANT INSERT ON TABLE public.coach_interventions TO authenticated;
