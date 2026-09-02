-- Product usage telemetry (docs/VISION.md, chantier 5).
-- The app records what coaches, coached clients and solos actually use, accept, edit or ignore,
-- so the product is steered by data rather than guesses.
--
-- Insert-only from the app (RLS: a user may only write rows about themselves).
-- No SELECT policy for app roles: read with the service role / SQL editor.
-- props never carry personal data (no names, emails, free text) — only ids, kinds, booleans, counts.

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('coach', 'client', 'solo')),
  event text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_events IS
  'Product telemetry. One row per user action (screen_view, intake_completed, intervention_resolved, …). Insert-only from the app. Event names: src/lib/types.ts ProductEventName.';
COMMENT ON COLUMN public.product_events.role IS
  'Viewer role at the time of the event: coach / client (linked to a coach) / solo.';
COMMENT ON COLUMN public.product_events.props IS
  'Small structured context (kind, status, booleans, counts). Never personal data or free text.';

CREATE INDEX IF NOT EXISTS product_events_event_created_idx
  ON public.product_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS product_events_user_created_idx
  ON public.product_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_events_role_created_idx
  ON public.product_events (role, created_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_product_events" ON public.product_events;
CREATE POLICY "insert_own_product_events" ON public.product_events
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

REVOKE ALL ON public.product_events FROM anon;
GRANT INSERT ON public.product_events TO authenticated;
