-- user_roles: source of truth for access control (separate from subscriptions which tracks Stripe billing)
-- Only the service role can write; clients can only read their own row.
CREATE TABLE user_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'premium', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION handle_user_roles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION handle_user_roles_updated_at();

-- RLS: users can only read their own role; no client-side write policy
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own role"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger: auto-create 'free' role entry when a user_profile is inserted
CREATE OR REPLACE FUNCTION handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_user_profile_created_role
  AFTER INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_role();

-- Backfill: assign 'free' to all existing users
INSERT INTO user_roles (user_id, role)
SELECT id, 'free' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
