
GRANT EXECUTE ON FUNCTION public.submit_dividend_run_for_approval(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_dividend_run(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_dividend_run(uuid, uuid, text) TO authenticated;
