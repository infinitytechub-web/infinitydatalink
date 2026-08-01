-- Roles must never be writable directly by client roles (privilege escalation guard).
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, SELECT ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Cron ledger rows must only be written by the scheduled/definer routines.
REVOKE INSERT, UPDATE, DELETE ON public.cron_job_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, SELECT ON public.cron_job_runs FROM anon;
GRANT SELECT ON public.cron_job_runs TO authenticated;
GRANT ALL ON public.cron_job_runs TO service_role;
