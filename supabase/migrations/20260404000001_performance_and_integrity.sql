/*
  # Performance, integrity and missing RPC fixes

  1. search_food_products RPC
     - Trigram-based text search on food_products (name + brand)
     - Requires pg_trgm extension
     - Accessible to authenticated users only

  2. Performance indexes
     - nutrition_logs(user_id, logged_at) composite — most frequent query pattern
     - water_logs(user_id, logged_at) composite
     - workouts(user_id, date DESC) composite

  3. Data integrity
     - CHECK constraints: calories/protein/carbs/fat >= 0 on nutrition_logs
     - updated_at column + trigger on workout_sets
     - updated_at column + trigger on workout_exercises

  4. GIN trigram indexes for food product search
     - food_products name + brand trigram indexes
*/

-- ─── Trigram extension ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── search_food_products RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_food_products(query text, max_results int DEFAULT 20)
RETURNS SETOF food_products
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM food_products
  WHERE
    name ILIKE '%' || query || '%'
    OR (brand IS NOT NULL AND brand ILIKE '%' || query || '%')
  ORDER BY
    CASE
      WHEN name ILIKE query || '%'        THEN 0
      WHEN name ILIKE '%' || query || '%' THEN 1
      ELSE                                     2
    END,
    similarity(name, query) DESC,
    name ASC
  LIMIT max_results;
$$;

-- Grant access to authenticated users (SECURITY DEFINER runs as owner)
GRANT EXECUTE ON FUNCTION search_food_products(text, int) TO authenticated;

-- GIN trigram indexes for fast ILIKE search
CREATE INDEX IF NOT EXISTS idx_food_products_name_trgm
  ON food_products USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_food_products_brand_trgm
  ON food_products USING gin(brand gin_trgm_ops);

-- ─── Performance indexes ──────────────────────────────────────────────────────
-- Most frequent query: fetchLogs(userId, date)
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date
  ON nutrition_logs(user_id, logged_at);

-- Most frequent query: fetchWaterLogs(userId, date)
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
  ON water_logs(user_id, logged_at);

-- Most frequent query: fetchWorkouts(userId) sorted by date desc
CREATE INDEX IF NOT EXISTS idx_workouts_user_date
  ON workouts(user_id, date DESC);

-- ─── Data integrity: CHECK constraints on nutrition_logs ──────────────────────
ALTER TABLE nutrition_logs
  ADD CONSTRAINT IF NOT EXISTS chk_nutrition_calories CHECK (calories >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_nutrition_protein  CHECK (protein  >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_nutrition_carbs    CHECK (carbs    >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_nutrition_fat      CHECK (fat      >= 0);

-- ─── updated_at on workout_sets ───────────────────────────────────────────────
ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Reuse existing update_updated_at() trigger function (created in subscriptions migration)
CREATE TRIGGER IF NOT EXISTS update_workout_sets_updated_at
  BEFORE UPDATE ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── updated_at on workout_exercises ─────────────────────────────────────────
ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER IF NOT EXISTS update_workout_exercises_updated_at
  BEFORE UPDATE ON workout_exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
