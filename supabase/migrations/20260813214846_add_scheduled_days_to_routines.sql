/*
# Add scheduled_days to routines

1. Modified Tables
   - `routines`
     - `scheduled_days` (text array, nullable) — days of the week this routine is scheduled for (e.g. ['monday', 'wednesday', 'friday'])

2. Notes
   - This allows users to assign routines to specific days for weekly planning
   - Values are lowercase English day names: 'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routines' AND column_name = 'scheduled_days'
  ) THEN
    ALTER TABLE routines ADD COLUMN scheduled_days text[] DEFAULT NULL;
  END IF;
END $$;
