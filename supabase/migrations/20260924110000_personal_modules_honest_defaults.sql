-- Onboarding minimal (Vision §5.3) : le Solo choisit ce qu'il suit, et rien
-- n'est inventé à sa place.
--
-- 1. personal_modules : choix du Solo (séances, nutrition, poids, check-in).
--    NULL = pas encore choisi → tout reste visible, comme avant (aucun compte
--    existant ne perd un écran). Un Coach actif garde la main via
--    client_tracking_config ; ce choix ne vaut que sans Coach.
-- 2. training_equipment : le matériel disponible, demandé à l'accueil (salle,
--    maison avec haltères, poids du corps, mixte). NULL = pas renseigné.
-- 3. Les objectifs eau et pas ne sont plus préremplis (2 500 ml, 10 000 pas)
--    pour les nouveaux comptes : absent ≠ objectif. Les comptes existants
--    gardent leurs valeurs (on ne distingue pas un choix d'un défaut).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS personal_modules jsonb;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_personal_modules_shape;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_personal_modules_shape CHECK (
    personal_modules IS NULL
    OR (
      jsonb_typeof(personal_modules) = 'object'
      -- only the four known modules…
      AND (personal_modules - ARRAY['workouts', 'nutrition', 'weight', 'checkins']) = '{}'::jsonb
      -- …each a boolean when present.
      AND jsonb_typeof(COALESCE(personal_modules -> 'workouts', 'true'::jsonb)) = 'boolean'
      AND jsonb_typeof(COALESCE(personal_modules -> 'nutrition', 'true'::jsonb)) = 'boolean'
      AND jsonb_typeof(COALESCE(personal_modules -> 'weight', 'true'::jsonb)) = 'boolean'
      AND jsonb_typeof(COALESCE(personal_modules -> 'checkins', 'true'::jsonb)) = 'boolean'
    )
  );

COMMENT ON COLUMN public.user_profiles.personal_modules IS
  'Solo module choice {workouts,nutrition,weight,checkins: boolean}. NULL = not chosen (all shown). Ignored while a coach is active.';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS training_equipment text;
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_training_equipment_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_training_equipment_check
  CHECK (training_equipment IS NULL OR training_equipment IN ('gym', 'home', 'bodyweight', 'mixed'));

ALTER TABLE public.user_profiles
  ALTER COLUMN daily_water_target_ml DROP DEFAULT,
  ALTER COLUMN daily_steps_target DROP DEFAULT;
