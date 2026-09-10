/*
  Coaching layer, programs, session timer, prescribed sets, notification columns.

  1. user_roles.coaching_role: none | coach | client  (billing role unchanged)
  2. coach_invites + coach_client_links + coach_notes
  3. programs / program_days / program_day_exercises / program_assignments
  4. Coach read policies on client tracker data (auth.uid() helpers, no service_role)
  5. workout prescribed_* + session_started_at
  6. notification columns on user_profiles (the 20260405 migration targeted a non-existent `profiles` table)
*/

-- ============================================================
-- Coaching role (billing `role` stays free|premium|admin)
-- ============================================================
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS coaching_role text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_coaching_role_check;
  ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_coaching_role_check
    CHECK (coaching_role IN ('none', 'coach', 'client'));
END $$;

-- ============================================================
-- Coach–client links (created before helper functions that read them)
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coach_id <> client_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_client_links_pair_idx
  ON coach_client_links (coach_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS coach_client_one_active_coach
  ON coach_client_links (client_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS coach_client_links_coach_idx
  ON coach_client_links (coach_id) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.is_coach_of(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_client_links
    WHERE coach_id = auth.uid()
      AND client_id = p_client_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_client_of(p_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_client_links
    WHERE client_id = auth.uid()
      AND coach_id = p_coach_id
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_coach_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_client_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_coach_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_of(uuid) TO authenticated;

-- ============================================================
-- Invites
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_invites_coach_idx ON coach_invites (coach_id);
CREATE INDEX IF NOT EXISTS coach_invites_token_idx ON coach_invites (token);

-- ============================================================
-- Coach notes (day and/or workout)
-- ============================================================
CREATE TABLE IF NOT EXISTS coach_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_date date,
  workout_id uuid REFERENCES workouts(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (note_date IS NOT NULL OR workout_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS coach_notes_client_idx ON coach_notes (client_id, note_date DESC);
CREATE INDEX IF NOT EXISTS coach_notes_workout_idx ON coach_notes (workout_id);

-- ============================================================
-- Programs
-- ============================================================
CREATE TABLE IF NOT EXISTS programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_weeks integer NOT NULL DEFAULT 8 CHECK (duration_weeks BETWEEN 1 AND 52),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS programs_owner_idx ON programs (owner_id);

CREATE TABLE IF NOT EXISTS program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday (JS getDay)
  name text NOT NULL DEFAULT '',
  routine_id uuid REFERENCES routines(id) ON DELETE SET NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, weekday)
);

CREATE INDEX IF NOT EXISTS program_days_program_idx ON program_days (program_id);

CREATE TABLE IF NOT EXISTS program_day_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_day_id uuid NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_sets integer NOT NULL DEFAULT 3,
  default_reps integer NOT NULL DEFAULT 10,
  default_rest_seconds integer NOT NULL DEFAULT 90,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS program_day_exercises_day_idx ON program_day_exercises (program_day_id);

CREATE TABLE IF NOT EXISTS program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS program_assignments_one_active
  ON program_assignments (client_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS program_assignments_client_idx ON program_assignments (client_id);
CREATE INDEX IF NOT EXISTS program_assignments_program_idx ON program_assignments (program_id);

-- ============================================================
-- Workout session + prescribed targets
-- ============================================================
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS program_assignment_id uuid REFERENCES program_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_day_id uuid REFERENCES program_days(id) ON DELETE SET NULL;

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS prescribed_sets integer,
  ADD COLUMN IF NOT EXISTS prescribed_reps integer;

-- ============================================================
-- Notification settings actually live on user_profiles
-- ============================================================
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_workout_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_workout_time text NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS notification_nutrition_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_nutrition_time text NOT NULL DEFAULT '13:00';

-- ============================================================
-- RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_coaching_role(p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_role NOT IN ('none', 'coach') THEN
    RAISE EXCEPTION 'Invalid coaching role';
  END IF;

  INSERT INTO user_roles (user_id, role, coaching_role)
  VALUES (v_uid, 'free', p_role)
  ON CONFLICT (user_id) DO UPDATE
    SET coaching_role = CASE
      WHEN user_roles.coaching_role = 'client' AND p_role = 'none' THEN 'client'
      WHEN p_role = 'coach' THEN 'coach'
      WHEN user_roles.coaching_role = 'coach' AND p_role = 'none' THEN
        CASE WHEN EXISTS (
          SELECT 1 FROM coach_client_links
          WHERE client_id = v_uid AND status = 'active'
        ) THEN 'client' ELSE 'none' END
      ELSE p_role
    END,
    updated_at = now()
  RETURNING coaching_role INTO v_current;

  RETURN v_current;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_coach_invite_preview(p_token text)
RETURNS TABLE(valid boolean, coach_name text, expires_at timestamptz, remaining_uses integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite coach_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM coach_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz, 0;
    RETURN;
  END IF;
  IF v_invite.expires_at < now() OR v_invite.use_count >= v_invite.max_uses THEN
    RETURN QUERY SELECT false,
      (SELECT full_name FROM user_profiles WHERE id = v_invite.coach_id),
      v_invite.expires_at,
      GREATEST(v_invite.max_uses - v_invite.use_count, 0);
    RETURN;
  END IF;
  RETURN QUERY SELECT true,
    COALESCE((SELECT full_name FROM user_profiles WHERE id = v_invite.coach_id), ''),
    v_invite.expires_at,
    v_invite.max_uses - v_invite.use_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_coach_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite coach_invites%ROWTYPE;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM coach_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF v_invite.use_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;
  IF v_invite.coach_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self');
  END IF;

  SELECT coach_id INTO v_existing
  FROM coach_client_links
  WHERE client_id = v_uid AND status = 'active';

  IF v_existing IS NOT NULL AND v_existing <> v_invite.coach_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_coached');
  END IF;

  INSERT INTO coach_client_links (coach_id, client_id, status)
  VALUES (v_invite.coach_id, v_uid, 'active')
  ON CONFLICT (coach_id, client_id) DO UPDATE
    SET status = 'active', updated_at = now();

  UPDATE coach_invites
    SET use_count = use_count + 1
    WHERE id = v_invite.id;

  INSERT INTO user_roles (user_id, role, coaching_role)
  VALUES (v_uid, 'free', 'client')
  ON CONFLICT (user_id) DO UPDATE
    SET coaching_role = CASE
      WHEN user_roles.coaching_role = 'coach' THEN 'coach'
      ELSE 'client'
    END,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'coach_id', v_invite.coach_id,
    'coach_name', COALESCE((SELECT full_name FROM user_profiles WHERE id = v_invite.coach_id), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_coaching_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_invite_preview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_coach_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_coaching_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_invite_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_coach_invite(text) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE coach_client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_day_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view coaching links" ON coach_client_links;
CREATE POLICY "Participants can view coaching links"
  ON coach_client_links FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()) OR client_id = (select auth.uid()));

DROP POLICY IF EXISTS "Coaches can end their links" ON coach_client_links;
CREATE POLICY "Coaches can end their links"
  ON coach_client_links FOR UPDATE TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (coach_id = (select auth.uid()));

DROP POLICY IF EXISTS "Coaches manage own invites" ON coach_invites;
CREATE POLICY "Coaches manage own invites"
  ON coach_invites FOR ALL TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (coach_id = (select auth.uid()));

DROP POLICY IF EXISTS "Coaches manage notes they wrote" ON coach_notes;
CREATE POLICY "Coaches manage notes they wrote"
  ON coach_notes FOR ALL TO authenticated
  USING (coach_id = (select auth.uid()) AND public.is_coach_of(client_id))
  WITH CHECK (coach_id = (select auth.uid()) AND public.is_coach_of(client_id));

DROP POLICY IF EXISTS "Clients can read notes about them" ON coach_notes;
CREATE POLICY "Clients can read notes about them"
  ON coach_notes FOR SELECT TO authenticated
  USING (client_id = (select auth.uid()));

DROP POLICY IF EXISTS "Owners manage programs" ON programs;
CREATE POLICY "Owners manage programs"
  ON programs FOR ALL TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Assigned clients read programs" ON programs;
CREATE POLICY "Assigned clients read programs"
  ON programs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM program_assignments pa
      WHERE pa.program_id = programs.id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Owners manage program days" ON program_days;
CREATE POLICY "Owners manage program days"
  ON program_days FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM programs p WHERE p.id = program_days.program_id AND p.owner_id = (select auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM programs p WHERE p.id = program_days.program_id AND p.owner_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Assigned clients read program days" ON program_days;
CREATE POLICY "Assigned clients read program days"
  ON program_days FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM program_assignments pa
      WHERE pa.program_id = program_days.program_id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Owners manage program day exercises" ON program_day_exercises;
CREATE POLICY "Owners manage program day exercises"
  ON program_day_exercises FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM program_days d
      JOIN programs p ON p.id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id AND p.owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM program_days d
      JOIN programs p ON p.id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id AND p.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Assigned clients read program day exercises" ON program_day_exercises;
CREATE POLICY "Assigned clients read program day exercises"
  ON program_day_exercises FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM program_days d
      JOIN program_assignments pa ON pa.program_id = d.program_id
      WHERE d.id = program_day_exercises.program_day_id
        AND pa.client_id = (select auth.uid())
        AND pa.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Coaches and self manage assignments" ON program_assignments;
CREATE POLICY "Coaches and self manage assignments"
  ON program_assignments FOR ALL TO authenticated
  USING (
    assigned_by = (select auth.uid())
    OR client_id = (select auth.uid())
  )
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND (
      client_id = (select auth.uid())
      OR public.is_coach_of(client_id)
    )
  );

-- Coach read access to client tracker data (SELECT only)
DROP POLICY IF EXISTS "Coaches can read linked client profiles" ON user_profiles;
CREATE POLICY "Coaches can read linked client profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (public.is_coach_of(id));

DROP POLICY IF EXISTS "Clients can read their coach profile" ON user_profiles;
CREATE POLICY "Clients can read their coach profile"
  ON user_profiles FOR SELECT TO authenticated
  USING (public.is_client_of(id));

DROP POLICY IF EXISTS "Coaches can read client workouts" ON workouts;
CREATE POLICY "Coaches can read client workouts"
  ON workouts FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

DROP POLICY IF EXISTS "Coaches can read client workout exercises" ON workout_exercises;
CREATE POLICY "Coaches can read client workout exercises"
  ON workout_exercises FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id AND public.is_coach_of(w.user_id)
    )
  );

DROP POLICY IF EXISTS "Coaches can read client workout sets" ON workout_sets;
CREATE POLICY "Coaches can read client workout sets"
  ON workout_sets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workout_exercises e
      JOIN workouts w ON w.id = e.workout_id
      WHERE e.id = workout_sets.exercise_id AND public.is_coach_of(w.user_id)
    )
  );

DROP POLICY IF EXISTS "Coaches can read client nutrition" ON nutrition_logs;
CREATE POLICY "Coaches can read client nutrition"
  ON nutrition_logs FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

DROP POLICY IF EXISTS "Coaches can read client water" ON water_logs;
CREATE POLICY "Coaches can read client water"
  ON water_logs FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

DROP POLICY IF EXISTS "Coaches can read client weight" ON weight_measurements;
CREATE POLICY "Coaches can read client weight"
  ON weight_measurements FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

DROP POLICY IF EXISTS "Coaches can read client checkins" ON daily_checkins;
CREATE POLICY "Coaches can read client checkins"
  ON daily_checkins FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_client_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE programs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE program_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE program_day_exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE program_assignments TO authenticated;
