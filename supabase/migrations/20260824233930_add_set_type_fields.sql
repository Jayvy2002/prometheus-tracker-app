/*
  # Add duration and tempo fields to workout_sets

  1. Modified Tables
    - `workout_sets`
      - `duration_seconds` (integer, nullable) - For isometric holds, stores hold duration in seconds
      - `tempo` (text, nullable) - For tempo sets, stores tempo notation (e.g., "3-1-2-0")

  2. Notes
    - No RLS changes needed (same table, same ownership policies apply)
    - These columns are nullable so existing sets are unaffected
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_sets' AND column_name = 'duration_seconds'
  ) THEN
    ALTER TABLE workout_sets ADD COLUMN duration_seconds integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_sets' AND column_name = 'tempo'
  ) THEN
    ALTER TABLE workout_sets ADD COLUMN tempo text DEFAULT NULL;
  END IF;
END $$;
