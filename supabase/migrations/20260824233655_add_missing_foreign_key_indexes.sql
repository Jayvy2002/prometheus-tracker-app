/*
  # Add missing foreign key indexes

  1. New Indexes
    - `exercise_requests.result_exercise_id` - index for FK to exercises
    - `exercises.created_by` - index for FK to auth.users
    - `food_favorites.product_id` - index for FK to food_products
    - `food_products.created_by` - index for FK to auth.users
    - `nutrition_logs.recipe_id` - index for FK to recipes
    - `product_requests.result_product_id` - index for FK to food_products
    - `recipe_ingredients.product_id` - index for FK to food_products
    - `user_feedback.user_id` - index for FK to auth.users

  2. Notes
    - These indexes improve JOIN and CASCADE performance on foreign keys
    - Uses IF NOT EXISTS to be safe for re-runs
*/

CREATE INDEX IF NOT EXISTS idx_exercise_requests_result_exercise_id
  ON exercise_requests (result_exercise_id);

CREATE INDEX IF NOT EXISTS idx_exercises_created_by
  ON exercises (created_by);

CREATE INDEX IF NOT EXISTS idx_food_favorites_product_id
  ON food_favorites (product_id);

CREATE INDEX IF NOT EXISTS idx_food_products_created_by
  ON food_products (created_by);

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_recipe_id
  ON nutrition_logs (recipe_id);

CREATE INDEX IF NOT EXISTS idx_product_requests_result_product_id
  ON product_requests (result_product_id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product_id
  ON recipe_ingredients (product_id);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id
  ON user_feedback (user_id);
