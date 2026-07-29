CREATE TABLE public.admin_step_up_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('password','totp')),
  aal text,
  ip text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_step_up_sessions_user_idx ON public.admin_step_up_sessions (user_id, expires_at DESC);

GRANT SELECT ON public.admin_step_up_sessions TO authenticated;
GRANT ALL ON public.admin_step_up_sessions TO service_role;

ALTER TABLE public.admin_step_up_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own step-up sessions"
  ON public.admin_step_up_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_admin_step_up_sessions_updated_at
  BEFORE UPDATE ON public.admin_step_up_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();