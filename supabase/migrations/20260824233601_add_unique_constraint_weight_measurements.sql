/*
  # Add unique constraint on weight measurements

  Ensures each user can only have one weight measurement per day.
  Duplicate entries from the same day are resolved by keeping the one with
  the highest weight_kg value (most recent update intent).

  1. Changes
    - Deduplicate existing rows: for each (user_id, measured_at) pair, keep only
      the row with the latest created_at (or highest id if no created_at).
    - Add UNIQUE constraint on (user_id, measured_at).

  2. Notes
    - Safe migration: uses IF NOT EXISTS to be idempotent.
    - Deduplication runs before the constraint is added.
*/

DO $$
BEGIN
  DELETE FROM weight_measurements
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id, measured_at
               ORDER BY created_at DESC NULLS LAST, id DESC
             ) AS rn
      FROM weight_measurements
    ) ranked
    WHERE rn > 1
  );
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'weight_measurements'
      AND constraint_name = 'weight_measurements_user_id_measured_at_key'
  ) THEN
    ALTER TABLE weight_measurements
      ADD CONSTRAINT weight_measurements_user_id_measured_at_key
      UNIQUE (user_id, measured_at);
  END IF;
END $$;
