-- 1) Disbursement tracking columns
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS disbursement_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS disbursement_channel text,
  ADD COLUMN IF NOT EXISTS disbursement_reference text,
  ADD COLUMN IF NOT EXISTS interest_start_at date,
  ADD COLUMN IF NOT EXISTS disbursement_requested_by uuid,
  ADD COLUMN IF NOT EXISTS disbursement_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS disbursement_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loans_disbursement_status_chk'
  ) THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_disbursement_status_chk
      CHECK (disbursement_status IN ('not_requested','awaiting_confirmation','disbursed','cancelled'));
  END IF;
END $$;

UPDATE public.loans
   SET disbursement_status = 'disbursed',
       interest_start_at = COALESCE(interest_start_at, disbursed_at::date)
 WHERE disbursed_at IS NOT NULL AND disbursement_status <> 'disbursed';

-- 2) Stage a disbursement (officer step of the two-person release)
CREATE OR REPLACE FUNCTION public.request_loan_disbursement(
  _loan_id uuid,
  _channel text,
  _reference text,
  _value_date date,
  _note text
)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _loan public.loans%ROWTYPE;
  _actor_email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    private.has_role(_uid,'super_admin'::public.app_role)
    OR private.has_role(_uid,'admin'::public.app_role)
    OR private.has_role(_uid,'finance_officer'::public.app_role)
    OR private.has_role(_uid,'loan_officer'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _channel IS NULL OR length(btrim(_channel)) < 2 THEN
    RAISE EXCEPTION 'channel_required';
  END IF;
  IF _value_date IS NULL THEN RAISE EXCEPTION 'value_date_required'; END IF;
  IF _value_date < (current_date - 30) OR _value_date > (current_date + 30) THEN
    RAISE EXCEPTION 'value_date_out_of_range';
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.status <> 'approved' THEN RAISE EXCEPTION 'loan_not_approved'; END IF;
  IF _loan.disbursement_status = 'disbursed' THEN RAISE EXCEPTION 'already_disbursed'; END IF;

  UPDATE public.loans
     SET disbursement_status = 'awaiting_confirmation',
         disbursement_channel = btrim(_channel),
         disbursement_reference = NULLIF(btrim(COALESCE(_reference,'')), ''),
         interest_start_at = _value_date,
         disbursement_requested_by = _uid,
         disbursement_requested_at = now(),
         disbursement_note = NULLIF(btrim(COALESCE(_note,'')), '')
   WHERE id = _loan.id
   RETURNING * INTO _loan;

  SELECT u.email INTO _actor_email FROM auth.users u WHERE u.id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _actor_email, 'loan_officer', 'loan.disbursement_requested', _loan.id::text,
          jsonb_build_object('ref', _loan.ref, 'amount', _loan.amount, 'channel', _loan.disbursement_channel,
                             'reference', _loan.disbursement_reference, 'value_date', _value_date, 'note', _loan.disbursement_note));
  RETURN _loan;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_loan_disbursement(uuid,text,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_loan_disbursement(uuid,text,text,date,text) TO authenticated, service_role;

-- 3) Cancel a staged disbursement
CREATE OR REPLACE FUNCTION public.cancel_loan_disbursement(_loan_id uuid, _reason text)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _loan public.loans%ROWTYPE;
  _actor_email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    private.has_role(_uid,'super_admin'::public.app_role)
    OR private.has_role(_uid,'admin'::public.app_role)
    OR private.has_role(_uid,'finance_officer'::public.app_role)
    OR private.has_role(_uid,'loan_officer'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.disbursement_status <> 'awaiting_confirmation' THEN RAISE EXCEPTION 'not_awaiting_confirmation'; END IF;

  UPDATE public.loans
     SET disbursement_status = 'cancelled',
         disbursement_note = btrim(_reason)
   WHERE id = _loan.id
   RETURNING * INTO _loan;

  SELECT u.email INTO _actor_email FROM auth.users u WHERE u.id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _actor_email, 'loan_officer', 'loan.disbursement_cancelled', _loan.id::text,
          jsonb_build_object('ref', _loan.ref, 'reason', btrim(_reason)));
  RETURN _loan;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_loan_disbursement(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_loan_disbursement(uuid,text) TO authenticated, service_role;

-- 4) Confirm disbursement: aligns interest + schedule to the value date
CREATE OR REPLACE FUNCTION public.disburse_loan(_loan_id uuid, _channel text, _note text, _actor_id uuid)
RETURNS public.loans
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
  _start date;
  _txn_ref text;
  _actor_email text;
  _actor_role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    private.has_role(_uid,'super_admin'::public.app_role)
    OR private.has_role(_uid,'admin'::public.app_role)
    OR private.has_role(_uid,'finance_officer'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.status <> 'approved' THEN RAISE EXCEPTION 'loan_not_approved'; END IF;
  IF _loan.disbursement_status = 'disbursed' THEN RAISE EXCEPTION 'already_disbursed'; END IF;

  -- Interest accrues from the value date staged by the requesting officer,
  -- falling back to today when a disbursement was not staged.
  _start := COALESCE(_loan.interest_start_at, current_date);

  DELETE FROM public.loan_repayments WHERE loan_id = _loan.id;

  _first_due := (_start + INTERVAL '1 month')::date;

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
    IF _r = 0 THEN _interest := 0; ELSE _interest := round(_outstanding * _r, 2); END IF;
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
  VALUES (_txn_ref, _loan.user_id, 'loan_disbursement', _loan.amount, 'cleared',
          COALESCE(NULLIF(btrim(COALESCE(_channel,'')),''), _loan.disbursement_channel, 'manual'),
          _loan.id, _note);

  UPDATE public.loans
     SET status = 'active',
         disbursed_at = now(),
         disbursed_by = _uid,
         disbursement_status = 'disbursed',
         disbursement_channel = COALESCE(NULLIF(btrim(COALESCE(_channel,'')),''), _loan.disbursement_channel),
         interest_start_at = _start,
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
          jsonb_build_object('ref', _loan.ref, 'amount', _loan.amount, 'channel', _loan.disbursement_channel,
                             'reference', _loan.disbursement_reference, 'interest_start', _start,
                             'first_due', _first_due, 'txn_ref', _txn_ref));

  RETURN _loan;
