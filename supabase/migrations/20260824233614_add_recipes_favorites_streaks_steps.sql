/*
  # Add Recipes, Food Favorites, Streaks, and Steps Tracking

  ## New Tables

  ### `recipes`
  - User-created recipes composed of multiple food ingredients
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `name` (text)
  - `description` (text)
  - `servings` (numeric) — number of servings the recipe makes
  - `calories_per_serving`, `protein_per_serving`, `carbs_per_serving`, `fat_per_serving` — computed macros per serving
  - `created_at`, `updated_at`

  ### `recipe_ingredients`
  - Individual ingredients of a recipe
  - `id` (uuid)
  - `recipe_id` (uuid, references recipes)
  - `product_id` (uuid, nullable, references food_products)
  - `name` (text)
  - `quantity` (numeric)
  - `unit` (text)
  - `calories`, `protein`, `carbs`, `fat` — per ingredient at given quantity
  - `created_at`

  ### `food_favorites`
  - User-marked favorite food products for quick re-log
  - `id` (uuid)
  - `user_id` (uuid)
  - `product_id` (uuid, nullable)
  - `product_name` (text)
  - `calories_per_100g`, `protein_per_100g`, `carbs_per_100g`, `fat_per_100g`
  - `serving_size`, `serving_unit`
  - `created_at`

  ### `daily_steps`
  - Manual or synced daily step count
  - `id` (uuid)
  - `user_id` (uuid)
  - `steps` (integer)
  - `logged_at` (date)
  - `created_at`

  ## Modified Tables
  - `nutrition_logs`: add `recipe_id` nullable column for logging a recipe as a single entry

  ## Security
  - RLS enabled on all new tables
  - Authenticated users can only access their own data
*/

CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  description text DEFAULT '',
  servings numeric NOT NULL DEFAULT 1,
  calories_per_serving numeric NOT NULL DEFAULT 0,
  protein_per_serving numeric NOT NULL DEFAULT 0,
  carbs_per_serving numeric NOT NULL DEFAULT 0,
  fat_per_serving numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own recipes"
  ON recipes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recipes"
  ON recipes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipes"
  ON recipes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipes"
  ON recipes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES food_products(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 100,
  unit text NOT NULL DEFAULT 'g',
  calories numeric NOT NULL DEFAULT 0,
  protein numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  fat numeric NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own recipe ingredients"
  ON recipe_ingredients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own recipe ingredients"
  ON recipe_ingredients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own recipe ingredients"
  ON recipe_ingredients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own recipe ingredients"
  ON recipe_ingredients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS food_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES food_products(id) ON DELETE SET NULL,
  product_name text NOT NULL DEFAULT '',
  brand text DEFAULT '',
  calories_per_100g numeric NOT NULL DEFAULT 0,
  protein_per_100g numeric NOT NULL DEFAULT 0,
  carbs_per_100g numeric NOT NULL DEFAULT 0,
  fat_per_100g numeric NOT NULL DEFAULT 0,
  serving_size numeric NOT NULL DEFAULT 100,
  serving_unit text NOT NULL DEFAULT 'g',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE food_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own favorites"
  ON food_favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
  ON food_favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON food_favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS daily_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  steps integer NOT NULL DEFAULT 0,
  logged_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, logged_at)
);

ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own steps"
  ON daily_steps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own steps"
  ON daily_steps FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own steps"
  ON daily_steps FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own steps"
  ON daily_steps FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nutrition_logs' AND column_name = 'recipe_id'
  ) THEN
    ALTER TABLE nutrition_logs ADD COLUMN recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_food_favorites_user_id ON food_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_steps_user_id_date ON daily_steps(user_id, logged_at);
