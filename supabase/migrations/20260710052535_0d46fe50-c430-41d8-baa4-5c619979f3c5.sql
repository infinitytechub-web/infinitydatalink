
-- Drop old signatures
DROP FUNCTION IF EXISTS public.post_savings_contribution(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.post_savings_withdrawal(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.finalize_transaction(uuid, txn_status, text);
DROP FUNCTION IF EXISTS public.disburse_loan(uuid, text, text);
DROP FUNCTION IF EXISTS public.record_loan_repayment(uuid, numeric, text, text);

-- Recreate: post_savings_contribution
CREATE OR REPLACE FUNCTION public.post_savings_contribution(_account_id uuid, _amount numeric, _channel text, _note text, _actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid UUID := COALESCE(auth.uid(), _actor_id);
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
$function$;

REVOKE ALL ON FUNCTION public.post_savings_contribution(uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_savings_contribution(uuid, numeric, text, text, uuid) TO service_role;

-- Recreate: post_savings_withdrawal
CREATE OR REPLACE FUNCTION public.post_savings_withdrawal(_account_id uuid, _amount numeric, _channel text, _note text, _actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid UUID := COALESCE(auth.uid(), _actor_id);
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
$function$;

REVOKE ALL ON FUNCTION public.post_savings_withdrawal(uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_savings_withdrawal(uuid, numeric, text, text, uuid) TO service_role;

-- Recreate: finalize_transaction
CREATE OR REPLACE FUNCTION public.finalize_transaction(_txn_id uuid, _status txn_status, _note text, _actor_id uuid)
 RETURNS transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _uid UUID := COALESCE(auth.uid(), _actor_id);
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
$function$;

REVOKE ALL ON FUNCTION public.finalize_transaction(uuid, txn_status, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_transaction(uuid, txn_status, text, uuid) TO service_role;

-- Recreate: disburse_loan
CREATE OR REPLACE FUNCTION public.disburse_loan(_loan_id uuid, _channel text, _note text, _actor_id uuid)
 RETURNS loans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _loan public.loans%ROWTYPE;
  _r numeric;
  _pmt numeric;
  _outstanding numeric;
  _interest numeric;
  _principal numeric;
  i int;
  _due_date date;
  _first_due date;
  _txn_ref text;
  _actor_email text;
  _actor_role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.status <> 'approved' THEN RAISE EXCEPTION 'loan_not_approved'; END IF;

  _first_due := (current_date + INTERVAL '1 month')::date;

  _r := (_loan.interest_rate::numeric) / 100.0 / 12.0;
  IF _r = 0 THEN
    _pmt := round(_loan.amount / _loan.term_months, 2);
  ELSE
    _pmt := round(_loan.amount * _r / (1 - power(1 + _r, -_loan.term_months::int)), 2);
  END IF;

  _outstanding := _loan.amount;

  FOR i IN 1.._loan.term_months LOOP
    _due_date := (_first_due + ((i - 1) || ' months')::interval)::date;
    IF _r = 0 THEN
      _interest := 0;
    ELSE
      _interest := round(_outstanding * _r, 2);
    END IF;
    IF i = _loan.term_months THEN
      _principal := _outstanding;
      _pmt := round(_principal + _interest, 2);
    ELSE
      _principal := round(_pmt - _interest, 2);
    END IF;
    _outstanding := round(_outstanding - _principal, 2);

    INSERT INTO public.loan_repayments (loan_id, installment_no, due_date, principal_due, interest_due, total_due)
    VALUES (_loan.id, i, _due_date, _principal, _interest, round(_principal + _interest, 2));
  END LOOP;

  _txn_ref := public.gen_txn_ref('DISB');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, loan_id, note)
  VALUES (_txn_ref, _loan.user_id, 'loan_disbursement', _loan.amount, 'cleared', _channel, _loan.id, _note);

  UPDATE public.loans
     SET status = 'active',
         disbursed_at = now(),
         disbursed_by = _uid,
         outstanding_principal = _loan.amount,
         monthly_payment = round(_loan.amount / _loan.term_months + COALESCE(_loan.amount * _r, 0), 2),
         first_payment_at = _first_due,
         maturity_at = (_first_due + ((_loan.term_months - 1) || ' months')::interval)::date
   WHERE id = _loan.id
   RETURNING * INTO _loan;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _uid;
  _actor_role := CASE WHEN private.has_role(_uid,'super_admin'::public.app_role) THEN 'super_admin' ELSE 'finance_officer' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _actor_email, _actor_role, 'loan.disbursed', _loan.id::text,
          jsonb_build_object('ref', _loan.ref, 'amount', _loan.amount, 'channel', _channel, 'txn_ref', _txn_ref));

  RETURN _loan;
END;
$function$;

REVOKE ALL ON FUNCTION public.disburse_loan(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disburse_loan(uuid, text, text, uuid) TO service_role;

-- Recreate: record_loan_repayment
CREATE OR REPLACE FUNCTION public.record_loan_repayment(_loan_id uuid, _amount numeric, _channel text, _note text, _actor_id uuid)
 RETURNS loans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _loan public.loans%ROWTYPE;
  _remaining numeric := _amount;
  _inst public.loan_repayments%ROWTYPE;
  _apply numeric;
  _principal_paid numeric := 0;
  _txn_ref text;
  _actor_email text;
  _actor_role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.status <> 'active' THEN RAISE EXCEPTION 'loan_not_active'; END IF;
  IF _amount > _loan.outstanding_principal + 0.01 THEN
    IF _amount > _loan.outstanding_principal * 1.10 THEN
      RAISE EXCEPTION 'overpayment';
    END IF;
  END IF;

  FOR _inst IN
    SELECT * FROM public.loan_repayments
     WHERE loan_id = _loan.id AND status <> 'paid'
     ORDER BY installment_no
     FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _apply := LEAST(_remaining, _inst.total_due - _inst.paid_amount);
    UPDATE public.loan_repayments
       SET paid_amount = paid_amount + _apply,
           paid_at = CASE WHEN paid_amount + _apply >= total_due THEN now() ELSE paid_at END,
           status = CASE
             WHEN paid_amount + _apply >= total_due THEN 'paid'
             WHEN paid_amount + _apply > 0 THEN 'partial'
             ELSE status
           END
     WHERE id = _inst.id;

    _principal_paid := _principal_paid + round(_apply * _inst.principal_due / NULLIF(_inst.total_due,0), 2);
    _remaining := _remaining - _apply;
  END LOOP;

  _txn_ref := public.gen_txn_ref('REPAY');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, loan_id, note)
  VALUES (_txn_ref, _loan.user_id, 'loan_repayment', _amount, 'cleared', _channel, _loan.id, _note);

  UPDATE public.loans
     SET outstanding_principal = GREATEST(outstanding_principal - _principal_paid, 0),
         status = CASE
           WHEN NOT EXISTS (SELECT 1 FROM public.loan_repayments WHERE loan_id = _loan.id AND status <> 'paid')
             THEN 'closed'::public.loan_status
           ELSE status
         END
   WHERE id = _loan.id
   RETURNING * INTO _loan;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _uid;
  _actor_role := CASE WHEN private.has_role(_uid,'super_admin'::public.app_role) THEN 'super_admin' ELSE 'finance_officer' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _actor_email, _actor_role, 'loan.repayment', _loan.id::text,
          jsonb_build_object('ref', _loan.ref, 'amount', _amount, 'txn_ref', _txn_ref,
                             'outstanding', _loan.outstanding_principal, 'closed', _loan.status = 'closed'));

  RETURN _loan;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_loan_repayment(uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_loan_repayment(uuid, numeric, text, text, uuid) TO service_role;
