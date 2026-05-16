/*
  # Enhanced Onboarding Profile Fields

  1. Modified Tables
    - `user_profiles`
      - `diet_type` (text, default 'omnivore') - Dietary regime (omnivore, vegan, keto, etc.)
      - `food_allergies` (text[], default '{}') - Array of food allergies/intolerances
      - `meals_per_day` (integer, default 3) - Typical number of meals per day
      - `cooking_level` (text, default 'basic') - Cooking skill level
      - `daily_steps_average` (integer, default 7000) - Estimated average daily steps
      - `sleep_hours_average` (numeric, default 7.5) - Typical sleep duration in hours
      - `training_experience` (text, default 'beginner') - Training experience level
      - `training_frequency` (integer, default 3) - Planned sessions per week
      - `training_focus` (text, default 'hypertrophy') - Primary training style
      - `injuries_limitations` (text, default '') - Free text for injuries/mobility notes
      - `stress_level` (text, default 'moderate') - Self-reported stress level
      - `hydration_habit` (text, default 'average') - Current hydration habit quality
      - `supplement_use` (text[], default '{}') - Array of supplements used
      - `motivation` (text, default 'health') - Primary motivation for training

  2. Notes
    - All new columns have defaults so existing users are unaffected
    - No RLS changes needed (same table, same ownership policies)
    - Arrays use text[] for flexibility without needing junction tables
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'diet_type'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN diet_type text DEFAULT 'omnivore';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'food_allergies'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN food_allergies text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'meals_per_day'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN meals_per_day integer DEFAULT 3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'cooking_level'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN cooking_level text DEFAULT 'basic';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'daily_steps_average'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN daily_steps_average integer DEFAULT 7000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'sleep_hours_average'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN sleep_hours_average numeric DEFAULT 7.5;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'training_experience'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN training_experience text DEFAULT 'beginner';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'training_frequency'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN training_frequency integer DEFAULT 3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'training_focus'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN training_focus text DEFAULT 'hypertrophy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'injuries_limitations'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN injuries_limitations text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'stress_level'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN stress_level text DEFAULT 'moderate';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'hydration_habit'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN hydration_habit text DEFAULT 'average';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'supplement_use'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN supplement_use text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'motivation'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN motivation text DEFAULT 'health';
  END IF;
END $$;
