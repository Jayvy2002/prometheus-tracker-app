/*
  # Allow multiple weight measurements per day

  Removes the unique constraint on (user_id, measured_at) so users can log
  several weigh-ins on the same day (e.g. morning and evening).

  1. Changes
    - Drop UNIQUE constraint weight_measurements_user_id_measured_at_key
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'weight_measurements'
      AND constraint_name = 'weight_measurements_user_id_measured_at_key'
  ) THEN
    ALTER TABLE weight_measurements
      DROP CONSTRAINT weight_measurements_user_id_measured_at_key;
  END IF;
END $$;
