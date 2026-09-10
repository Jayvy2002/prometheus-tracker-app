-- Push subscriptions for Web Push API (VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Notification settings live on user_profiles in this repo (never `profiles`).
-- Replay local / CI : appliquer sur la table qui existe. Prod a déjà ces colonnes
-- via coaching_layer (horloge Git ≠ tampon prod — ne pas rejouer en prod).
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS notification_workout_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notification_workout_time text NOT NULL DEFAULT '18:00',
      ADD COLUMN IF NOT EXISTS notification_nutrition_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notification_nutrition_time text NOT NULL DEFAULT '13:00';
  ELSIF to_regclass('public.user_profiles') IS NOT NULL THEN
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS notification_workout_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notification_workout_time text NOT NULL DEFAULT '18:00',
      ADD COLUMN IF NOT EXISTS notification_nutrition_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notification_nutrition_time text NOT NULL DEFAULT '13:00';
  END IF;
END $$;
