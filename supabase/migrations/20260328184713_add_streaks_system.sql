/*
  # Add Streaks System

  1. New Tables
    - `user_streaks`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `current_streak` (int) - consecutive days with at least one activity logged
      - `longest_streak` (int) - all-time longest streak
      - `last_activity_date` (date) - last date an activity was logged
      - `streak_type` (text) - 'overall' (any activity), or future: 'workout', 'nutrition', etc.
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_streaks`
    - Users can only read/update their own streak data
*/

CREATE TABLE IF NOT EXISTS user_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_activity_date date,
  streak_type text NOT NULL DEFAULT 'overall',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, streak_type)
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streaks"
  ON user_streaks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own streaks"
  ON user_streaks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own streaks"
  ON user_streaks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
