/*
  # Optimize RLS policies with (select auth.uid()) pattern

  1. Changes
    - All RLS policies across all tables are recreated using `(select auth.uid())` 
      instead of `auth.uid()` to prevent per-row re-evaluation
    - This wrapping causes Postgres to evaluate auth.uid() once as a subquery
      and cache the result, instead of calling it for every row

  2. Affected Tables
    - user_profiles (4 policies)
    - workouts (4 policies)
    - workout_exercises (4 policies)
    - workout_sets (4 policies)
    - routines (4 policies)
    - routine_exercises (4 policies)
    - weight_measurements (4 policies)
    - nutrition_logs (4 policies)
    - water_logs (4 policies)
    - food_products (4 policies)
    - product_requests (4 policies)
    - exercise_requests (3 policies)
    - exercises (3 policies)
    - recipes (4 policies)
    - recipe_ingredients (4 policies)
    - food_favorites (3 policies)
    - daily_steps (4 policies)
    - calorie_adjustment_suggestions (3 policies)
    - user_streaks (3 policies)
    - user_feedback (2 policies)

  3. Security
    - No changes to security model, only performance optimization
    - All policies retain the same access patterns
*/

-- ============================================================
-- user_profiles
-- ============================================================
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON user_profiles;
CREATE POLICY "Users can delete own profile" ON user_profiles
  FOR DELETE TO authenticated USING ((select auth.uid()) = id);

-- ============================================================
-- workouts
-- ============================================================
DROP POLICY IF EXISTS "Users can read own workouts" ON workouts;
CREATE POLICY "Users can read own workouts" ON workouts
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own workouts" ON workouts;
CREATE POLICY "Users can insert own workouts" ON workouts
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own workouts" ON workouts;
CREATE POLICY "Users can update own workouts" ON workouts
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own workouts" ON workouts;
CREATE POLICY "Users can delete own workouts" ON workouts
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- workout_exercises
-- ============================================================
DROP POLICY IF EXISTS "Users can read own workout exercises" ON workout_exercises;
CREATE POLICY "Users can read own workout exercises" ON workout_exercises
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can insert own workout exercises" ON workout_exercises;
CREATE POLICY "Users can insert own workout exercises" ON workout_exercises
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own workout exercises" ON workout_exercises;
CREATE POLICY "Users can update own workout exercises" ON workout_exercises
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete own workout exercises" ON workout_exercises;
CREATE POLICY "Users can delete own workout exercises" ON workout_exercises
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.user_id = (select auth.uid())));

-- ============================================================
-- workout_sets
-- ============================================================
DROP POLICY IF EXISTS "Users can read own workout sets" ON workout_sets;
CREATE POLICY "Users can read own workout sets" ON workout_sets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workout_exercises JOIN workouts ON workouts.id = workout_exercises.workout_id WHERE workout_exercises.id = workout_sets.exercise_id AND workouts.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can insert own workout sets" ON workout_sets;
CREATE POLICY "Users can insert own workout sets" ON workout_sets
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM workout_exercises JOIN workouts ON workouts.id = workout_exercises.workout_id WHERE workout_exercises.id = workout_sets.exercise_id AND workouts.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own workout sets" ON workout_sets;
CREATE POLICY "Users can update own workout sets" ON workout_sets
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM workout_exercises JOIN workouts ON workouts.id = workout_exercises.workout_id WHERE workout_exercises.id = workout_sets.exercise_id AND workouts.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM workout_exercises JOIN workouts ON workouts.id = workout_exercises.workout_id WHERE workout_exercises.id = workout_sets.exercise_id AND workouts.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete own workout sets" ON workout_sets;
CREATE POLICY "Users can delete own workout sets" ON workout_sets
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM workout_exercises JOIN workouts ON workouts.id = workout_exercises.workout_id WHERE workout_exercises.id = workout_sets.exercise_id AND workouts.user_id = (select auth.uid())));

