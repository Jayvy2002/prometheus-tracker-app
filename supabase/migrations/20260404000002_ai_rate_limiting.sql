-- AI usage logs for rate limiting edge functions
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text      NOT NULL,
  called_at   timestamptz DEFAULT now() NOT NULL
);

-- Index for fast per-user-per-day counts
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_function_day
  ON public.ai_usage_logs (user_id, function_name, called_at);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can insert/read — no client access
-- No RLS policies needed since no user-level access is granted
