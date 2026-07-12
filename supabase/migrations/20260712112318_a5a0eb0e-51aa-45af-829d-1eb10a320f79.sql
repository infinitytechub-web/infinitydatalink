
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'transfer_in';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'expense';

DO $$ BEGIN CREATE TYPE public.expense_status AS ENUM ('pending','approved','paid','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.transfer_status AS ENUM ('pending','cleared','failed','reversed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.adjustment_direction AS ENUM ('credit','debit'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_read_authenticated" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_manage_staff" ON public.expense_categories FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role));

INSERT INTO public.expense_categories (code,label) VALUES
  ('payroll','Payroll'),('rent','Rent'),('utilities','Utilities'),
  ('bank_charges','Bank Charges'),('marketing','Marketing'),
  ('it','IT & Software'),('travel','Travel'),('other','Other')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL UNIQUE DEFAULT public.gen_txn_ref('EXP'),
  category_code TEXT NOT NULL REFERENCES public.expense_categories(code),
  vendor TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_on DATE,
  status public.expense_status NOT NULL DEFAULT 'pending',
  payment_channel TEXT,
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  paid_txn_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_incurred_on ON public.expenses(incurred_on);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category_code);
GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_staff_all" ON public.expenses FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role) OR private.has_role(auth.uid(),'auditor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role));
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL UNIQUE DEFAULT public.gen_txn_ref('TRF'),
  from_account_id UUID NOT NULL REFERENCES public.savings_accounts(id),
  to_account_id UUID NOT NULL REFERENCES public.savings_accounts(id),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  status public.transfer_status NOT NULL DEFAULT 'pending',
  channel TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  cleared_at TIMESTAMPTZ,
  cleared_by UUID REFERENCES auth.users(id),
  out_txn_id UUID,
  in_txn_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON public.transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON public.transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON public.transfers(to_account_id);
GRANT SELECT, INSERT, UPDATE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_staff_all" ON public.transfers FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role) OR private.has_role(auth.uid(),'auditor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role));
CREATE POLICY "transfers_member_read" ON public.transfers FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = from_account_id AND s.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.savings_accounts s WHERE s.id = to_account_id AND s.user_id = auth.uid())
  );
CREATE TRIGGER trg_transfers_updated BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL UNIQUE DEFAULT public.gen_txn_ref('ADJ'),
  savings_account_id UUID NOT NULL REFERENCES public.savings_accounts(id),
  direction public.adjustment_direction NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  reference_txn_id UUID,
  approved_by UUID REFERENCES auth.users(id),
  txn_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adj_account ON public.balance_adjustments(savings_account_id);
GRANT SELECT, INSERT ON public.balance_adjustments TO authenticated;
GRANT ALL ON public.balance_adjustments TO service_role;
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adj_staff_all" ON public.balance_adjustments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role) OR private.has_role(auth.uid(),'auditor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role));

