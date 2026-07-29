-- ============================================================
-- Savings modules: fixed deposits, collateral holds, group pots
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.fixed_deposit_status AS ENUM ('active','matured','redeemed','broken');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.savings_hold_status AS ENUM ('active','released');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pot_payout_status AS ENUM ('scheduled','paid','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 1. Fixed deposit products ============
CREATE TABLE public.fixed_deposit_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  term_months integer NOT NULL CHECK (term_months BETWEEN 1 AND 120),
  rate_annual numeric NOT NULL CHECK (rate_annual >= 0 AND rate_annual <= 100),
  min_amount numeric NOT NULL DEFAULT 100 CHECK (min_amount >= 0),
  max_amount numeric CHECK (max_amount IS NULL OR max_amount > 0),
  early_break_penalty_pct numeric NOT NULL DEFAULT 2 CHECK (early_break_penalty_pct >= 0 AND early_break_penalty_pct <= 100),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fixed_deposit_products TO authenticated;
GRANT ALL ON public.fixed_deposit_products TO service_role;
ALTER TABLE public.fixed_deposit_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fd_products_read" ON public.fixed_deposit_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "fd_products_staff_write" ON public.fixed_deposit_products
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'finance_officer'::public.app_role));

CREATE TRIGGER trg_fd_products_updated BEFORE UPDATE ON public.fixed_deposit_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 2. Fixed deposits ============
CREATE TABLE public.fixed_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.fixed_deposit_products(id),
  source_account_id uuid NOT NULL REFERENCES public.savings_accounts(id),
  principal numeric NOT NULL CHECK (principal > 0),
  rate_annual numeric NOT NULL CHECK (rate_annual >= 0),
  term_months integer NOT NULL CHECK (term_months > 0),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  maturity_date date NOT NULL,
  interest_expected numeric NOT NULL DEFAULT 0,
  interest_paid numeric NOT NULL DEFAULT 0,
  penalty_amount numeric NOT NULL DEFAULT 0,
  rollover text NOT NULL DEFAULT 'none' CHECK (rollover IN ('none','principal','principal_interest')),
  status public.fixed_deposit_status NOT NULL DEFAULT 'active',
  open_txn_id uuid REFERENCES public.transactions(id),
  close_txn_id uuid REFERENCES public.transactions(id),
  broken_at timestamptz,
  break_reason text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fd_user ON public.fixed_deposits(user_id, status);
CREATE INDEX idx_fd_maturity ON public.fixed_deposits(maturity_date) WHERE status = 'active';

GRANT SELECT ON public.fixed_deposits TO authenticated;
GRANT ALL ON public.fixed_deposits TO service_role;
ALTER TABLE public.fixed_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fd_own_read" ON public.fixed_deposits
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "fd_staff_read" ON public.fixed_deposits
  FOR SELECT TO authenticated USING (
    private.has_role(auth.uid(),'super_admin'::public.app_role)
    OR private.has_role(auth.uid(),'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(),'auditor'::public.app_role)
  );

CREATE TRIGGER trg_fd_updated BEFORE UPDATE ON public.fixed_deposits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. Savings holds (loan collateral) ============
CREATE TABLE public.savings_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  loan_id uuid REFERENCES public.loans(id) ON DELETE SET NULL,
  status public.savings_hold_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_by_role text,
  released_by uuid,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_holds_account ON public.savings_holds(account_id, status);

GRANT SELECT ON public.savings_holds TO authenticated;
GRANT ALL ON public.savings_holds TO service_role;
ALTER TABLE public.savings_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holds_own_read" ON public.savings_holds
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "holds_staff_read" ON public.savings_holds
  FOR SELECT TO authenticated USING (
    private.has_role(auth.uid(),'super_admin'::public.app_role)
    OR private.has_role(auth.uid(),'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(),'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(),'auditor'::public.app_role)
  );

CREATE TRIGGER trg_holds_updated BEFORE UPDATE ON public.savings_holds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Held amount now includes active collateral holds
CREATE OR REPLACE FUNCTION public.savings_held_amount(_account_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(amount) FROM public.savings_withdrawal_requests
              WHERE account_id = _account_id AND status IN ('pending','approved')), 0)
    + COALESCE((SELECT SUM(amount) FROM public.savings_holds
              WHERE account_id = _account_id AND status = 'active'), 0);
