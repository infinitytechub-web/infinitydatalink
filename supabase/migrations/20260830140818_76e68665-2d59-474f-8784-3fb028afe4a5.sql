CREATE TABLE public.statement_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset TEXT NOT NULL,
  frequency TEXT NOT NULL,
  email BOOLEAN NOT NULL DEFAULT true,
  sms BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dataset, frequency)
);

CREATE INDEX idx_statement_schedules_due ON public.statement_schedules (next_run_at) WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_schedules TO authenticated;
GRANT ALL ON public.statement_schedules TO service_role;
ALTER TABLE public.statement_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own statement schedules"
ON public.statement_schedules FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.statement_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.statement_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  channels TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, period_start, period_end)
);

GRANT SELECT ON public.statement_runs TO authenticated;
GRANT ALL ON public.statement_runs TO service_role;
ALTER TABLE public.statement_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own statement runs"
ON public.statement_runs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE TABLE public.statement_job_lease (
  id TEXT NOT NULL PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.statement_job_lease TO service_role;
ALTER TABLE public.statement_job_lease ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only lease"
ON public.statement_job_lease FOR ALL TO service_role
USING (true) WITH CHECK (true);

INSERT INTO public.statement_job_lease (id, locked_until) VALUES ('statement-schedules', now() - interval '1 hour')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.statement_schedules_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_statement_schedules_touch
BEFORE UPDATE ON public.statement_schedules
FOR EACH ROW EXECUTE FUNCTION public.statement_schedules_touch();

CREATE OR REPLACE FUNCTION public.claim_statement_job_lease(_minutes INTEGER DEFAULT 10)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok BOOLEAN;
BEGIN
  UPDATE public.statement_job_lease
     SET locked_until = now() + make_interval(mins => GREATEST(_minutes, 1)),
         updated_at = now()
   WHERE id = 'statement-schedules' AND locked_until < now()
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_statement_job_lease(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_statement_job_lease(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.release_statement_job_lease()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.statement_job_lease
     SET locked_until = now() - interval '1 second', updated_at = now()
   WHERE id = 'statement-schedules';
$$;

REVOKE ALL ON FUNCTION public.release_statement_job_lease() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_statement_job_lease() TO service_role;