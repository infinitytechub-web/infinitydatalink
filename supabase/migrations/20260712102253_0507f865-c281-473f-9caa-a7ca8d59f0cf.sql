
-- The trigger function is only invoked by the trigger runtime; no client
-- should call it directly.
REVOKE ALL ON FUNCTION public.profiles_guard_sensitive_columns() FROM PUBLIC, anon, authenticated;

-- Ensure the reset helper cannot be invoked anonymously.
REVOKE ALL ON FUNCTION public.reset_own_kyc_pending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_own_kyc_pending() TO authenticated;
