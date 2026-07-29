DROP POLICY IF EXISTS "authenticated can append audit" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated;
REVOKE INSERT ON public.audit_log FROM anon;
GRANT ALL ON public.audit_log TO service_role;