END;
$function$;

-- 5) Member-submitted repayment (pending staff confirmation)
CREATE OR REPLACE FUNCTION public.submit_member_loan_repayment(
  _loan_id uuid,
  _amount numeric,
  _channel text,
  _reference text,
  _note text
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _loan public.loans%ROWTYPE;
  _due numeric;
  _pending numeric;
  _txn public.transactions%ROWTYPE;
  _ref text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _channel IS NULL OR length(btrim(_channel)) < 2 THEN RAISE EXCEPTION 'channel_required'; END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.user_id <> _uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _loan.status <> 'active' THEN RAISE EXCEPTION 'loan_not_active'; END IF;

  SELECT COALESCE(SUM(GREATEST(r.total_due - COALESCE(r.paid_amount,0), 0)), 0)
    INTO _due
    FROM public.loan_repayments r
   WHERE r.loan_id = _loan.id;

  SELECT COALESCE(SUM(t.amount), 0) INTO _pending
    FROM public.transactions t
   WHERE t.loan_id = _loan.id AND t.kind = 'loan_repayment' AND t.status = 'pending';

  IF _amount > (_due - _pending) + 0.01 THEN
    RAISE EXCEPTION 'amount_exceeds_balance';
  END IF;

  _ref := public.gen_txn_ref('REPAY');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, loan_id, note)
  VALUES (_ref, _uid, 'loan_repayment', round(_amount, 2), 'pending', btrim(_channel), _loan.id,
          NULLIF(btrim(concat_ws(' · ', NULLIF(btrim(COALESCE(_reference,'')),''), NULLIF(btrim(COALESCE(_note,'')),''))), ''))
  RETURNING * INTO _txn;

  RETURN _txn;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_member_loan_repayment(uuid,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_member_loan_repayment(uuid,numeric,text,text,text) TO authenticated, service_role;