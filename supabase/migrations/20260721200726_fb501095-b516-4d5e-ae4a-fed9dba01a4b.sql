CREATE TABLE IF NOT EXISTS public.runtime_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('route','api','rbac','render','network','server','other')),
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('error','warning','info')),
  route text,
  message text NOT NULL,
  stack text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  actor_role text,
  user_agent text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (char_length(message) <= 4000),
  CHECK (stack IS NULL OR char_length(stack) <= 20000)
);

CREATE INDEX IF NOT EXISTS runtime_error_logs_occurred_at_idx
  ON public.runtime_error_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS runtime_error_logs_kind_idx
  ON public.runtime_error_logs (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS runtime_error_logs_user_idx
  ON public.runtime_error_logs (user_id, occurred_at DESC);

GRANT INSERT ON public.runtime_error_logs TO anon, authenticated;
GRANT SELECT ON public.runtime_error_logs TO authenticated;
GRANT ALL ON public.runtime_error_logs TO service_role;

ALTER TABLE public.runtime_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "runtime_error_logs_insert_self_or_anon"
  ON public.runtime_error_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "runtime_error_logs_admin_select"
  ON public.runtime_error_logs
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'runtime_error_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.runtime_error_logs';
  END IF;
END $$;