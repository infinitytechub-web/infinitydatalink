CREATE TABLE IF NOT EXISTS public.presence_sessions (
  token uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS presence_sessions_user_id_idx ON public.presence_sessions (user_id);
CREATE INDEX IF NOT EXISTS presence_sessions_created_at_idx ON public.presence_sessions (created_at);

GRANT SELECT, INSERT ON public.presence_sessions TO authenticated;
GRANT ALL ON public.presence_sessions TO service_role;

ALTER TABLE public.presence_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presence_sessions_insert_own"
  ON public.presence_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "presence_sessions_select_own"
  ON public.presence_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());