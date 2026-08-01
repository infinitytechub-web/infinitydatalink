CREATE OR REPLACE FUNCTION public.run_loan_arrears_job(_run_key text DEFAULT NULL, _caller text DEFAULT 'pg_cron')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _key text := COALESCE(_run_key, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD'));
  _run public.cron_job_runs;
  _arrears jsonb;
  _penalties jsonb;
  _metrics jsonb;
BEGIN
  _run := public.claim_cron_run('loan-arrears', _key, _caller);

  IF _run.status = 'succeeded' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'already_completed',
                              'run_key', _key, 'attempt', _run.attempt, 'metrics', _run.metrics);
  END IF;

  BEGIN
    _arrears := public.refresh_loan_arrears();
    _penalties := public.assess_loan_penalties();
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_cron_run(_run.id, 'failed', jsonb_build_object('attempt', _run.attempt), SQLERRM);
    RAISE;
  END;

  _metrics := jsonb_build_object(
    'loans_updated', COALESCE(_arrears->'loans_updated', '0'::jsonb),
    'as_of', _arrears->'as_of',
    'penalties_created', COALESCE(_penalties->'penalties_created', '0'::jsonb),
    'penalty_total', COALESCE(_penalties->'total_amount', '0'::jsonb),
    'period', _penalties->'period',
    'attempt', _run.attempt
  );

  _run := public.finish_cron_run(_run.id, 'succeeded', _metrics, NULL);

  RETURN jsonb_build_object('success', true, 'skipped', false, 'run_key', _key,
                            'attempt', _run.attempt, 'duration_ms', _run.duration_ms,
                            'metrics', _metrics);
END;
$$;
REVOKE ALL ON FUNCTION public.run_loan_arrears_job(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_loan_arrears_job(text, text) TO service_role;