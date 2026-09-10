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
-- Replay local / CI : ADD CONSTRAINT IF NOT EXISTS n'est pas du SQL Postgres
-- (IF est lu comme nom de contrainte). Prod a déjà ces checks sous un autre horodatage.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_nutrition_calories') THEN
    ALTER TABLE nutrition_logs ADD CONSTRAINT chk_nutrition_calories CHECK (calories >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_nutrition_protein') THEN
    ALTER TABLE nutrition_logs ADD CONSTRAINT chk_nutrition_protein CHECK (protein >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_nutrition_carbs') THEN
    ALTER TABLE nutrition_logs ADD CONSTRAINT chk_nutrition_carbs CHECK (carbs >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_nutrition_fat') THEN
    ALTER TABLE nutrition_logs ADD CONSTRAINT chk_nutrition_fat CHECK (fat >= 0);
  END IF;
END $$;

-- ─── updated_at on workout_sets / workout_exercises ───────────────────────────────
-- La fonction n'est créée en prod que plus tard (dump 20260910044211).
-- Replay local : la définir ici avant les triggers.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS update_workout_sets_updated_at ON workout_sets;
CREATE TRIGGER update_workout_sets_updated_at
  BEFORE UPDATE ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS update_workout_exercises_updated_at ON workout_exercises;
CREATE TRIGGER update_workout_exercises_updated_at
  BEFORE UPDATE ON workout_exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
