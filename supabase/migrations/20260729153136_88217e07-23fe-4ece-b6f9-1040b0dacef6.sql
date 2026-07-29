
-- ============================================================
-- 1. Goal progress columns
-- ============================================================
ALTER TABLE public.savings_accounts
  ADD COLUMN IF NOT EXISTS goal_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS goal_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_milestone_pct smallint NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Goal milestone trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_goal_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pct integer;
  last_pct integer;
  milestone integer;
  new_milestone integer := 0;
BEGIN
  IF NEW.goal_amount IS NULL OR NEW.goal_amount <= 0 THEN
    RETURN NEW;
  END IF;
  pct := LEAST(100, FLOOR((NEW.balance / NEW.goal_amount) * 100))::integer;
  last_pct := COALESCE(NEW.last_milestone_pct, 0);
  FOREACH milestone IN ARRAY ARRAY[25,50,75,100] LOOP
    IF pct >= milestone AND last_pct < milestone THEN
      new_milestone := milestone;
    END IF;
  END LOOP;
  IF new_milestone > 0 THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (
      NEW.user_id,
      'savings.goal',
      'Savings goal ' || new_milestone || '% reached',
      'Your savings account has reached ' || new_milestone || '% of its goal.',
      '/app/savings/' || NEW.id
    );
    NEW.last_milestone_pct := new_milestone;
    IF new_milestone = 100 AND NEW.goal_completed_at IS NULL THEN
      NEW.goal_completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_goal_milestone ON public.savings_accounts;
CREATE TRIGGER trg_notify_goal_milestone
BEFORE UPDATE OF balance, goal_amount ON public.savings_accounts
FOR EACH ROW EXECUTE FUNCTION public.notify_goal_milestone();

-- ============================================================
-- 3. Savings sweeps table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.savings_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id uuid NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  to_account_id uuid NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  frequency recurring_frequency NOT NULL,
  day_of_week smallint,
  day_of_month smallint,
  status recurring_status NOT NULL DEFAULT 'active',
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_run_status text,
  last_run_error text,
  runs_completed integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_sweeps TO authenticated;
GRANT ALL ON public.savings_sweeps TO service_role;

ALTER TABLE public.savings_sweeps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sweeps_owner_select" ON public.savings_sweeps
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "sweeps_owner_write" ON public.savings_sweeps
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_savings_sweeps_next_run ON public.savings_sweeps (next_run_at) WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_savings_sweeps_updated_at ON public.savings_sweeps;
CREATE TRIGGER trg_savings_sweeps_updated_at
BEFORE UPDATE ON public.savings_sweeps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. Savings statements table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.savings_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  opening_balance numeric(14,2) NOT NULL,
  closing_balance numeric(14,2) NOT NULL,
  deposits_total numeric(14,2) NOT NULL DEFAULT 0,
  withdrawals_total numeric(14,2) NOT NULL DEFAULT 0,
  interest_credited numeric(14,2) NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, period_start, period_end)
);

GRANT SELECT ON public.savings_statements TO authenticated;
GRANT ALL ON public.savings_statements TO service_role;

