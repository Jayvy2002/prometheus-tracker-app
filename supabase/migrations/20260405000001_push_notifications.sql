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

-- Notification settings stored in DB so the Edge Function can read them
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_workout_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_workout_time text NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS notification_nutrition_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_nutrition_time text NOT NULL DEFAULT '13:00';
