/*
# Fix food_products.created_by foreign key to allow user deletion

1. Modified Tables
   - `food_products`: Changed the `created_by` foreign key constraint from NO ACTION to SET NULL
     so that deleting a user does not fail due to this FK reference.

2. Important Notes
   - The previous constraint (`food_products_created_by_fkey`) had no ON DELETE action,
     which caused "Database error deleting user" when attempting to remove a user account
     that had created food products.
   - Using SET NULL (instead of CASCADE) preserves the food product data for other users
     while removing the reference to the deleted user.
*/

ALTER TABLE food_products DROP CONSTRAINT IF EXISTS food_products_created_by_fkey;

ALTER TABLE food_products
  ADD CONSTRAINT food_products_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
