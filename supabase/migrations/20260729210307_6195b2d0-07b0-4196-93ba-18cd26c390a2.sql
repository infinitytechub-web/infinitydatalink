
-- ============ enum ============
DO $$ BEGIN
  CREATE TYPE public.withdrawal_request_status AS ENUM ('pending','approved','rejected','cancelled','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ settings ============
CREATE TABLE IF NOT EXISTS public.savings_withdrawal_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_amount numeric(14,2) NOT NULL DEFAULT 10,
  max_amount numeric(14,2) NOT NULL DEFAULT 50000,
  daily_limit numeric(14,2) NOT NULL DEFAULT 100000,
  require_dual_control boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.savings_withdrawal_settings TO authenticated;
GRANT ALL ON public.savings_withdrawal_settings TO service_role;
ALTER TABLE public.savings_withdrawal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wsettings_read ON public.savings_withdrawal_settings;
CREATE POLICY wsettings_read ON public.savings_withdrawal_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wsettings_staff_update ON public.savings_withdrawal_settings;
CREATE POLICY wsettings_staff_update ON public.savings_withdrawal_settings
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'finance_officer'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'finance_officer'));

INSERT INTO public.savings_withdrawal_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============ requests ============
CREATE TABLE IF NOT EXISTS public.savings_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  channel text NOT NULL DEFAULT 'bank_transfer',
  reason text NOT NULL,
  status public.withdrawal_request_status NOT NULL DEFAULT 'pending',
  balance_at_request numeric(14,2) NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  approval_note text,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  paid_by uuid,
  paid_at timestamptz,
  txn_id uuid,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wreq_status ON public.savings_withdrawal_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wreq_user ON public.savings_withdrawal_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wreq_account ON public.savings_withdrawal_requests (account_id, status);

GRANT SELECT ON public.savings_withdrawal_requests TO authenticated;
GRANT ALL ON public.savings_withdrawal_requests TO service_role;
ALTER TABLE public.savings_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wreq_owner_read ON public.savings_withdrawal_requests;
CREATE POLICY wreq_owner_read ON public.savings_withdrawal_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS wreq_staff_read ON public.savings_withdrawal_requests;
CREATE POLICY wreq_staff_read ON public.savings_withdrawal_requests
  FOR SELECT TO authenticated USING (
    private.has_role(auth.uid(),'super_admin')
    OR private.has_role(auth.uid(),'finance_officer')
    OR private.has_role(auth.uid(),'auditor')
  );