-- ============================================================
-- routines
-- ============================================================
DROP POLICY IF EXISTS "Users can read own routines" ON routines;
CREATE POLICY "Users can read own routines" ON routines
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own routines" ON routines;
CREATE POLICY "Users can insert own routines" ON routines
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own routines" ON routines;
CREATE POLICY "Users can update own routines" ON routines
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own routines" ON routines;
CREATE POLICY "Users can delete own routines" ON routines
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- routine_exercises
-- ============================================================
DROP POLICY IF EXISTS "Users can read own routine exercises" ON routine_exercises;
CREATE POLICY "Users can read own routine exercises" ON routine_exercises
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id AND routines.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can insert own routine exercises" ON routine_exercises;
CREATE POLICY "Users can insert own routine exercises" ON routine_exercises
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id AND routines.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own routine exercises" ON routine_exercises;
CREATE POLICY "Users can update own routine exercises" ON routine_exercises
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id AND routines.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id AND routines.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete own routine exercises" ON routine_exercises;
CREATE POLICY "Users can delete own routine exercises" ON routine_exercises
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id AND routines.user_id = (select auth.uid())));

-- ============================================================
-- weight_measurements
-- ============================================================
DROP POLICY IF EXISTS "Users can read own weight measurements" ON weight_measurements;
CREATE POLICY "Users can read own weight measurements" ON weight_measurements
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own weight measurements" ON weight_measurements;
CREATE POLICY "Users can insert own weight measurements" ON weight_measurements
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own weight measurements" ON weight_measurements;
CREATE POLICY "Users can update own weight measurements" ON weight_measurements
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own weight measurements" ON weight_measurements;
CREATE POLICY "Users can delete own weight measurements" ON weight_measurements
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- nutrition_logs
-- ============================================================
DROP POLICY IF EXISTS "Users can read own nutrition logs" ON nutrition_logs;
CREATE POLICY "Users can read own nutrition logs" ON nutrition_logs
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own nutrition logs" ON nutrition_logs;
CREATE POLICY "Users can insert own nutrition logs" ON nutrition_logs
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own nutrition logs" ON nutrition_logs;
CREATE POLICY "Users can update own nutrition logs" ON nutrition_logs
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own nutrition logs" ON nutrition_logs;
CREATE POLICY "Users can delete own nutrition logs" ON nutrition_logs
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- water_logs
-- ============================================================
DROP POLICY IF EXISTS "Users can read own water logs" ON water_logs;
CREATE POLICY "Users can read own water logs" ON water_logs
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own water logs" ON water_logs;
CREATE POLICY "Users can insert own water logs" ON water_logs
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own water logs" ON water_logs;
CREATE POLICY "Users can update own water logs" ON water_logs
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own water logs" ON water_logs;
CREATE POLICY "Users can delete own water logs" ON water_logs
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- food_products
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read all food products" ON food_products;
CREATE POLICY "Authenticated users can read all food products" ON food_products
  FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert food products" ON food_products;
CREATE POLICY "Authenticated users can insert food products" ON food_products
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can update own food products" ON food_products;
CREATE POLICY "Users can update own food products" ON food_products
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = created_by) WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can delete own food products" ON food_products;
CREATE POLICY "Users can delete own food products" ON food_products
  FOR DELETE TO authenticated USING ((select auth.uid()) = created_by);

-- ============================================================
-- product_requests
-- ============================================================
DROP POLICY IF EXISTS "Users can read own product requests" ON product_requests;
CREATE POLICY "Users can read own product requests" ON product_requests
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own product requests" ON product_requests;
CREATE POLICY "Users can insert own product requests" ON product_requests
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own product requests" ON product_requests;
CREATE POLICY "Users can update own product requests" ON product_requests
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own product requests" ON product_requests;
CREATE POLICY "Users can delete own product requests" ON product_requests
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- exercise_requests
-- ============================================================
DROP POLICY IF EXISTS "Users can read own exercise requests" ON exercise_requests;
CREATE POLICY "Users can read own exercise requests" ON exercise_requests
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create exercise requests" ON exercise_requests;
CREATE POLICY "Users can create exercise requests" ON exercise_requests
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own exercise requests" ON exercise_requests;
CREATE POLICY "Users can update own exercise requests" ON exercise_requests
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- exercises
-- ============================================================
DROP POLICY IF EXISTS "Users can read their own unverified exercises" ON exercises;
CREATE POLICY "Users can read their own unverified exercises" ON exercises
  FOR SELECT TO authenticated USING (created_by = (select auth.uid()) AND verified = false);

