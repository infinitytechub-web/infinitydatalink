
ALTER TABLE public.savings_plans
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS min_contribution NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contribution_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lock_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

ALTER TABLE public.savings_accounts
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS goal_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS goal_target_date DATE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DROP TRIGGER IF EXISTS trg_savings_accounts_updated_at ON public.savings_accounts;
CREATE TRIGGER trg_savings_accounts_updated_at
  BEFORE UPDATE ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.savings_plans (name, schedule, interest_rate, description, min_contribution, contribution_amount, lock_days, is_active, sort_order)
VALUES
  ('Cooperative Shares', 'Monthly',   6.00, 'Long-term share capital in the cooperative with monthly contributions.', 100, 200, 365, true, 1),
  ('Susu Daily',         'Daily',     3.00, 'Daily micro-savings with weekly interest posting.',                        10,  20,  30, true, 2),
  ('Real Estate Fund',   'Weekly',    9.50, 'Targeted weekly savings towards real-estate co-investment.',              200, 500, 540, true, 3),
  ('Education Fund',     'Quarterly', 7.25, 'Quarterly deposits for education goals with a lock-in period.',           500,1000, 730, true, 4)
ON CONFLICT (name) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      interest_rate = EXCLUDED.interest_rate,
      description = EXCLUDED.description,
      min_contribution = EXCLUDED.min_contribution,
      contribution_amount = EXCLUDED.contribution_amount,
      lock_days = EXCLUDED.lock_days,
      is_active = EXCLUDED.is_active,
      sort_order = EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION public.gen_txn_ref(_prefix TEXT)
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  SELECT _prefix || '-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
$$;
REVOKE ALL ON FUNCTION public.gen_txn_ref(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gen_txn_ref(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.post_savings_contribution(
  _account_id UUID,
  _amount NUMERIC,
  _channel TEXT,
  _note TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _uid UUID := auth.uid();
  _acct public.savings_accounts%ROWTYPE;
  _kyc public.kyc_status;
  _plan public.savings_plans%ROWTYPE;
  _txn_id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO _acct FROM public.savings_accounts WHERE id = _account_id;
  IF NOT FOUND OR _acct.user_id <> _uid THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF _acct.status <> 'active' THEN RAISE EXCEPTION 'account_closed'; END IF;

  SELECT kyc INTO _kyc FROM public.profiles WHERE id = _uid;
  IF _kyc <> 'active' THEN RAISE EXCEPTION 'kyc_not_approved'; END IF;

  SELECT * INTO _plan FROM public.savings_plans WHERE id = _acct.plan_id;
  IF _plan.min_contribution IS NOT NULL AND _amount < _plan.min_contribution THEN
    RAISE EXCEPTION 'amount_below_minimum';
  END IF;

  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (public.gen_txn_ref('DEP'), _uid, 'deposit', _amount, 'pending', _channel, _account_id, _note)
  RETURNING id INTO _txn_id;

  UPDATE public.savings_accounts SET updated_at = now() WHERE id = _account_id;
  RETURN _txn_id;
END;
$$;
REVOKE ALL ON FUNCTION public.post_savings_contribution(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_savings_contribution(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_savings_withdrawal(
  _account_id UUID,
  _amount NUMERIC,
  _channel TEXT,
  _note TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _uid UUID := auth.uid();
  _acct public.savings_accounts%ROWTYPE;
  _kyc public.kyc_status;
  _txn_id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO _acct FROM public.savings_accounts WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND OR _acct.user_id <> _uid THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF _acct.status <> 'active' THEN RAISE EXCEPTION 'account_closed'; END IF;

  SELECT kyc INTO _kyc FROM public.profiles WHERE id = _uid;
  IF _kyc <> 'active' THEN RAISE EXCEPTION 'kyc_not_approved'; END IF;

  IF _acct.balance < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (public.gen_txn_ref('WDR'), _uid, 'withdrawal', _amount, 'pending', _channel, _account_id, _note)
  RETURNING id INTO _txn_id;

  UPDATE public.savings_accounts SET updated_at = now() WHERE id = _account_id;
  RETURN _txn_id;
END;
$$;
REVOKE ALL ON FUNCTION public.post_savings_withdrawal(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_savings_withdrawal(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_transaction(
  _txn_id UUID,
  _status public.txn_status,
  _note TEXT
) RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE
  _uid UUID := auth.uid();
  _txn public.transactions%ROWTYPE;
  _acct public.savings_accounts%ROWTYPE;
  _actor_email TEXT;
  _actor_role TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid, 'super_admin'::public.app_role) OR private.has_role(_uid, 'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('cleared','failed') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT * INTO _txn FROM public.transactions WHERE id = _txn_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'txn_not_found'; END IF;
  IF _txn.status <> 'pending' THEN RAISE EXCEPTION 'txn_not_pending'; END IF;

  IF _txn.savings_account_id IS NOT NULL THEN
    SELECT * INTO _acct FROM public.savings_accounts WHERE id = _txn.savings_account_id FOR UPDATE;
  END IF;

  IF _status = 'cleared' AND _acct.id IS NOT NULL THEN
    IF _txn.kind = 'deposit' THEN
      UPDATE public.savings_accounts SET balance = balance + _txn.amount, updated_at = now() WHERE id = _acct.id;
    ELSIF _txn.kind = 'withdrawal' THEN
      IF _acct.balance < _txn.amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
      UPDATE public.savings_accounts SET balance = balance - _txn.amount, updated_at = now() WHERE id = _acct.id;
    END IF;
  END IF;

  UPDATE public.transactions
    SET status = _status,
        note  = COALESCE(NULLIF(_note,''), note)
    WHERE id = _txn_id
    RETURNING * INTO _txn;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _uid;
  _actor_role := CASE WHEN private.has_role(_uid,'super_admin'::public.app_role) THEN 'super_admin' ELSE 'finance_officer' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (
    _uid, _actor_email, _actor_role, 'savings.settle', _txn_id::text,
    jsonb_build_object('status', _status, 'kind', _txn.kind, 'amount', _txn.amount, 'note', _note)
  );

  RETURN _txn;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_transaction(UUID, public.txn_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_transaction(UUID, public.txn_status, TEXT) TO authenticated;

DROP POLICY IF EXISTS "own transactions readable" ON public.transactions;
CREATE POLICY "own transactions readable" ON public.transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins read all transactions" ON public.transactions;
CREATE POLICY "admins read all transactions" ON public.transactions
  FOR SELECT TO authenticated USING (private.can_read_all(auth.uid()));
