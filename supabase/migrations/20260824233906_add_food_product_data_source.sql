-- Track origin of food products (openfoodfacts, user-created, etc.)
ALTER TABLE food_products ADD COLUMN IF NOT EXISTS data_source text DEFAULT NULL;
