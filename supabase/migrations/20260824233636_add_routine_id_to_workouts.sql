/*
  # Add routine_id to workouts

  1. Modified Tables
    - `workouts`
      - Added `routine_id` (uuid, nullable, references routines)
      - This allows reliable linking between a workout and the routine it was started from

  2. Data Migration
    - Backfill routine_id for existing workouts by matching exact name with routines
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'routine_id'
  ) THEN
    ALTER TABLE workouts ADD COLUMN routine_id uuid REFERENCES routines(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workouts_routine_id ON workouts(routine_id);

UPDATE workouts w
SET routine_id = r.id
FROM routines r
WHERE w.routine_id IS NULL
  AND w.user_id = r.user_id
  AND lower(trim(w.name)) = lower(trim(r.name));