/*
  # Drop unused indexes

  1. Changes
    - Removes 25 indexes that have never been used according to pg_stat_user_indexes
    - Unused indexes consume storage and slow down INSERT/UPDATE/DELETE operations
      without providing any query benefit

  2. Dropped Indexes
    - recipe_ingredients: idx_recipe_ingredients_recipe_id, idx_recipe_ingredients_product_id
    - food_favorites: idx_food_favorites_product_id
    - calorie_adjustment_suggestions: idx_calorie_suggestions_user_id, idx_calorie_suggestions_status
    - workouts: idx_workouts_date, idx_workouts_routine_id
    - exercises: idx_exercises_name, idx_exercises_verified, idx_exercises_category, idx_exercises_primary_muscles, idx_exercises_created_by
    - user_feedback: idx_user_feedback_user_id
    - weight_measurements: idx_weight_measurements_date
    - water_logs: idx_water_logs_user_id
    - food_products: idx_food_products_barcode, idx_food_products_created_by
    - product_requests: idx_product_requests_user_id, idx_product_requests_status, idx_product_requests_result_product_id
    - nutrition_logs: idx_nutrition_logs_user_id, idx_nutrition_logs_recipe_id
    - exercise_requests: idx_exercise_requests_user, idx_exercise_requests_status, idx_exercise_requests_result_exercise_id

  3. Notes
    - These indexes can be recreated later if query patterns change
    - Uses IF EXISTS for safety
*/

DROP INDEX IF EXISTS idx_recipe_ingredients_recipe_id;
DROP INDEX IF EXISTS idx_recipe_ingredients_product_id;
DROP INDEX IF EXISTS idx_food_favorites_product_id;
DROP INDEX IF EXISTS idx_calorie_suggestions_user_id;
DROP INDEX IF EXISTS idx_calorie_suggestions_status;
DROP INDEX IF EXISTS idx_workouts_date;
DROP INDEX IF EXISTS idx_workouts_routine_id;
DROP INDEX IF EXISTS idx_exercises_name;
DROP INDEX IF EXISTS idx_exercises_verified;
DROP INDEX IF EXISTS idx_exercises_category;
DROP INDEX IF EXISTS idx_exercises_primary_muscles;
DROP INDEX IF EXISTS idx_exercises_created_by;
DROP INDEX IF EXISTS idx_user_feedback_user_id;
DROP INDEX IF EXISTS idx_weight_measurements_date;
DROP INDEX IF EXISTS idx_water_logs_user_id;
DROP INDEX IF EXISTS idx_food_products_barcode;
DROP INDEX IF EXISTS idx_food_products_created_by;
DROP INDEX IF EXISTS idx_product_requests_user_id;
DROP INDEX IF EXISTS idx_product_requests_status;
DROP INDEX IF EXISTS idx_product_requests_result_product_id;
DROP INDEX IF EXISTS idx_nutrition_logs_user_id;
DROP INDEX IF EXISTS idx_nutrition_logs_recipe_id;
DROP INDEX IF EXISTS idx_exercise_requests_user;
DROP INDEX IF EXISTS idx_exercise_requests_status;
DROP INDEX IF EXISTS idx_exercise_requests_result_exercise_id;
