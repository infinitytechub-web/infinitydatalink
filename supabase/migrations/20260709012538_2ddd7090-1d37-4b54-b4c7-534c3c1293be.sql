
-- 1. Extend loans table
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS disbursed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disbursed_by uuid,
  ADD COLUMN IF NOT EXISTS outstanding_principal numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_payment numeric(14,2),
  ADD COLUMN IF NOT EXISTS first_payment_at date,
  ADD COLUMN IF NOT EXISTS maturity_at date;

-- 2. loan_repayments table
CREATE TABLE IF NOT EXISTS public.loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_no int NOT NULL,
  due_date date NOT NULL,
  principal_due numeric(14,2) NOT NULL,
  interest_due numeric(14,2) NOT NULL,
  total_due numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'due',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_no)
);

GRANT SELECT ON public.loan_repayments TO authenticated;
GRANT ALL ON public.loan_repayments TO service_role;

ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own loan schedule"
  ON public.loan_repayments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_repayments.loan_id AND l.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff read all loan schedules"
  ON public.loan_repayments FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
  );

CREATE TRIGGER trg_loan_repayments_updated_at
  BEFORE UPDATE ON public.loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan_due
  ON public.loan_repayments (loan_id, installment_no);

-- 3. disburse_loan RPC
CREATE OR REPLACE FUNCTION public.disburse_loan(_loan_id uuid, _channel text, _note text)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $$
DECLARE
  _uid uuid := auth.uid();
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

  -- Amortization (monthly). interest_rate is stored as annual percent (e.g. 18.00).
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
      _principal := _outstanding;                          -- absorb rounding
      _pmt := round(_principal + _interest, 2);
    ELSE
      _principal := round(_pmt - _interest, 2);
    END IF;
    _outstanding := round(_outstanding - _principal, 2);

    INSERT INTO public.loan_repayments (loan_id, installment_no, due_date, principal_due, interest_due, total_due)
    VALUES (_loan.id, i, _due_date, _principal, _interest, round(_principal + _interest, 2));
  END LOOP;

  -- Cleared disbursement transaction
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
$$;

REVOKE ALL ON FUNCTION public.disburse_loan(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.disburse_loan(uuid, text, text) TO authenticated;

-- 4. record_loan_repayment RPC
CREATE OR REPLACE FUNCTION public.record_loan_repayment(_loan_id uuid, _amount numeric, _channel text, _note text)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $$
DECLARE
  _uid uuid := auth.uid();
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
    -- allow slight overpay for final interest but block obvious mistakes >1% over
    IF _amount > _loan.outstanding_principal * 1.10 THEN
      RAISE EXCEPTION 'overpayment';
    END IF;
  END IF;

  -- Apply to earliest unpaid installments (interest first within an installment).
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

    -- Principal fraction of the applied amount = apply * principal_due / total_due
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
$$;

REVOKE ALL ON FUNCTION public.record_loan_repayment(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_loan_repayment(uuid, numeric, text, text) TO authenticated;
