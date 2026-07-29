ALTER TABLE public.savings_sweeps
  ADD COLUMN IF NOT EXISTS min_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_amount numeric,
  ADD COLUMN IF NOT EXISTS last_run_amount numeric;

ALTER TABLE public.savings_sweeps
  DROP CONSTRAINT IF EXISTS savings_sweeps_min_balance_check,
  DROP CONSTRAINT IF EXISTS savings_sweeps_max_amount_check;

ALTER TABLE public.savings_sweeps
  ADD CONSTRAINT savings_sweeps_min_balance_check CHECK (min_balance >= 0),
  ADD CONSTRAINT savings_sweeps_max_amount_check CHECK (max_amount IS NULL OR max_amount > 0);

CREATE OR REPLACE FUNCTION public.run_savings_sweeps()
 RETURNS TABLE(sweep_id uuid, outcome text, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  v_transfer public.transfers;
  v_next timestamptz;
  v_balance numeric;
  v_available numeric;
  v_amount numeric;
BEGIN
  FOR rec IN
    SELECT * FROM public.savings_sweeps
    WHERE status = 'active' AND next_run_at <= now()
    ORDER BY next_run_at ASC
    LIMIT 200
  LOOP
    BEGIN
      -- verify both accounts still belong to owner and are active
      SELECT f.balance INTO v_balance
      FROM public.savings_accounts f
      JOIN public.savings_accounts t ON t.id = rec.to_account_id
      WHERE f.id = rec.from_account_id
        AND f.user_id = rec.user_id
        AND t.user_id = rec.user_id
        AND f.status = 'active'
        AND t.status = 'active';

      IF v_balance IS NULL THEN
        RAISE EXCEPTION 'account_not_available';
      END IF;

      -- per-account rules: keep min_balance in source, cap at max_amount
      v_available := v_balance - COALESCE(rec.min_balance, 0);
      v_amount := LEAST(rec.amount, COALESCE(rec.max_amount, rec.amount), v_available);
      v_amount := round(COALESCE(v_amount, 0), 2);

      v_next := public.advance_recurring_next_run(rec.next_run_at, rec.frequency, rec.day_of_week, rec.day_of_month);

      IF v_amount <= 0 THEN
        UPDATE public.savings_sweeps
        SET last_run_at = now(),
            last_run_status = 'skipped',
            last_run_error = 'min_balance_threshold_not_met',
            last_run_amount = 0,
            next_run_at = v_next
        WHERE id = rec.id;
        sweep_id := rec.id; outcome := 'skipped'; error := 'min_balance_threshold_not_met'; RETURN NEXT;
        CONTINUE;
      END IF;

      SELECT * INTO v_transfer FROM public.post_transfer(
        rec.from_account_id, rec.to_account_id, v_amount, 'sweep',
        COALESCE(rec.note, 'Scheduled sweep'), rec.user_id
      );
      -- auto-clear because owner controls both accounts
      PERFORM public.clear_transfer(v_transfer.id, rec.user_id);

      UPDATE public.savings_sweeps
      SET last_run_at = now(),
          last_run_status = 'success',
          last_run_error = NULL,
          last_run_amount = v_amount,
          runs_completed = runs_completed + 1,
          next_run_at = v_next
      WHERE id = rec.id;

      sweep_id := rec.id; outcome := 'success'; error := NULL; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.savings_sweeps
      SET last_run_at = now(),
          last_run_status = 'failed',
          last_run_error = SQLERRM,
          next_run_at = now() + interval '1 hour'
      WHERE id = rec.id;
      sweep_id := rec.id; outcome := 'failed'; error := SQLERRM; RETURN NEXT;
    END;
  END LOOP;
END;
$function$;