DROP POLICY IF EXISTS "Users can insert exercises" ON exercises;
CREATE POLICY "Users can insert exercises" ON exercises
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ============================================================
-- recipes
-- ============================================================
DROP POLICY IF EXISTS "Users can read own recipes" ON recipes;
CREATE POLICY "Users can read own recipes" ON recipes
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own recipes" ON recipes;
CREATE POLICY "Users can insert own recipes" ON recipes
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own recipes" ON recipes;
CREATE POLICY "Users can update own recipes" ON recipes
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own recipes" ON recipes;
CREATE POLICY "Users can delete own recipes" ON recipes
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- recipe_ingredients
-- ============================================================
DROP POLICY IF EXISTS "Users can read own recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can read own recipe ingredients" ON recipe_ingredients
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can insert own recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can insert own recipe ingredients" ON recipe_ingredients
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can update own recipe ingredients" ON recipe_ingredients
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete own recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can delete own recipe ingredients" ON recipe_ingredients
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = (select auth.uid())));

-- ============================================================
-- food_favorites
-- ============================================================
DROP POLICY IF EXISTS "Users can read own favorites" ON food_favorites;
CREATE POLICY "Users can read own favorites" ON food_favorites
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own favorites" ON food_favorites;
CREATE POLICY "Users can insert own favorites" ON food_favorites
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own favorites" ON food_favorites;
CREATE POLICY "Users can delete own favorites" ON food_favorites
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- daily_steps
-- ============================================================
DROP POLICY IF EXISTS "Users can read own steps" ON daily_steps;
CREATE POLICY "Users can read own steps" ON daily_steps
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own steps" ON daily_steps;
CREATE POLICY "Users can insert own steps" ON daily_steps
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own steps" ON daily_steps;
CREATE POLICY "Users can update own steps" ON daily_steps
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own steps" ON daily_steps;
CREATE POLICY "Users can delete own steps" ON daily_steps
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- calorie_adjustment_suggestions
-- Table absente de cette histoire Git (et de la prod actuelle).
-- Replay local / CI : no-op. Ne pas créer la table : elle n'existe pas en prod.
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.calorie_adjustment_suggestions') IS NULL THEN
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "Users can read own calorie suggestions" ON calorie_adjustment_suggestions;
  CREATE POLICY "Users can read own calorie suggestions" ON calorie_adjustment_suggestions
    FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

  DROP POLICY IF EXISTS "Users can insert own calorie suggestions" ON calorie_adjustment_suggestions;
  CREATE POLICY "Users can insert own calorie suggestions" ON calorie_adjustment_suggestions
    FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

  DROP POLICY IF EXISTS "Users can update own calorie suggestions" ON calorie_adjustment_suggestions;
  CREATE POLICY "Users can update own calorie suggestions" ON calorie_adjustment_suggestions
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
END $$;

-- ============================================================
-- user_streaks
-- ============================================================
DROP POLICY IF EXISTS "Users can view own streaks" ON user_streaks;
CREATE POLICY "Users can view own streaks" ON user_streaks
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own streaks" ON user_streaks;
CREATE POLICY "Users can insert own streaks" ON user_streaks
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own streaks" ON user_streaks;
CREATE POLICY "Users can update own streaks" ON user_streaks
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- user_feedback
-- ============================================================
DROP POLICY IF EXISTS "Users can read own feedback" ON user_feedback;
CREATE POLICY "Users can read own feedback" ON user_feedback
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own feedback" ON user_feedback;
CREATE POLICY "Users can insert own feedback" ON user_feedback
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
