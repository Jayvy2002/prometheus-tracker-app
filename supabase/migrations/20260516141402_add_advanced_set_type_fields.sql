/*
  # Add advanced set type tracking fields

  1. Modified Tables
    - `workout_exercises`
      - `superset_group_id` (text, nullable) - Exercises sharing the same group_id are supersetted together
    - `workout_sets`
      - `cluster_rest_seconds` (integer, nullable) - Intra-set rest for cluster sets
      - `cluster_reps_per_burst` (integer, nullable) - Reps per burst within a cluster set
      - `myo_is_activation` (boolean, default false) - Distinguishes activation set from mini-sets in myo-rep
      - `drop_percentage` (integer, nullable) - Percentage reduction from previous set for drop sets

  2. Notes
    - No RLS changes needed (same tables, same ownership policies apply)
    - All columns are nullable/have defaults so existing data is unaffected
    - superset_group_id is a simple text key (UUID or short string) that groups exercises together
*/

DO $$
BEGIN
  -- workout_exercises: superset grouping
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_exercises' AND column_name = 'superset_group_id'
  ) THEN
    ALTER TABLE workout_exercises ADD COLUMN superset_group_id text DEFAULT NULL;
  END IF;

  -- workout_sets: cluster fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_sets' AND column_name = 'cluster_rest_seconds'
  ) THEN
    ALTER TABLE workout_sets ADD COLUMN cluster_rest_seconds integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_sets' AND column_name = 'cluster_reps_per_burst'
  ) THEN
    ALTER TABLE workout_sets ADD COLUMN cluster_reps_per_burst integer DEFAULT NULL;
  END IF;

  -- workout_sets: myo-rep activation marker
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_sets' AND column_name = 'myo_is_activation'
  ) THEN
    ALTER TABLE workout_sets ADD COLUMN myo_is_activation boolean DEFAULT false;
  END IF;

  -- workout_sets: drop percentage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_sets' AND column_name = 'drop_percentage'
  ) THEN
    ALTER TABLE workout_sets ADD COLUMN drop_percentage integer DEFAULT NULL;
  END IF;
END $$;
