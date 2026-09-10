-- Language the user picks in Profil → Langue (fr | en).
--
-- The app has written `user_profiles.language` since the language switch shipped, but the
-- column never existed in production: every switch failed silently (profileStore.updateProfile
-- drops the error). This adds the column so the choice follows the account across devices and
-- so `coach-fleet-round` can write each coach's drafts in their language (FR when unset).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS language text
  CHECK (language IS NULL OR language IN ('fr', 'en'));

COMMENT ON COLUMN public.user_profiles.language IS
  'UI language chosen in Profil (fr | en). NULL = never chosen → FR. Read by coach-fleet-round for the coach''s drafts.';
