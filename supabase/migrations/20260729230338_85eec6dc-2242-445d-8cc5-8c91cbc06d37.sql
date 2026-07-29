CREATE TABLE public.savings_interest_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','annually')),
  basis text NOT NULL DEFAULT 'closing_balance' CHECK (basis IN ('closing_balance','average_balance','minimum_balance')),
  rounding_dp smallint NOT NULL DEFAULT 2 CHECK (rounding_dp BETWEEN 0 AND 4),
  min_balance_to_earn numeric NOT NULL DEFAULT 0 CHECK (min_balance_to_earn >= 0),
  exclude_held_funds boolean NOT NULL DEFAULT true,
  rate_source text NOT NULL DEFAULT 'plan' CHECK (rate_source IN ('plan','flat')),
  flat_rate_annual numeric NOT NULL DEFAULT 0 CHECK (flat_rate_annual >= 0 AND flat_rate_annual <= 100),
  min_interest_to_post numeric NOT NULL DEFAULT 0.01 CHECK (min_interest_to_post >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, UPDATE ON public.savings_interest_settings TO authenticated;
GRANT ALL ON public.savings_interest_settings TO service_role;
ALTER TABLE public.savings_interest_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interest_settings_read" ON public.savings_interest_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "interest_settings_staff_update" ON public.savings_interest_settings
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'finance_officer'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'finance_officer'::app_role));

INSERT INTO public.savings_interest_settings (id) VALUES (1);

CREATE TABLE public.savings_interest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  frequency text NOT NULL,
  basis text NOT NULL,
  rate_source text NOT NULL,
  accounts_processed integer NOT NULL DEFAULT 0,
  accounts_credited integer NOT NULL DEFAULT 0,
  total_interest numeric NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  executed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.savings_interest_runs TO authenticated;
