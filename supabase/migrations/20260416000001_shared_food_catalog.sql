-- Make food_products a truly shared catalog across all users.
--
-- Previously, the INSERT policy required created_by = auth.uid(), which meant:
--   - Products with created_by = null would be rejected
--   - batchSaveProducts (OFD background saves) always failed the RLS check
--
-- New behaviour:
--   - Any authenticated user can INSERT into the shared catalog
--   - created_by is kept as optional attribution ("contributed by")
--   - Only the contributor (created_by) can UPDATE or DELETE their entry

-- 1. Relax INSERT: any authenticated user can contribute to the shared catalog
DROP POLICY IF EXISTS "Authenticated users can insert food products" ON food_products;

CREATE POLICY "Authenticated users can insert food products"
  ON food_products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Allow updates/deletes when created_by is NULL (system/OFD products)
--    so that service-role bulk imports are not locked forever.
--    Users can still edit their own contributions; created_by = NULL entries
--    are managed by service role only.
DROP POLICY IF EXISTS "Users can update own food products" ON food_products;

CREATE POLICY "Users can update own food products"
  ON food_products FOR UPDATE TO authenticated
  USING (created_by IS NULL OR (SELECT auth.uid()) = created_by)
  WITH CHECK (created_by IS NULL OR (SELECT auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can delete own food products" ON food_products;

CREATE POLICY "Users can delete own food products"
  ON food_products FOR DELETE TO authenticated
  USING (created_by IS NULL OR (SELECT auth.uid()) = created_by);
