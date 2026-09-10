/*
  # Consolidate exercises SELECT policies

  1. Changes
    - Drops two separate permissive SELECT policies on the exercises table
    - Replaces them with a single SELECT policy that covers both cases
    - Users can read exercises that are either verified OR created by them

  2. Security
    - Same access patterns as before, just combined into one policy
    - Verified exercises remain readable by all authenticated users
    - Unverified exercises remain readable only by their creator
    - Using (select auth.uid()) for performance optimization
*/

DROP POLICY IF EXISTS "Authenticated users can read verified exercises" ON exercises;
DROP POLICY IF EXISTS "Users can read their own unverified exercises" ON exercises;

CREATE POLICY "Users can read verified or own exercises" ON exercises
  FOR SELECT TO authenticated
  USING (verified = true OR created_by = (select auth.uid()));
