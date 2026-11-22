ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS disbursement_account_id uuid REFERENCES public.savings_accounts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_loan_disbursement_account(_loan_id uuid, _account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _loan public.loans%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'admin'::public.app_role)
       OR private.has_role(_uid,'finance_officer'::public.app_role) OR private.has_role(_uid,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.disbursement_status = 'disbursed' THEN RAISE EXCEPTION 'already_disbursed'; END IF;
  IF _account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.savings_accounts a WHERE a.id = _account_id AND a.user_id = _loan.user_id AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'account_not_member_owned';
  END IF;
  UPDATE public.loans SET disbursement_account_id = _account_id WHERE id = _loan.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_loan_disbursement_account(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_loan_disbursement_account(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.disburse_loan(_loan_id uuid, _channel text, _note text, _actor_id uuid)
RETURNS public.loans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _loan public.loans%ROWTYPE;
  _r numeric; _pmt numeric; _installment numeric; _outstanding numeric; _interest numeric; _principal numeric;
  i int; _due_date date; _first_due date; _start date;
  _txn_ref text; _actor_email text; _actor_role text;
  _eff_channel text;
  _acct_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'admin'::public.app_role)
       OR private.has_role(_uid,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.status <> 'approved' THEN RAISE EXCEPTION 'loan_not_approved'; END IF;
  IF _loan.disbursement_status = 'disbursed' THEN RAISE EXCEPTION 'already_disbursed'; END IF;

  _eff_channel := COALESCE(NULLIF(btrim(COALESCE(_channel,'')),''), _loan.disbursement_channel, 'manual');

  IF _eff_channel = 'savings_account' THEN
    _acct_id := _loan.disbursement_account_id;
    IF _acct_id IS NULL THEN
      SELECT a.id INTO _acct_id FROM public.savings_accounts a
       WHERE a.user_id = _loan.user_id AND a.status = 'active'
       ORDER BY a.created_at ASC LIMIT 1;
    END IF;
    IF _acct_id IS NULL THEN RAISE EXCEPTION 'no_active_savings_account'; END IF;
    PERFORM 1 FROM public.savings_accounts a
      WHERE a.id = _acct_id AND a.user_id = _loan.user_id AND a.status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'account_not_member_owned'; END IF;
  END IF;

  _start := COALESCE(_loan.interest_start_at, current_date);
  DELETE FROM public.loan_repayments WHERE loan_id = _loan.id;
  _first_due := (_start + INTERVAL '1 month')::date;

  _r := (_loan.interest_rate::numeric) / 100.0 / 12.0;
  IF _r = 0 THEN _pmt := round(_loan.amount / _loan.term_months, 2);
  ELSE _pmt := round(_loan.amount * _r / (1 - power(1 + _r, -_loan.term_months::int)), 2);
  END IF;
  _installment := _pmt;
  _outstanding := _loan.amount;

  FOR i IN 1.._loan.term_months LOOP
    _due_date := (_first_due + ((i - 1) || ' months')::interval)::date;
    IF _r = 0 THEN _interest := 0; ELSE _interest := round(_outstanding * _r, 2); END IF;
    IF i = _loan.term_months THEN
      _principal := _outstanding; _pmt := round(_principal + _interest, 2);
    ELSE
      _principal := round(_pmt - _interest, 2);
    END IF;
    _outstanding := round(_outstanding - _principal, 2);
    INSERT INTO public.loan_repayments (loan_id, installment_no, due_date, principal_due, interest_due, total_due)
    VALUES (_loan.id, i, _due_date, _principal, _interest, round(_principal + _interest, 2));
  END LOOP;

  _txn_ref := public.gen_txn_ref('DISB');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, loan_id, savings_account_id, note)
  VALUES (_txn_ref, _loan.user_id, 'loan_disbursement', _loan.amount, 'cleared', _eff_channel, _loan.id, _acct_id, _note);

  IF _acct_id IS NOT NULL THEN
    UPDATE public.savings_accounts SET balance = balance + _loan.amount, updated_at = now() WHERE id = _acct_id;
  END IF;

  UPDATE public.loans
     SET status = 'active', disbursed_at = now(), disbursed_by = _uid,
         disbursement_status = 'disbursed', disbursement_channel = _eff_channel,
         disbursement_account_id = _acct_id,
         interest_start_at = _start, outstanding_principal = _loan.amount, monthly_payment = _installment,
         first_payment_at = _first_due,
         maturity_at = (_first_due + ((_loan.term_months - 1) || ' months')::interval)::date
   WHERE id = _loan.id
   RETURNING * INTO _loan;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _uid;
  _actor_role := CASE WHEN private.has_role(_uid,'super_admin'::public.app_role) THEN 'super_admin' ELSE 'finance_officer' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _actor_email, _actor_role, 'loan.disbursed', _loan.id::text,
          jsonb_build_object('ref', _loan.ref, 'amount', _loan.amount, 'channel', _eff_channel,
                             'savings_account_id', _acct_id,
                             'reference', _loan.disbursement_reference, 'interest_start', _start,
                             'first_due', _first_due, 'txn_ref', _txn_ref));
  RETURN _loan;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.loan_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repayment_id uuid NOT NULL REFERENCES public.loan_repayments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stage text NOT NULL,
  email_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repayment_id, stage)
);
GRANT SELECT ON public.loan_reminder_log TO authenticated;
GRANT ALL ON public.loan_reminder_log TO service_role;
ALTER TABLE public.loan_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own reminders" ON public.loan_reminder_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  method text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_user_idx ON public.login_events (user_id, created_at DESC);
GRANT SELECT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own login events" ON public.login_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_login_event(_method text, _user_agent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.login_events e WHERE e.user_id = _uid
             AND e.user_agent IS NOT DISTINCT FROM left(_user_agent, 300)
             AND e.created_at > now() - interval '10 minutes') THEN
    RETURN;
  END IF;
  INSERT INTO public.login_events (user_id, method, user_agent)
  VALUES (_uid, left(NULLIF(btrim(COALESCE(_method,'')),''), 40), left(_user_agent, 300));
END;
$function$;
REVOKE ALL ON FUNCTION public.record_login_event(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_login_event(text,text) TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='loan_repayments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_repayments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
END $$;

DROP POLICY IF EXISTS "authenticated read permission matrix" ON public.role_permissions;
CREATE POLICY "read own role permissions or admin" ON public.role_permissions FOR SELECT TO authenticated
  USING (
    private.is_admin(auth.uid())
    OR private.has_permission(auth.uid(), 'users', 'view')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = role_permissions.role::text)
  );