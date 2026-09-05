-- Solo copilot — weekly kcal / macros review (docs/VISION.md, points 6 and 7).
-- One row per user per ISO week, written when the solo decides on the copilot's proposal.
-- Keeps « what was proposed / what was done » so the product can learn from it.
-- The copilot never applies anything by itself: `accepted` is the user's tap.

CREATE TABLE IF NOT EXISTS public.solo_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  action text NOT NULL CHECK (action IN ('keep', 'relance', 'calorie_adjustment')),
  reason text NOT NULL,
  proposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL CHECK (decision IN ('accepted', 'kept', 'dismissed')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

COMMENT ON TABLE public.solo_weekly_reviews IS
  'Solo copilot weekly review: proposal (keep / relance / calorie_adjustment + reason + proposed kcal & macros), the evidence it was based on, and the solo''s decision. One per user per ISO week.';
COMMENT ON COLUMN public.solo_weekly_reviews.proposed IS
  '{calories, protein, carbs, fat} when action = calorie_adjustment, {} otherwise.';
COMMENT ON COLUMN public.solo_weekly_reviews.evidence IS
  'Aggregates only (logged days, avg kcal, weigh-ins, delta kg, workouts) — never raw logs.';

CREATE INDEX IF NOT EXISTS solo_weekly_reviews_user_week_idx
  ON public.solo_weekly_reviews (user_id, week_start DESC);

ALTER TABLE public.solo_weekly_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_solo_weekly_reviews" ON public.solo_weekly_reviews;
CREATE POLICY "select_own_solo_weekly_reviews" ON public.solo_weekly_reviews
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "insert_own_solo_weekly_reviews" ON public.solo_weekly_reviews;
CREATE POLICY "insert_own_solo_weekly_reviews" ON public.solo_weekly_reviews
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "update_own_solo_weekly_reviews" ON public.solo_weekly_reviews;
CREATE POLICY "update_own_solo_weekly_reviews" ON public.solo_weekly_reviews
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- A coach who later links this athlete can read the history (same rule as the other athlete tables).
DROP POLICY IF EXISTS "coach_reads_client_solo_weekly_reviews" ON public.solo_weekly_reviews;
CREATE POLICY "coach_reads_client_solo_weekly_reviews" ON public.solo_weekly_reviews
  FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

REVOKE ALL ON public.solo_weekly_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.solo_weekly_reviews TO authenticated;