ALTER TABLE public.savings_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "statements_owner_select" ON public.savings_statements
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "statements_staff_select" ON public.savings_statements
  FOR SELECT TO authenticated USING (
    private.has_role(auth.uid(), 'super_admin'::app_role) OR
    private.has_role(auth.uid(), 'finance_officer'::app_role) OR
    private.has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_savings_statements_account_period
  ON public.savings_statements (account_id, period_end DESC);

-- ============================================================
-- 5. Monthly interest accrual
-- ============================================================
CREATE OR REPLACE FUNCTION public.accrue_monthly_interest(_period_end date DEFAULT NULL)
RETURNS TABLE(account_id uuid, interest numeric, closing_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_end date := COALESCE(_period_end, (date_trunc('month', now()) - interval '1 day')::date);
  p_start date := (date_trunc('month', p_end::timestamp))::date;
  rec RECORD;
  v_rate numeric;
  v_interest numeric;
  v_opening numeric;
  v_deposits numeric;
  v_withdrawals numeric;
  v_txn_id uuid;
BEGIN
  FOR rec IN
    SELECT sa.id, sa.user_id, sa.balance, sp.interest_rate
    FROM public.savings_accounts sa
    JOIN public.savings_plans sp ON sp.id = sa.plan_id
    WHERE sa.status = 'active'
  LOOP
    v_rate := COALESCE(rec.interest_rate, 0);
    v_interest := ROUND(rec.balance * v_rate / 12.0 / 100.0, 2);

    -- opening balance = current - deposits + withdrawals inside period
    SELECT
      COALESCE(SUM(CASE WHEN t.kind IN ('deposit','transfer_in','interest') AND t.status='cleared' THEN t.amount ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN t.kind IN ('withdrawal','transfer_out','fee') AND t.status='cleared' THEN t.amount ELSE 0 END),0)
    INTO v_deposits, v_withdrawals
    FROM public.transactions t
    WHERE t.savings_account_id = rec.id
      AND t.created_at >= p_start
      AND t.created_at < (p_end + 1);

    v_opening := rec.balance - v_deposits + v_withdrawals;

    IF v_interest > 0 THEN
      INSERT INTO public.transactions(ref, user_id, kind, amount, status, channel, savings_account_id, note)
      VALUES (public.gen_txn_ref('INT'), rec.user_id, 'interest'::txn_kind, v_interest, 'cleared'::txn_status, 'accrual', rec.id,
              'Interest ' || to_char(p_start,'YYYY-MM'))
      RETURNING id INTO v_txn_id;

      UPDATE public.savings_accounts SET balance = balance + v_interest WHERE id = rec.id;
      v_deposits := v_deposits + v_interest;
    END IF;

    INSERT INTO public.savings_statements(account_id, user_id, period_start, period_end, opening_balance, closing_balance, deposits_total, withdrawals_total, interest_credited)
    VALUES (rec.id, rec.user_id, p_start, p_end, v_opening, rec.balance + COALESCE(v_interest,0), v_deposits, v_withdrawals, COALESCE(v_interest,0))
    ON CONFLICT (account_id, period_start, period_end) DO UPDATE
      SET opening_balance = EXCLUDED.opening_balance,
          closing_balance = EXCLUDED.closing_balance,
          deposits_total = EXCLUDED.deposits_total,
          withdrawals_total = EXCLUDED.withdrawals_total,
          interest_credited = EXCLUDED.interest_credited,
          generated_at = now();

    account_id := rec.id;
    interest := COALESCE(v_interest, 0);
    closing_balance := rec.balance + COALESCE(v_interest, 0);
    RETURN NEXT;
  END LOOP;

  INSERT INTO public.audit_log(actor_id, actor_role, action, target, meta)
  VALUES (NULL, 'system', 'savings.interest_accrual', p_end::text,
          jsonb_build_object('period_start', p_start, 'period_end', p_end));
END;
$$;

REVOKE ALL ON FUNCTION public.accrue_monthly_interest(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accrue_monthly_interest(date) TO service_role;

-- ============================================================
-- 6. Sweep runner
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_savings_sweeps()
RETURNS TABLE(sweep_id uuid, outcome text, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_transfer public.transfers;
  v_next timestamptz;
BEGIN
  FOR rec IN
    SELECT * FROM public.savings_sweeps
    WHERE status = 'active' AND next_run_at <= now()
    ORDER BY next_run_at ASC
    LIMIT 200
  LOOP
    BEGIN
      -- verify both accounts still belong to owner
      IF NOT EXISTS (
        SELECT 1 FROM public.savings_accounts f
        JOIN public.savings_accounts t ON t.id = rec.to_account_id
        WHERE f.id = rec.from_account_id
          AND f.user_id = rec.user_id
          AND t.user_id = rec.user_id
          AND f.status = 'active'
          AND t.status = 'active'
      ) THEN
        RAISE EXCEPTION 'account_not_available';
      END IF;

      SELECT * INTO v_transfer FROM public.post_transfer(
        rec.from_account_id, rec.to_account_id, rec.amount, 'sweep',
        COALESCE(rec.note, 'Scheduled sweep'), rec.user_id
      );
      -- auto-clear because owner controls both accounts
      PERFORM public.clear_transfer(v_transfer.id, rec.user_id);

      v_next := public.advance_recurring_next_run(rec.next_run_at, rec.frequency, rec.day_of_week, rec.day_of_month);

      UPDATE public.savings_sweeps
      SET last_run_at = now(),
          last_run_status = 'success',
          last_run_error = NULL,
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
$$;

REVOKE ALL ON FUNCTION public.run_savings_sweeps() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_savings_sweeps() TO service_role;