DROP TRIGGER IF EXISTS trg_wreq_updated ON public.savings_withdrawal_requests;
CREATE TRIGGER trg_wreq_updated BEFORE UPDATE ON public.savings_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ helper: held funds ============
CREATE OR REPLACE FUNCTION public.savings_held_amount(_account_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.savings_withdrawal_requests
  WHERE account_id = _account_id AND status IN ('pending','approved');
$$;
REVOKE ALL ON FUNCTION public.savings_held_amount(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.savings_held_amount(uuid) TO authenticated, service_role;

-- ============ member: request ============
CREATE OR REPLACE FUNCTION public.request_savings_withdrawal(
  _account_id uuid, _amount numeric, _channel text, _reason text
) RETURNS public.savings_withdrawal_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_acc public.savings_accounts;
  v_set public.savings_withdrawal_settings;
  v_held numeric;
  v_today numeric;
  v_row public.savings_withdrawal_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v_acc FROM public.savings_accounts WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF v_acc.user_id <> v_uid THEN RAISE EXCEPTION 'account_not_owned'; END IF;
  IF v_acc.status <> 'active' THEN RAISE EXCEPTION 'account_not_active'; END IF;

  SELECT * INTO v_set FROM public.savings_withdrawal_settings WHERE id = 1;
  IF _amount < v_set.min_amount THEN RAISE EXCEPTION 'below_min_amount'; END IF;
  IF _amount > v_set.max_amount THEN RAISE EXCEPTION 'above_max_amount'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_today
  FROM public.savings_withdrawal_requests
  WHERE user_id = v_uid AND status <> 'rejected' AND status <> 'cancelled'
    AND created_at >= date_trunc('day', now());
  IF v_today + _amount > v_set.daily_limit THEN RAISE EXCEPTION 'daily_limit_exceeded'; END IF;

  v_held := public.savings_held_amount(_account_id);
  IF _amount > (v_acc.balance - v_held) THEN RAISE EXCEPTION 'insufficient_available_balance'; END IF;

  INSERT INTO public.savings_withdrawal_requests
    (ref, user_id, account_id, amount, channel, reason, balance_at_request)
  VALUES (public.gen_txn_ref('WDR'), v_uid, _account_id, _amount,
          COALESCE(NULLIF(btrim(_channel),''),'bank_transfer'), btrim(_reason), v_acc.balance)
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.request_savings_withdrawal(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_savings_withdrawal(uuid, numeric, text, text) TO authenticated, service_role;

-- ============ member: cancel ============
CREATE OR REPLACE FUNCTION public.cancel_savings_withdrawal(_id uuid)
RETURNS public.savings_withdrawal_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.savings_withdrawal_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.savings_withdrawal_requests
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = _id AND user_id = v_uid AND status = 'pending'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_cancellable'; END IF;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.cancel_savings_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_savings_withdrawal(uuid) TO authenticated, service_role;

-- ============ staff: approve / reject / pay ============
CREATE OR REPLACE FUNCTION public.approve_savings_withdrawal(_id uuid, _note text, _actor_id uuid)
RETURNS public.savings_withdrawal_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.savings_withdrawal_requests;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'actor_required'; END IF;
  IF NOT (private.has_role(_actor_id,'super_admin') OR private.has_role(_actor_id,'finance_officer')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _note IS NULL OR length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'note_required'; END IF;

  UPDATE public.savings_withdrawal_requests
     SET status = 'approved', approved_by = _actor_id, approved_at = now(), approval_note = btrim(_note)
   WHERE id = _id AND status = 'pending'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.approve_savings_withdrawal(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_savings_withdrawal(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reject_savings_withdrawal(_id uuid, _reason text, _actor_id uuid)
RETURNS public.savings_withdrawal_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.savings_withdrawal_requests;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'actor_required'; END IF;
  IF NOT (private.has_role(_actor_id,'super_admin') OR private.has_role(_actor_id,'finance_officer')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE public.savings_withdrawal_requests
     SET status = 'rejected', rejected_by = _actor_id, rejected_at = now(), rejection_reason = btrim(_reason)
   WHERE id = _id AND status IN ('pending','approved')
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_open'; END IF;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.reject_savings_withdrawal(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_savings_withdrawal(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pay_savings_withdrawal(_id uuid, _actor_id uuid)
RETURNS public.savings_withdrawal_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.savings_withdrawal_requests;
  v_set public.savings_withdrawal_settings;
  v_txn uuid;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'actor_required'; END IF;
  IF NOT (private.has_role(_actor_id,'super_admin') OR private.has_role(_actor_id,'finance_officer')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_row FROM public.savings_withdrawal_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_row.status <> 'approved' THEN RAISE EXCEPTION 'request_not_approved'; END IF;

  SELECT * INTO v_set FROM public.savings_withdrawal_settings WHERE id = 1;
  IF v_set.require_dual_control AND v_row.approved_by = _actor_id THEN
    RAISE EXCEPTION 'dual_control_required';
  END IF;

  v_txn := public.post_savings_withdrawal(
    v_row.account_id, v_row.amount, v_row.channel,
    'Withdrawal request ' || v_row.ref, _actor_id
  );

  UPDATE public.savings_withdrawal_requests
     SET status = 'paid', paid_by = _actor_id, paid_at = now(), txn_id = v_txn
   WHERE id = _id
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.pay_savings_withdrawal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_savings_withdrawal(uuid, uuid) TO service_role;