CREATE OR REPLACE FUNCTION private.assert_finance_staff(_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION private.assert_finance_staff(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.write_audit(_uid uuid, _action text, _target text, _meta jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _email text; _role text;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  _role := CASE
    WHEN private.has_role(_uid,'super_admin'::public.app_role) THEN 'super_admin'
    WHEN private.has_role(_uid,'finance_officer'::public.app_role) THEN 'finance_officer'
    WHEN private.has_role(_uid,'compliance_officer'::public.app_role) THEN 'compliance_officer'
    ELSE 'member' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, _role, _action, _target, COALESCE(_meta,'{}'::jsonb));
END $$;
REVOKE EXECUTE ON FUNCTION private.write_audit(uuid,text,text,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.post_expense(
  _category_code text, _vendor text, _amount numeric, _incurred_on date,
  _payment_channel text, _reference text, _notes text, _actor_id uuid
) RETURNS public.expenses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _row public.expenses%ROWTYPE;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  INSERT INTO public.expenses (category_code, vendor, amount, incurred_on, payment_channel, reference, notes, created_by)
  VALUES (_category_code, _vendor, _amount, COALESCE(_incurred_on, CURRENT_DATE), _payment_channel, _reference, _notes, _uid)
  RETURNING * INTO _row;
  PERFORM private.write_audit(_uid,'expense.created',_row.id::text,
    jsonb_build_object('ref',_row.ref,'amount',_row.amount,'category',_row.category_code,'vendor',_row.vendor));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.post_expense(text,text,numeric,date,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_expense(text,text,numeric,date,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_expense(_expense_id uuid, _actor_id uuid)
RETURNS public.expenses LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _row public.expenses%ROWTYPE;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  UPDATE public.expenses SET status='approved', approved_by=_uid, approved_at=now()
  WHERE id=_expense_id AND status='pending' RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_pending'; END IF;
  PERFORM private.write_audit(_uid,'expense.approved',_row.id::text, jsonb_build_object('ref',_row.ref,'amount',_row.amount));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.approve_expense(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_expense(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_expense(_expense_id uuid, _reason text, _actor_id uuid)
RETURNS public.expenses LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _row public.expenses%ROWTYPE;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  UPDATE public.expenses SET status='rejected', approved_by=_uid, approved_at=now(),
    notes = COALESCE(notes,'') || CASE WHEN _reason IS NOT NULL THEN E'\nRejected: '||_reason ELSE '' END
  WHERE id=_expense_id AND status='pending' RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_pending'; END IF;
  PERFORM private.write_audit(_uid,'expense.rejected',_row.id::text, jsonb_build_object('ref',_row.ref,'reason',_reason));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.reject_expense(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_expense(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_expense(_expense_id uuid, _channel text, _reference text, _actor_id uuid)
RETURNS public.expenses LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _row public.expenses%ROWTYPE; _txn_id uuid; _ref text;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  SELECT * INTO _row FROM public.expenses WHERE id=_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF _row.status <> 'approved' THEN RAISE EXCEPTION 'expense_not_approved'; END IF;
  _ref := public.gen_txn_ref('EXP');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, note)
  VALUES (_ref, _uid, 'expense', _row.amount, 'cleared', COALESCE(_channel,_row.payment_channel),
          'Expense '||_row.ref||' — '||_row.vendor) RETURNING id INTO _txn_id;
  UPDATE public.expenses SET status='paid', paid_on=CURRENT_DATE, paid_txn_id=_txn_id,
    payment_channel=COALESCE(_channel,payment_channel), reference=COALESCE(_reference,reference)
  WHERE id=_expense_id RETURNING * INTO _row;
  PERFORM private.write_audit(_uid,'expense.paid',_row.id::text,
    jsonb_build_object('ref',_row.ref,'amount',_row.amount,'txn_ref',_ref));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.pay_expense(uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_expense(uuid,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_transfer(
  _from uuid, _to uuid, _amount numeric, _channel text, _note text, _actor_id uuid
) RETURNS public.transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _row public.transfers%ROWTYPE;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  IF _from = _to THEN RAISE EXCEPTION 'same_account'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  INSERT INTO public.transfers (from_account_id, to_account_id, amount, channel, note, created_by)
  VALUES (_from, _to, _amount, _channel, _note, _uid) RETURNING * INTO _row;
  PERFORM private.write_audit(_uid,'transfer.created',_row.id::text,
    jsonb_build_object('ref',_row.ref,'from',_from,'to',_to,'amount',_amount));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.post_transfer(uuid,uuid,numeric,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_transfer(uuid,uuid,numeric,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_transfer(_transfer_id uuid, _actor_id uuid)
RETURNS public.transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.transfers%ROWTYPE;
  _from_acct public.savings_accounts%ROWTYPE;
  _to_acct public.savings_accounts%ROWTYPE;
  _out_id uuid; _in_id uuid; _out_ref text; _in_ref text;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  SELECT * INTO _row FROM public.transfers WHERE id=_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'transfer_not_pending'; END IF;
  SELECT * INTO _from_acct FROM public.savings_accounts WHERE id=_row.from_account_id FOR UPDATE;
  SELECT * INTO _to_acct FROM public.savings_accounts WHERE id=_row.to_account_id FOR UPDATE;
  IF _from_acct.status <> 'active' OR _to_acct.status <> 'active' THEN RAISE EXCEPTION 'account_inactive'; END IF;
  IF _from_acct.balance < _row.amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE public.savings_accounts SET balance = balance - _row.amount, updated_at=now() WHERE id=_from_acct.id;
  UPDATE public.savings_accounts SET balance = balance + _row.amount, updated_at=now() WHERE id=_to_acct.id;

  _out_ref := public.gen_txn_ref('TRO');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (_out_ref, _from_acct.user_id, 'transfer_out', _row.amount, 'cleared', _row.channel, _from_acct.id,
          'Transfer '||_row.ref||' → '||_to_acct.id) RETURNING id INTO _out_id;
  _in_ref := public.gen_txn_ref('TRI');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (_in_ref, _to_acct.user_id, 'transfer_in', _row.amount, 'cleared', _row.channel, _to_acct.id,
          'Transfer '||_row.ref||' ← '||_from_acct.id) RETURNING id INTO _in_id;

  UPDATE public.transfers SET status='cleared', cleared_at=now(), cleared_by=_uid,
    out_txn_id=_out_id, in_txn_id=_in_id WHERE id=_transfer_id RETURNING * INTO _row;
  PERFORM private.write_audit(_uid,'transfer.cleared',_row.id::text,
    jsonb_build_object('ref',_row.ref,'amount',_row.amount,'out_txn',_out_ref,'in_txn',_in_ref));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.clear_transfer(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_transfer(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_balance_adjustment(
  _account_id uuid, _direction public.adjustment_direction, _amount numeric, _reason text, _actor_id uuid
) RETURNS public.balance_adjustments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.balance_adjustments%ROWTYPE;
  _acct public.savings_accounts%ROWTYPE;
  _txn_id uuid; _ref text;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO _acct FROM public.savings_accounts WHERE id=_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF _direction='debit' AND _acct.balance < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  IF _direction='credit' THEN
    UPDATE public.savings_accounts SET balance = balance + _amount, updated_at=now() WHERE id=_acct.id;
  ELSE
    UPDATE public.savings_accounts SET balance = balance - _amount, updated_at=now() WHERE id=_acct.id;
  END IF;
  _ref := public.gen_txn_ref('ADJ');
  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (_ref, _acct.user_id, 'adjustment', _amount, 'cleared', 'internal', _acct.id,
          upper(_direction::text)||': '||_reason) RETURNING id INTO _txn_id;
  INSERT INTO public.balance_adjustments (savings_account_id, direction, amount, reason, approved_by, txn_id)
  VALUES (_account_id, _direction, _amount, _reason, _uid, _txn_id) RETURNING * INTO _row;
  PERFORM private.write_audit(_uid,'balance.adjusted',_acct.id::text,
    jsonb_build_object('direction',_direction,'amount',_amount,'reason',_reason,'txn_ref',_ref));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.post_balance_adjustment(uuid,public.adjustment_direction,numeric,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_balance_adjustment(uuid,public.adjustment_direction,numeric,text,uuid) TO authenticated;
