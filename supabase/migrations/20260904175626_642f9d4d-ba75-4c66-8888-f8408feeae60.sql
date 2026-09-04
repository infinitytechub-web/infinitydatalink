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
  _installment numeric;
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

  DELETE FROM public.loan_repayments WHERE loan_id = _loan.id;

  _first_due := (current_date + INTERVAL '1 month')::date;

  _r := (_loan.interest_rate::numeric) / 100.0 / 12.0;
  IF _r = 0 THEN
    _pmt := round(_loan.amount / _loan.term_months, 2);
  ELSE
    _pmt := round(_loan.amount * _r / (1 - power(1 + _r, -_loan.term_months::int)), 2);
  END IF;
  _installment := _pmt;

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
         monthly_payment = _installment,
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

CREATE OR REPLACE FUNCTION public.set_approved_loan_terms(_loan_id uuid)
 RETURNS loans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _loan public.loans%ROWTYPE;
  _r numeric;
  _pmt numeric;
  _first_due date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role)
       OR private.has_role(_uid,'finance_officer'::public.app_role)
       OR private.has_role(_uid,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.status <> 'approved' THEN RETURN _loan; END IF;

  _first_due := (current_date + INTERVAL '1 month')::date;
  _r := (_loan.interest_rate::numeric) / 100.0 / 12.0;
  IF _r = 0 THEN
    _pmt := round(_loan.amount / _loan.term_months, 2);
  ELSE
    _pmt := round(_loan.amount * _r / (1 - power(1 + _r, -_loan.term_months::int)), 2);
  END IF;

  UPDATE public.loans
     SET monthly_payment = _pmt,
         first_payment_at = _first_due,
         maturity_at = (_first_due + ((_loan.term_months - 1) || ' months')::interval)::date
   WHERE id = _loan.id
   RETURNING * INTO _loan;

  RETURN _loan;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_approved_loan_terms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_approved_loan_terms(uuid) TO authenticated, service_role;