GRANT ALL ON public.savings_interest_runs TO service_role;
ALTER TABLE public.savings_interest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interest_runs_staff_read" ON public.savings_interest_runs
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE OR REPLACE FUNCTION public.post_savings_interest(
  _period_end date DEFAULT NULL,
  _dry_run boolean DEFAULT false,
  _actor uuid DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS TABLE(
  run_id uuid,
  period_start date,
  period_end date,
  accounts_processed integer,
  accounts_credited integer,
  total_interest numeric,
  dry_run boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.savings_interest_settings%ROWTYPE;
  p_end date;
  p_start date;
  v_months integer;
  rec RECORD;
  v_rate numeric;
  v_basis_balance numeric;
  v_interest numeric;
  v_opening numeric;
  v_min numeric;
  v_running numeric;
  v_deposits numeric;
  v_withdrawals numeric;
  v_held numeric;
  t RECORD;
  v_processed integer := 0;
  v_credited integer := 0;
  v_total numeric := 0;
  v_run_id uuid;
BEGIN
  SELECT * INTO s FROM public.savings_interest_settings WHERE id = 1;
  IF s IS NULL THEN
    RAISE EXCEPTION 'interest settings missing';
  END IF;
  IF NOT s.enabled AND NOT _dry_run THEN
    RAISE EXCEPTION 'interest accrual is disabled';
  END IF;

  v_months := CASE s.frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END;
  p_end := COALESCE(_period_end, (date_trunc('month', now()) - interval '1 day')::date);
  p_start := (date_trunc('month', p_end::timestamp) - make_interval(months => v_months - 1))::date;

  FOR rec IN
    SELECT sa.id, sa.user_id, sa.balance, sp.interest_rate
    FROM public.savings_accounts sa
    JOIN public.savings_plans sp ON sp.id = sa.plan_id
    WHERE sa.status = 'active'
  LOOP
    v_processed := v_processed + 1;

    SELECT
      COALESCE(SUM(CASE WHEN t2.kind IN ('deposit','transfer_in','interest') AND t2.status = 'cleared' THEN t2.amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN t2.kind IN ('withdrawal','transfer_out','fee') AND t2.status = 'cleared' THEN t2.amount ELSE 0 END), 0)
    INTO v_deposits, v_withdrawals
    FROM public.transactions t2
    WHERE t2.savings_account_id = rec.id
      AND t2.created_at >= p_start
      AND t2.created_at < (p_end + 1);

    v_opening := rec.balance - v_deposits + v_withdrawals;

    IF s.basis = 'closing_balance' THEN
      v_basis_balance := rec.balance;
    ELSIF s.basis = 'average_balance' THEN
      v_basis_balance := (v_opening + rec.balance) / 2.0;
    ELSE
      v_running := v_opening;
      v_min := v_opening;
      FOR t IN
        SELECT t3.kind, t3.amount
        FROM public.transactions t3
        WHERE t3.savings_account_id = rec.id
          AND t3.status = 'cleared'
          AND t3.created_at >= p_start
          AND t3.created_at < (p_end + 1)
        ORDER BY t3.created_at ASC
      LOOP
        IF t.kind IN ('deposit','transfer_in','interest') THEN
          v_running := v_running + t.amount;
        ELSIF t.kind IN ('withdrawal','transfer_out','fee') THEN
          v_running := v_running - t.amount;
        END IF;
        IF v_running < v_min THEN v_min := v_running; END IF;
      END LOOP;
      v_basis_balance := v_min;
    END IF;

    IF s.exclude_held_funds THEN
      SELECT COALESCE(SUM(h.amount), 0) INTO v_held
      FROM public.savings_holds h
      WHERE h.account_id = rec.id AND h.status = 'active';
      v_basis_balance := v_basis_balance - COALESCE(v_held, 0);
    END IF;

    IF v_basis_balance < 0 THEN v_basis_balance := 0; END IF;

    v_rate := CASE WHEN s.rate_source = 'flat' THEN s.flat_rate_annual ELSE COALESCE(rec.interest_rate, 0) END;
    v_interest := ROUND(v_basis_balance * v_rate / 100.0 * (v_months / 12.0), s.rounding_dp);

    IF v_basis_balance < s.min_balance_to_earn OR v_interest < s.min_interest_to_post THEN
      v_interest := 0;
    END IF;

    IF v_interest > 0 THEN
      v_credited := v_credited + 1;
      v_total := v_total + v_interest;

      IF NOT _dry_run THEN
        INSERT INTO public.transactions(ref, user_id, kind, amount, status, channel, savings_account_id, note)
        VALUES (public.gen_txn_ref('INT'), rec.user_id, 'interest'::txn_kind, v_interest, 'cleared'::txn_status, 'accrual', rec.id,
                'Interest ' || to_char(p_start, 'YYYY-MM') || ' to ' || to_char(p_end, 'YYYY-MM'));

        UPDATE public.savings_accounts SET balance = balance + v_interest WHERE id = rec.id;
        v_deposits := v_deposits + v_interest;
      END IF;
    END IF;

    IF NOT _dry_run THEN
      INSERT INTO public.savings_statements(account_id, user_id, period_start, period_end, opening_balance, closing_balance, deposits_total, withdrawals_total, interest_credited)
      VALUES (rec.id, rec.user_id, p_start, p_end, v_opening, rec.balance + COALESCE(v_interest, 0), v_deposits, v_withdrawals, COALESCE(v_interest, 0))
      ON CONFLICT (account_id, period_start, period_end) DO UPDATE
        SET opening_balance = EXCLUDED.opening_balance,
            closing_balance = EXCLUDED.closing_balance,
            deposits_total = EXCLUDED.deposits_total,
            withdrawals_total = EXCLUDED.withdrawals_total,
            interest_credited = EXCLUDED.interest_credited,
            generated_at = now();
    END IF;
  END LOOP;

  INSERT INTO public.savings_interest_runs(period_start, period_end, frequency, basis, rate_source, accounts_processed, accounts_credited, total_interest, dry_run, executed_by, note)
  VALUES (p_start, p_end, s.frequency, s.basis, s.rate_source, v_processed, v_credited, v_total, _dry_run, _actor, _note)
  RETURNING id INTO v_run_id;

  RETURN QUERY SELECT v_run_id, p_start, p_end, v_processed, v_credited, v_total, _dry_run;
END;
$$;

REVOKE ALL ON FUNCTION public.post_savings_interest(date, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_savings_interest(date, boolean, uuid, text) TO service_role;