$$;
REVOKE ALL ON FUNCTION public.savings_held_amount(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.savings_held_amount(uuid) TO authenticated, service_role;

-- ============ 4. Group / susu pots ============
CREATE TABLE public.group_pots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  contribution_amount numeric NOT NULL CHECK (contribution_amount > 0),
  frequency public.recurring_frequency NOT NULL DEFAULT 'monthly',
  balance numeric NOT NULL DEFAULT 0,
  current_cycle integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','closed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.group_pots TO authenticated;
GRANT ALL ON public.group_pots TO service_role;
ALTER TABLE public.group_pots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_pot_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id uuid NOT NULL REFERENCES public.group_pots(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payout_position integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','exited')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pot_id, profile_id)
);

GRANT SELECT ON public.group_pot_members TO authenticated;
GRANT ALL ON public.group_pot_members TO service_role;
ALTER TABLE public.group_pot_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_pot_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id uuid NOT NULL REFERENCES public.group_pots(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle integer NOT NULL DEFAULT 1,
  amount numeric NOT NULL CHECK (amount > 0),
  savings_account_id uuid REFERENCES public.savings_accounts(id),
  txn_id uuid REFERENCES public.transactions(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pot_contrib ON public.group_pot_contributions(pot_id, cycle);

GRANT SELECT ON public.group_pot_contributions TO authenticated;
GRANT ALL ON public.group_pot_contributions TO service_role;
ALTER TABLE public.group_pot_contributions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_pot_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id uuid NOT NULL REFERENCES public.group_pots(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle integer NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status public.pot_payout_status NOT NULL DEFAULT 'scheduled',
  savings_account_id uuid REFERENCES public.savings_accounts(id),
  txn_id uuid REFERENCES public.transactions(id),
  paid_by uuid,
  paid_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pot_id, cycle)
);

GRANT SELECT ON public.group_pot_payouts TO authenticated;
GRANT ALL ON public.group_pot_payouts TO service_role;
ALTER TABLE public.group_pot_payouts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_pots_updated BEFORE UPDATE ON public.group_pots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pot_payouts_updated BEFORE UPDATE ON public.group_pot_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Membership helper (avoids recursive policy lookups)
CREATE OR REPLACE FUNCTION private.is_pot_member(_pot_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_pot_members m
    WHERE m.pot_id = _pot_id AND m.profile_id = _uid AND m.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION private.is_pot_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_pot_member(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_savings_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
  SELECT private.has_role(_uid,'super_admin'::public.app_role)
      OR private.has_role(_uid,'finance_officer'::public.app_role)
      OR private.has_role(_uid,'auditor'::public.app_role);
$$;
REVOKE ALL ON FUNCTION private.is_savings_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_savings_staff(uuid) TO authenticated, service_role;

CREATE POLICY "pots_read" ON public.group_pots
  FOR SELECT TO authenticated
  USING (private.is_savings_staff(auth.uid()) OR private.is_pot_member(id, auth.uid()));

CREATE POLICY "pot_members_read" ON public.group_pot_members
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR private.is_savings_staff(auth.uid()) OR private.is_pot_member(pot_id, auth.uid()));

CREATE POLICY "pot_contrib_read" ON public.group_pot_contributions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR private.is_savings_staff(auth.uid()) OR private.is_pot_member(pot_id, auth.uid()));

CREATE POLICY "pot_payouts_read" ON public.group_pot_payouts
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR private.is_savings_staff(auth.uid()) OR private.is_pot_member(pot_id, auth.uid()));

-- ============ RPCs: fixed deposits ============
CREATE OR REPLACE FUNCTION public.open_fixed_deposit(
  _account_id uuid, _product_id uuid, _amount numeric, _rollover text, _actor_id uuid DEFAULT NULL
) RETURNS public.fixed_deposits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _acct public.savings_accounts%ROWTYPE;
  _prod public.fixed_deposit_products%ROWTYPE;
  _available numeric;
  _txn_id uuid;
  _fd public.fixed_deposits%ROWTYPE;
  _interest numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _rollover NOT IN ('none','principal','principal_interest') THEN RAISE EXCEPTION 'invalid_rollover'; END IF;

  SELECT * INTO _acct FROM public.savings_accounts WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND OR _acct.user_id <> _uid THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF _acct.status <> 'active' THEN RAISE EXCEPTION 'account_closed'; END IF;

  SELECT * INTO _prod FROM public.fixed_deposit_products WHERE id = _product_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF _amount < _prod.min_amount THEN RAISE EXCEPTION 'below_minimum'; END IF;
  IF _prod.max_amount IS NOT NULL AND _amount > _prod.max_amount THEN RAISE EXCEPTION 'above_maximum'; END IF;

  _available := _acct.balance - public.savings_held_amount(_account_id);
  IF _available < _amount THEN RAISE EXCEPTION 'insufficient_available_balance'; END IF;

  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (public.gen_txn_ref('FDO'), _uid, 'withdrawal', _amount, 'cleared', 'fixed_deposit', _account_id,
          'Fixed deposit placement: ' || _prod.name)
  RETURNING id INTO _txn_id;

  UPDATE public.savings_accounts SET balance = balance - _amount, updated_at = now() WHERE id = _account_id;

  _interest := ROUND(_amount * (_prod.rate_annual / 100.0) * (_prod.term_months / 12.0), 2);

  INSERT INTO public.fixed_deposits (
    ref, user_id, product_id, source_account_id, principal, rate_annual, term_months,
    start_date, maturity_date, interest_expected, rollover, open_txn_id
  ) VALUES (
    public.gen_txn_ref('FD'), _uid, _product_id, _account_id, _amount, _prod.rate_annual, _prod.term_months,
    CURRENT_DATE, (CURRENT_DATE + (_prod.term_months || ' months')::interval)::date,
    _interest, _rollover, _txn_id
  ) RETURNING * INTO _fd;

  RETURN _fd;
END;
$$;
REVOKE ALL ON FUNCTION public.open_fixed_deposit(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_fixed_deposit(uuid, uuid, numeric, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.break_fixed_deposit(_id uuid, _reason text, _actor_id uuid DEFAULT NULL)
RETURNS public.fixed_deposits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _fd public.fixed_deposits%ROWTYPE;
  _prod public.fixed_deposit_products%ROWTYPE;
  _penalty numeric;
  _payout numeric;
  _txn_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO _fd FROM public.fixed_deposits WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_not_found'; END IF;
  IF _fd.user_id <> _uid AND NOT private.is_savings_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _fd.status <> 'active' THEN RAISE EXCEPTION 'deposit_not_active'; END IF;

  SELECT * INTO _prod FROM public.fixed_deposit_products WHERE id = _fd.product_id;
  _penalty := ROUND(_fd.principal * (COALESCE(_prod.early_break_penalty_pct, 0) / 100.0), 2);
  _payout := GREATEST(_fd.principal - _penalty, 0);

  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (public.gen_txn_ref('FDB'), _fd.user_id, 'deposit', _payout, 'cleared', 'fixed_deposit_break',
          _fd.source_account_id, 'Early break of ' || _fd.ref || ' (penalty ' || _penalty || ')')
  RETURNING id INTO _txn_id;

  UPDATE public.savings_accounts SET balance = balance + _payout, updated_at = now()
  WHERE id = _fd.source_account_id;

  UPDATE public.fixed_deposits
     SET status = 'broken', penalty_amount = _penalty, broken_at = now(), closed_at = now(),
         break_reason = _reason, close_txn_id = _txn_id, updated_at = now()
   WHERE id = _id
  RETURNING * INTO _fd;

  RETURN _fd;
END;
$$;
REVOKE ALL ON FUNCTION public.break_fixed_deposit(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.break_fixed_deposit(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mature_fixed_deposits()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  _row public.fixed_deposits%ROWTYPE;
  _txn_id uuid;
  _total numeric;
  _count integer := 0;
BEGIN
  FOR _row IN
    SELECT * FROM public.fixed_deposits
    WHERE status = 'active' AND maturity_date <= CURRENT_DATE
    ORDER BY maturity_date
    FOR UPDATE
  LOOP
    _total := _row.principal + _row.interest_expected;

    IF _row.rollover = 'none' THEN
      INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
      VALUES (public.gen_txn_ref('FDM'), _row.user_id, 'deposit', _total, 'cleared', 'fixed_deposit_maturity',
              _row.source_account_id, 'Maturity payout for ' || _row.ref)
      RETURNING id INTO _txn_id;

      UPDATE public.savings_accounts SET balance = balance + _total, updated_at = now()
      WHERE id = _row.source_account_id;

      UPDATE public.fixed_deposits
         SET status = 'redeemed', interest_paid = _row.interest_expected,
             close_txn_id = _txn_id, closed_at = now(), updated_at = now()
       WHERE id = _row.id;
    ELSE
      UPDATE public.fixed_deposits
         SET status = 'matured', interest_paid = _row.interest_expected, updated_at = now()
       WHERE id = _row.id;

      INSERT INTO public.fixed_deposits (
        ref, user_id, product_id, source_account_id, principal, rate_annual, term_months,
        start_date, maturity_date, interest_expected, rollover
      ) VALUES (
        public.gen_txn_ref('FD'), _row.user_id, _row.product_id, _row.source_account_id,
        CASE WHEN _row.rollover = 'principal_interest' THEN _total ELSE _row.principal END,
        _row.rate_annual, _row.term_months, CURRENT_DATE,
        (CURRENT_DATE + (_row.term_months || ' months')::interval)::date,
        ROUND((CASE WHEN _row.rollover = 'principal_interest' THEN _total ELSE _row.principal END)
              * (_row.rate_annual / 100.0) * (_row.term_months / 12.0), 2),
        _row.rollover
      );

      IF _row.rollover = 'principal' AND _row.interest_expected > 0 THEN
        INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
        VALUES (public.gen_txn_ref('FDI'), _row.user_id, 'interest', _row.interest_expected, 'cleared',
                'fixed_deposit_interest', _row.source_account_id, 'Interest payout for ' || _row.ref);
        UPDATE public.savings_accounts SET balance = balance + _row.interest_expected, updated_at = now()
        WHERE id = _row.source_account_id;
      END IF;
    END IF;

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.mature_fixed_deposits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mature_fixed_deposits() TO service_role;

-- ============ RPCs: savings holds ============
CREATE OR REPLACE FUNCTION public.place_savings_hold(
  _account_id uuid, _amount numeric, _reason text, _loan_id uuid, _actor_id uuid, _actor_role text
) RETURNS public.savings_holds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  _acct public.savings_accounts%ROWTYPE;
  _available numeric;
  _hold public.savings_holds%ROWTYPE;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_actor_id,'super_admin'::public.app_role)
       OR private.has_role(_actor_id,'finance_officer'::public.app_role)
       OR private.has_role(_actor_id,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO _acct FROM public.savings_accounts WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;

  _available := _acct.balance - public.savings_held_amount(_account_id);
  IF _available < _amount THEN RAISE EXCEPTION 'insufficient_available_balance'; END IF;

  INSERT INTO public.savings_holds (account_id, user_id, amount, reason, loan_id, created_by, created_by_role)
  VALUES (_account_id, _acct.user_id, _amount, btrim(_reason), _loan_id, _actor_id, _actor_role)
  RETURNING * INTO _hold;

  RETURN _hold;
END;
$$;
REVOKE ALL ON FUNCTION public.place_savings_hold(uuid, numeric, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_savings_hold(uuid, numeric, text, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_savings_hold(_id uuid, _reason text, _actor_id uuid)
RETURNS public.savings_holds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  _hold public.savings_holds%ROWTYPE;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_actor_id,'super_admin'::public.app_role)
       OR private.has_role(_actor_id,'finance_officer'::public.app_role)
       OR private.has_role(_actor_id,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO _hold FROM public.savings_holds WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hold_not_found'; END IF;
  IF _hold.status <> 'active' THEN RAISE EXCEPTION 'hold_not_active'; END IF;

  UPDATE public.savings_holds
     SET status = 'released', released_by = _actor_id, released_at = now(),
         release_reason = btrim(_reason), updated_at = now()
   WHERE id = _id
  RETURNING * INTO _hold;

  RETURN _hold;
END;
$$;
REVOKE ALL ON FUNCTION public.release_savings_hold(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_savings_hold(uuid, text, uuid) TO service_role;

-- ============ RPCs: group pots ============
CREATE OR REPLACE FUNCTION public.contribute_to_pot(
  _pot_id uuid, _account_id uuid, _amount numeric, _note text, _actor_id uuid DEFAULT NULL
) RETURNS public.group_pot_contributions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _pot public.group_pots%ROWTYPE;
  _acct public.savings_accounts%ROWTYPE;
  _available numeric;
  _txn_id uuid;
  _row public.group_pot_contributions%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO _pot FROM public.group_pots WHERE id = _pot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pot_not_found'; END IF;
  IF _pot.status <> 'active' THEN RAISE EXCEPTION 'pot_not_active'; END IF;
  IF NOT private.is_pot_member(_pot_id, _uid) THEN RAISE EXCEPTION 'not_a_pot_member'; END IF;

  SELECT * INTO _acct FROM public.savings_accounts WHERE id = _account_id FOR UPDATE;
  IF NOT FOUND OR _acct.user_id <> _uid THEN RAISE EXCEPTION 'account_not_found'; END IF;

  _available := _acct.balance - public.savings_held_amount(_account_id);
  IF _available < _amount THEN RAISE EXCEPTION 'insufficient_available_balance'; END IF;

  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (public.gen_txn_ref('POT'), _uid, 'transfer_out', _amount, 'cleared', 'group_pot', _account_id,
          COALESCE(_note, 'Contribution to ' || _pot.name))
  RETURNING id INTO _txn_id;

  UPDATE public.savings_accounts SET balance = balance - _amount, updated_at = now() WHERE id = _account_id;
  UPDATE public.group_pots SET balance = balance + _amount, updated_at = now() WHERE id = _pot_id;

  INSERT INTO public.group_pot_contributions (pot_id, profile_id, cycle, amount, savings_account_id, txn_id, note)
  VALUES (_pot_id, _uid, _pot.current_cycle, _amount, _account_id, _txn_id, _note)
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.contribute_to_pot(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contribute_to_pot(uuid, uuid, numeric, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pay_pot_payout(_payout_id uuid, _actor_id uuid)
RETURNS public.group_pot_payouts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp
AS $$
DECLARE
  _payout public.group_pot_payouts%ROWTYPE;
  _pot public.group_pots%ROWTYPE;
  _acct_id uuid;
  _txn_id uuid;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_actor_id,'super_admin'::public.app_role)
       OR private.has_role(_actor_id,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _payout FROM public.group_pot_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF _payout.status <> 'scheduled' THEN RAISE EXCEPTION 'payout_not_scheduled'; END IF;

  SELECT * INTO _pot FROM public.group_pots WHERE id = _payout.pot_id FOR UPDATE;
  IF _pot.balance < _payout.amount THEN RAISE EXCEPTION 'insufficient_pot_balance'; END IF;

  _acct_id := COALESCE(_payout.savings_account_id, (
    SELECT id FROM public.savings_accounts
    WHERE user_id = _payout.profile_id AND status = 'active'
    ORDER BY created_at LIMIT 1
  ));
  IF _acct_id IS NULL THEN RAISE EXCEPTION 'recipient_account_not_found'; END IF;

  INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
  VALUES (public.gen_txn_ref('POP'), _payout.profile_id, 'transfer_in', _payout.amount, 'cleared',
          'group_pot_payout', _acct_id, 'Payout cycle ' || _payout.cycle || ' from ' || _pot.name)
  RETURNING id INTO _txn_id;

  UPDATE public.savings_accounts SET balance = balance + _payout.amount, updated_at = now() WHERE id = _acct_id;
  UPDATE public.group_pots
     SET balance = balance - _payout.amount,
         current_cycle = GREATEST(current_cycle, _payout.cycle) + 1,
         updated_at = now()
   WHERE id = _pot.id;

  UPDATE public.group_pot_payouts
     SET status = 'paid', paid_by = _actor_id, paid_at = now(),
         savings_account_id = _acct_id, txn_id = _txn_id, updated_at = now()
   WHERE id = _payout_id
  RETURNING * INTO _payout;

  RETURN _payout;
END;
$$;
REVOKE ALL ON FUNCTION public.pay_pot_payout(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_pot_payout(uuid, uuid) TO service_role;

-- ============ Seed fixed deposit products ============
INSERT INTO public.fixed_deposit_products (code, name, description, term_months, rate_annual, min_amount, max_amount, early_break_penalty_pct, sort_order)
VALUES
  ('FD3',  '3-Month Term',  'Short lock-in with quick access to funds at maturity.', 3,  8.5,  200,  NULL, 1.5, 1),
  ('FD6',  '6-Month Term',  'Balanced term deposit for medium-term goals.',           6,  11.0, 500,  NULL, 2.0, 2),
  ('FD12', '12-Month Term', 'Best rate for members who can lock funds for a year.',   12, 14.5, 1000, NULL, 3.0, 3);
