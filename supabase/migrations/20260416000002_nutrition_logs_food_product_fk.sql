-- Link nutrition_logs to the shared food_products catalog.
--
-- Each log entry now references the food_products row it was logged from.
-- The column is nullable so that:
--   - recipe logs (recipe_id set, no single product) can leave it null
--   - existing historical rows are preserved without data loss
--
-- Going forward, FoodForm always creates/finds a food_products entry first
-- and stores the id here before inserting the log.

ALTER TABLE nutrition_logs
  ADD COLUMN IF NOT EXISTS food_product_id uuid REFERENCES food_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_food_product_id
  ON nutrition_logs(food_product_id) WHERE food_product_id IS NOT NULL;
