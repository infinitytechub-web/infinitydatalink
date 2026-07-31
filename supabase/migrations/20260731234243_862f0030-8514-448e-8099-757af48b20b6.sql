-- The eligibility helper takes a user id, so allowing signed-in users to call
-- it directly would let anyone probe another member's savings balance. Restrict
-- it to trusted server code, which resolves the caller before invoking it.
REVOKE ALL ON FUNCTION public.check_loan_eligibility(uuid, uuid, numeric, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_loan_eligibility(uuid, uuid, numeric, int) TO service_role;