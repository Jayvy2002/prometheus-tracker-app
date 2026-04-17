-- Adds a nullable FK from nutrition_logs to food_products so logs can reference
-- a product instead of only duplicating its data inline. Inline columns remain
-- for backwards-compat and for manual/AI entries that are not persisted products.
-- This migration is idempotent — the column and FK may already exist in prod.

ALTER TABLE nutrition_logs
  ADD COLUMN IF NOT EXISTS food_product_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'nutrition_logs'
      AND constraint_name = 'nutrition_logs_food_product_id_fkey'
  ) THEN
    ALTER TABLE nutrition_logs
      ADD CONSTRAINT nutrition_logs_food_product_id_fkey
      FOREIGN KEY (food_product_id)
      REFERENCES food_products(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_food_product_id
  ON nutrition_logs(food_product_id);
