/*
  # Add description column to exercise_requests

  1. Modified Tables
    - `exercise_requests`
      - Added `description` (text, default '') - allows users to describe the exercise when proposing it

  2. Notes
    - This helps the AI better understand and verify the proposed exercise
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercise_requests' AND column_name = 'description'
  ) THEN
    ALTER TABLE exercise_requests ADD COLUMN description text DEFAULT '';
  END IF;
END $$;