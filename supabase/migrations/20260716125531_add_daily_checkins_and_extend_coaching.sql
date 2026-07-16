/*
# Add Daily Check-ins Table and Extend Coaching Recommendations

1. New Tables
   - `daily_checkins`
     - `id` (uuid, primary key)
     - `user_id` (uuid, FK to auth.users, default auth.uid())
     - `checked_at` (date, the day this check-in is for)
     - `hunger` (integer 1-5, perceived hunger level)
     - `fatigue` (integer 1-5, perceived fatigue level)
     - `sleep_quality` (integer 1-5, subjective sleep quality)
     - `sleep_hours` (numeric, hours of sleep)
     - `stress` (integer 1-5, perceived stress level)
     - `motivation` (integer 1-5, training motivation)
     - `muscle_soreness` (integer 1-5, DOMS level)
     - `joint_pain` (integer 1-5, joint/tendon pain)
     - `adherence_nutrition` (integer 0-100, % adherence to nutrition plan)
     - `adherence_training` (integer 0-100, % adherence to training plan)
     - `energy_level` (integer 1-5, overall energy)
     - `mood` (integer 1-5, overall mood)
     - `notes` (text, free-form notes)
     - `created_at` / `updated_at` (timestamptz)

2. Modified Tables
   - `coaching_recommendations`: add `week_start`, `week_end`, `priority`, `category`,
     `metrics_snapshot`, `status` columns for enhanced decision tracking

3. Security
   - Enable RLS on daily_checkins with owner-scoped CRUD policies

4. Important Notes
   - daily_checkins has UNIQUE(user_id, checked_at) to prevent duplicate entries per day
   - Metrics use 1-5 scale for consistency (1=minimal, 5=extreme)
*/

-- Daily Check-ins table
CREATE TABLE IF NOT EXISTS daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_at date NOT NULL DEFAULT CURRENT_DATE,
  hunger integer CHECK (hunger BETWEEN 1 AND 5),
  fatigue integer CHECK (fatigue BETWEEN 1 AND 5),
  sleep_quality integer CHECK (sleep_quality BETWEEN 1 AND 5),
  sleep_hours numeric(3,1) CHECK (sleep_hours BETWEEN 0 AND 24),
  stress integer CHECK (stress BETWEEN 1 AND 5),
  motivation integer CHECK (motivation BETWEEN 1 AND 5),
  muscle_soreness integer CHECK (muscle_soreness BETWEEN 1 AND 5),
  joint_pain integer CHECK (joint_pain BETWEEN 1 AND 5),
  adherence_nutrition integer CHECK (adherence_nutrition BETWEEN 0 AND 100),
  adherence_training integer CHECK (adherence_training BETWEEN 0 AND 100),
  energy_level integer CHECK (energy_level BETWEEN 1 AND 5),
  mood integer CHECK (mood BETWEEN 1 AND 5),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, checked_at DESC);

ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_checkins" ON daily_checkins;
CREATE POLICY "select_own_checkins" ON daily_checkins FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_checkins" ON daily_checkins;
CREATE POLICY "insert_own_checkins" ON daily_checkins FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_checkins" ON daily_checkins;
CREATE POLICY "update_own_checkins" ON daily_checkins FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_checkins" ON daily_checkins;
CREATE POLICY "delete_own_checkins" ON daily_checkins FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Extend coaching_recommendations with additional tracking columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_recommendations' AND column_name = 'week_start') THEN
    ALTER TABLE coaching_recommendations ADD COLUMN week_start date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_recommendations' AND column_name = 'week_end') THEN
    ALTER TABLE coaching_recommendations ADD COLUMN week_end date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_recommendations' AND column_name = 'priority') THEN
    ALTER TABLE coaching_recommendations ADD COLUMN priority text DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_recommendations' AND column_name = 'category') THEN
    ALTER TABLE coaching_recommendations ADD COLUMN category text DEFAULT 'lifestyle';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_recommendations' AND column_name = 'metrics_snapshot') THEN
    ALTER TABLE coaching_recommendations ADD COLUMN metrics_snapshot jsonb DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_recommendations' AND column_name = 'status') THEN
    ALTER TABLE coaching_recommendations ADD COLUMN status text DEFAULT 'pending';
  END IF;
END $$;
