-- Coaching copy only. Original Google Form questionnaire on the client profile.
-- Never write daily_calorie_target / macros from this payload.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS kinesiology_intake jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kinesiology_intake_completed_at timestamptz;

COMMENT ON COLUMN public.user_profiles.kinesiology_intake IS
  'Original Google Form answers (Nom, Prénom, Age, …). Extra keys live under extras. Coach-owned kcal/macros are not derived from this.';

COMMENT ON COLUMN public.user_profiles.kinesiology_intake_completed_at IS
  'When the coached-client invite questionnaire was completed. Skip the flow if set.';
