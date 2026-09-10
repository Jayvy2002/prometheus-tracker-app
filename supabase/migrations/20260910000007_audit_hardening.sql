-- Audit lots 6–7 : Q02 (buckets), Q05 (index + initplan), durcissement (chap. 10).
--
-- 1. Le trigger d'historique des cibles n'est pas une RPC : revoke complet.
-- 2. 12 index FK manquants (advisor unindexed_foreign_keys).
-- 3. 7 policies auth_rls_initplan → (select auth.uid()).
-- 4. Limites Storage par bucket (5 Mo, JPEG/PNG/WebP).
--
-- Volontairement inchangé (documenté) :
-- - index "inutilisés" : base quasi vide, le signal ne veut rien dire ;
-- - paires de policies SELECT permissives : sémantiquement un OR correct,
--   fusion reportée après mise en place de tests RLS ;
-- - pg_trgm/pg_net dans public : posture Supabase par défaut ; déplacement
--   risqué sans staging (recherche food + cron fleet en dépendent) ;
-- - ai_usage_logs sans policy cliente : journal serveur uniquement, refus voulu ;
-- - get_coach_invite_preview callable par anon : parcours d'invitation voulu
--   (token opaque, champs minimaux : valid/coach_name/expires/remaining).

-- 1. Trigger ≠ RPC appelable.
REVOKE ALL ON FUNCTION public.record_nutrition_target_history() FROM PUBLIC, anon, authenticated;

-- 2. Index FK manquants.
CREATE INDEX IF NOT EXISTS exercise_requests_result_exercise_id_idx ON public.exercise_requests (result_exercise_id);
CREATE INDEX IF NOT EXISTS exercise_requests_user_id_idx ON public.exercise_requests (user_id);
CREATE INDEX IF NOT EXISTS exercises_created_by_idx ON public.exercises (created_by);
CREATE INDEX IF NOT EXISTS food_favorites_product_id_idx ON public.food_favorites (product_id);
CREATE INDEX IF NOT EXISTS food_products_created_by_idx ON public.food_products (created_by);
CREATE INDEX IF NOT EXISTS nutrition_logs_recipe_id_idx ON public.nutrition_logs (recipe_id);
CREATE INDEX IF NOT EXISTS product_requests_result_product_id_idx ON public.product_requests (result_product_id);
CREATE INDEX IF NOT EXISTS product_requests_user_id_idx ON public.product_requests (user_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_product_id_idx ON public.recipe_ingredients (product_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_id_idx ON public.recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS user_feedback_user_id_idx ON public.user_feedback (user_id);
CREATE INDEX IF NOT EXISTS workouts_routine_id_idx ON public.workouts (routine_id);

-- 3. initplan : auth.uid() évalué une fois par requête.
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "select_own_checkins" ON public.daily_checkins;
CREATE POLICY "select_own_checkins" ON public.daily_checkins FOR SELECT
  TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "insert_own_checkins" ON public.daily_checkins;
CREATE POLICY "insert_own_checkins" ON public.daily_checkins FOR INSERT
  TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "update_own_checkins" ON public.daily_checkins;
CREATE POLICY "update_own_checkins" ON public.daily_checkins FOR UPDATE
  TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "delete_own_checkins" ON public.daily_checkins;
CREATE POLICY "delete_own_checkins" ON public.daily_checkins FOR DELETE
  TO authenticated USING ((select auth.uid()) = user_id);

-- 4. Q02 : limites Storage serveur (le client valide aussi, messages utiles).
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('avatars', 'product-images', 'progress-photos');
