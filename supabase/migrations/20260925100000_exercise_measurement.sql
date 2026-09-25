-- Audit 3 — a catalog exercise says how it is measured.
--
-- « Gainage » was logged in kg × reps because nothing marked it as a timed
-- hold. The catalog now carries that fact: 'reps' (default, every existing
-- exercise) or 'time' (a hold measured in seconds). The app reads it only to
-- choose the set type of new sets (isometric for 'time'); a set already
-- logged, a routine or a program prescription keeps what was written, and the
-- exercise name is never used to guess it.
--
-- Farmer Walk stays 'reps': it is loaded and measured by distance or time
-- depending on the athlete, so no default is imposed.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS measurement text NOT NULL DEFAULT 'reps';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exercises_measurement_check'
      AND conrelid = 'public.exercises'::regclass
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_measurement_check CHECK (measurement IN ('reps', 'time'));
  END IF;
END $$;

COMMENT ON COLUMN public.exercises.measurement IS
  'How the exercise is measured: reps (default) or time (a hold in seconds). Drives the set type of new sets only; never rewrites logged sets or prescriptions.';

-- The seeded plank (English name is the stable identity, see 20260924100000).
UPDATE public.exercises
SET measurement = 'time'
WHERE name = 'Plank'
  AND merged_into_id IS NULL
  AND measurement = 'reps';
