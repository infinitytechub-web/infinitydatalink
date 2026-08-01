CREATE TABLE public.cron_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  run_key text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  attempt int NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  caller text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cron_job_runs_status_chk CHECK (status IN ('running','succeeded','failed')),
  CONSTRAINT cron_job_runs_job_run_key_uniq UNIQUE (job, run_key)
);

GRANT SELECT ON public.cron_job_runs TO authenticated;
GRANT ALL ON public.cron_job_runs TO service_role;

ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Governance roles can read job runs"
  ON public.cron_job_runs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role) OR private.has_role(auth.uid(), 'auditor'::public.app_role));

CREATE TRIGGER update_cron_job_runs_updated_at
  BEFORE UPDATE ON public.cron_job_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX cron_job_runs_job_started_idx ON public.cron_job_runs (job, started_at DESC);

-- Claim a run slot. Returns the existing row when this (job, run_key) already
-- completed, so a retried nightly batch never re-posts fees. A previously
-- failed or stale 'running' row is re-claimed with an incremented attempt.
CREATE OR REPLACE FUNCTION public.claim_cron_run(_job text, _run_key text, _caller text DEFAULT NULL, _stale_after interval DEFAULT interval '30 minutes')
RETURNS public.cron_job_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _row public.cron_job_runs%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.cron_job_runs
   WHERE job = _job AND run_key = _run_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.cron_job_runs (job, run_key, caller)
    VALUES (_job, _run_key, _caller)
    RETURNING * INTO _row;
    RETURN _row;
  END IF;

  IF _row.status = 'succeeded' THEN
    RETURN _row;
  END IF;

  IF _row.status = 'running' AND _row.started_at > now() - _stale_after THEN
    RETURN _row;
  END IF;

  UPDATE public.cron_job_runs
     SET status = 'running', attempt = _row.attempt + 1, started_at = now(),
         finished_at = NULL, duration_ms = NULL, error = NULL, caller = COALESCE(_caller, caller)
   WHERE id = _row.id
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_cron_run(text, text, text, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cron_run(text, text, text, interval) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_cron_run(_run_id uuid, _status text, _metrics jsonb DEFAULT '{}'::jsonb, _error text DEFAULT NULL)
RETURNS public.cron_job_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _row public.cron_job_runs%ROWTYPE;
BEGIN
  IF _status NOT IN ('succeeded','failed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE public.cron_job_runs
     SET status = _status,
         finished_at = now(),
         duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int),
         metrics = COALESCE(_metrics, '{}'::jsonb),
         error = _error
   WHERE id = _run_id
  RETURNING * INTO _row;

  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_cron_run(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_cron_run(uuid, text, jsonb, text) TO service_role;