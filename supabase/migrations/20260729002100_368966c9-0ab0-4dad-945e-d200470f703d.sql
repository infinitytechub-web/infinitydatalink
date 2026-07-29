CREATE TYPE public.share_txn_kind AS ENUM ('purchase','sale','dividend');

CREATE TABLE public.share_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  unit_price numeric(14,2) NOT NULL CHECK (unit_price > 0),
  currency text NOT NULL DEFAULT 'GHS',
  dividend_rate_annual numeric(6,4) NOT NULL DEFAULT 0,
  min_units integer NOT NULL DEFAULT 1 CHECK (min_units >= 1),
  max_units_per_member integer,
  total_units_issued integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_products TO authenticated;
GRANT ALL ON public.share_products TO service_role;
ALTER TABLE public.share_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_products_read_active_or_staff" ON public.share_products FOR SELECT TO authenticated
  USING (
    is_active
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );
CREATE POLICY "share_products_staff_write" ON public.share_products FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role) OR private.has_role(auth.uid(), 'finance_officer'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role) OR private.has_role(auth.uid(), 'finance_officer'::public.app_role));
CREATE TRIGGER share_products_touch BEFORE UPDATE ON public.share_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.share_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.share_products(id) ON DELETE RESTRICT,
  units integer NOT NULL DEFAULT 0 CHECK (units >= 0),
  cost_basis numeric(14,2) NOT NULL DEFAULT 0,
  total_dividends numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_holdings TO authenticated;
GRANT ALL ON public.share_holdings TO service_role;
ALTER TABLE public.share_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_holdings_read_own_or_staff" ON public.share_holdings FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );
CREATE TRIGGER share_holdings_touch BEFORE UPDATE ON public.share_holdings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX share_holdings_user_idx ON public.share_holdings(user_id);
CREATE INDEX share_holdings_product_idx ON public.share_holdings(product_id);

CREATE TABLE public.dividend_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES public.share_products(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  per_unit_amount numeric(14,4) NOT NULL CHECK (per_unit_amount > 0),
  units_paid integer NOT NULL DEFAULT 0,
  members_paid integer NOT NULL DEFAULT 0,
  total_paid numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  note text,
  created_by uuid,
  executed_by uuid,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft','executed','cancelled')),
  CHECK (period_end >= period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dividend_runs TO authenticated;
GRANT ALL ON public.dividend_runs TO service_role;
ALTER TABLE public.dividend_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dividend_runs_read_all_auth" ON public.dividend_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "dividend_runs_staff_write" ON public.dividend_runs FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role) OR private.has_role(auth.uid(), 'finance_officer'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role) OR private.has_role(auth.uid(), 'finance_officer'::public.app_role));
CREATE TRIGGER dividend_runs_touch BEFORE UPDATE ON public.dividend_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.share_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  holding_id uuid NOT NULL REFERENCES public.share_holdings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.share_products(id) ON DELETE RESTRICT,
  kind public.share_txn_kind NOT NULL,
  units integer NOT NULL,
  unit_price numeric(14,4) NOT NULL,
  amount numeric(14,2) NOT NULL,
  savings_account_id uuid REFERENCES public.savings_accounts(id) ON DELETE SET NULL,
  txn_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  dividend_run_id uuid REFERENCES public.dividend_runs(id) ON DELETE SET NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_transactions TO authenticated;
GRANT ALL ON public.share_transactions TO service_role;
ALTER TABLE public.share_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_transactions_read_own_or_staff" ON public.share_transactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );
CREATE INDEX share_txn_user_created_idx ON public.share_transactions(user_id, created_at DESC);
CREATE INDEX share_txn_product_created_idx ON public.share_transactions(product_id, created_at DESC);
CREATE INDEX share_txn_dividend_run_idx ON public.share_transactions(dividend_run_id);

CREATE OR REPLACE FUNCTION public.purchase_shares(
  _product_id uuid, _units integer, _savings_account_id uuid, _note text, _actor_id uuid
) RETURNS public.share_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_product public.share_products;
  v_holding public.share_holdings;
  v_amount numeric(14,2);
  v_txn_id uuid;
  v_row public.share_transactions;
  v_ref text;
BEGIN
  IF _actor_id IS NULL OR _actor_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF _units IS NULL OR _units < 1 THEN
    RAISE EXCEPTION 'invalid_units' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_product FROM public.share_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND OR NOT v_product.is_active THEN
    RAISE EXCEPTION 'product_not_available' USING ERRCODE = 'P0002';
  END IF;
  IF _units < v_product.min_units THEN
    RAISE EXCEPTION 'below_minimum_units' USING ERRCODE = '22023';
  END IF;

  v_amount := v_product.unit_price * _units;
  v_txn_id := public.post_savings_withdrawal(_savings_account_id, v_amount, 'shares',
    COALESCE(_note, 'Share purchase: ' || v_product.name), _actor_id);

  INSERT INTO public.share_holdings (user_id, product_id, units, cost_basis)
  VALUES (_actor_id, _product_id, _units, v_amount)
  ON CONFLICT (user_id, product_id) DO UPDATE
    SET units = share_holdings.units + EXCLUDED.units,
        cost_basis = share_holdings.cost_basis + EXCLUDED.cost_basis
  RETURNING * INTO v_holding;

  IF v_product.max_units_per_member IS NOT NULL AND v_holding.units > v_product.max_units_per_member THEN
    RAISE EXCEPTION 'exceeds_max_per_member' USING ERRCODE = '22023';
  END IF;

  UPDATE public.share_products SET total_units_issued = total_units_issued + _units WHERE id = _product_id;

  v_ref := public.gen_txn_ref('SHP');
  INSERT INTO public.share_transactions
    (ref, holding_id, user_id, product_id, kind, units, unit_price, amount, savings_account_id, txn_id, actor_id, note)
  VALUES
    (v_ref, v_holding.id, _actor_id, _product_id, 'purchase', _units, v_product.unit_price, v_amount, _savings_account_id, v_txn_id, _actor_id, _note)
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, target, meta)
  VALUES (_actor_id, 'shares.purchase', v_row.id::text,
    jsonb_build_object('product_id', _product_id, 'units', _units, 'amount', v_amount));

  RETURN v_row;
END;
$fn$;
REVOKE ALL ON FUNCTION public.purchase_shares(uuid, integer, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_shares(uuid, integer, uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sell_shares(
  _product_id uuid, _units integer, _savings_account_id uuid, _note text, _actor_id uuid
) RETURNS public.share_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_product public.share_products;
  v_holding public.share_holdings;
  v_amount numeric(14,2);
  v_txn_id uuid;
  v_row public.share_transactions;
  v_ref text;
  v_cost_reduction numeric(14,2);
BEGIN
  IF _actor_id IS NULL OR _actor_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF _units IS NULL OR _units < 1 THEN
    RAISE EXCEPTION 'invalid_units' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_product FROM public.share_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_available' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_holding FROM public.share_holdings WHERE user_id = _actor_id AND product_id = _product_id FOR UPDATE;
  IF NOT FOUND OR v_holding.units < _units THEN RAISE EXCEPTION 'insufficient_units' USING ERRCODE = '22023'; END IF;

  v_amount := v_product.unit_price * _units;
  v_txn_id := public.post_savings_contribution(_savings_account_id, v_amount, 'shares',
    COALESCE(_note, 'Share sale: ' || v_product.name), _actor_id);

  v_cost_reduction := CASE
    WHEN v_holding.units = 0 THEN 0
    ELSE ROUND(v_holding.cost_basis * _units::numeric / v_holding.units::numeric, 2)
  END;

  UPDATE public.share_holdings
    SET units = units - _units, cost_basis = GREATEST(0, cost_basis - v_cost_reduction)
    WHERE id = v_holding.id RETURNING * INTO v_holding;
  UPDATE public.share_products SET total_units_issued = GREATEST(0, total_units_issued - _units) WHERE id = _product_id;

  v_ref := public.gen_txn_ref('SHS');
  INSERT INTO public.share_transactions
    (ref, holding_id, user_id, product_id, kind, units, unit_price, amount, savings_account_id, txn_id, actor_id, note)
  VALUES
    (v_ref, v_holding.id, _actor_id, _product_id, 'sale', _units, v_product.unit_price, v_amount, _savings_account_id, v_txn_id, _actor_id, _note)
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, target, meta)
  VALUES (_actor_id, 'shares.sale', v_row.id::text,
    jsonb_build_object('product_id', _product_id, 'units', _units, 'amount', v_amount));

  RETURN v_row;
END;
$fn$;
REVOKE ALL ON FUNCTION public.sell_shares(uuid, integer, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sell_shares(uuid, integer, uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_dividend_run(_run_id uuid, _actor_id uuid)
RETURNS public.dividend_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_run public.dividend_runs;
  v_h RECORD;
  v_units_paid integer := 0;
  v_members_paid integer := 0;
  v_total_paid numeric(14,2) := 0;
  v_amount numeric(14,2);
  v_account_id uuid;
  v_txn_id uuid;
  v_ref text;
BEGIN
  IF NOT (private.has_role(_actor_id, 'super_admin'::public.app_role) OR private.has_role(_actor_id, 'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.dividend_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'run_not_draft' USING ERRCODE = '22023'; END IF;

  FOR v_h IN
    SELECT h.id AS holding_id, h.user_id, h.units
      FROM public.share_holdings h
     WHERE h.product_id = v_run.product_id AND h.units > 0
     ORDER BY h.user_id
  LOOP
    SELECT id INTO v_account_id FROM public.savings_accounts
      WHERE user_id = v_h.user_id AND status = 'active'
      ORDER BY created_at ASC LIMIT 1;
    IF v_account_id IS NULL THEN CONTINUE; END IF;
    v_amount := ROUND(v_run.per_unit_amount * v_h.units, 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;

    v_txn_id := public.post_savings_contribution(v_account_id, v_amount, 'dividend', 'Dividend ' || v_run.ref, _actor_id);
    UPDATE public.share_holdings SET total_dividends = total_dividends + v_amount WHERE id = v_h.holding_id;

    v_ref := public.gen_txn_ref('DIV');
    INSERT INTO public.share_transactions
      (ref, holding_id, user_id, product_id, kind, units, unit_price, amount, savings_account_id, txn_id, dividend_run_id, actor_id, note)
    VALUES
      (v_ref, v_h.holding_id, v_h.user_id, v_run.product_id, 'dividend', v_h.units, v_run.per_unit_amount, v_amount, v_account_id, v_txn_id, _run_id, _actor_id, 'Dividend ' || v_run.ref);

    v_units_paid := v_units_paid + v_h.units;
    v_members_paid := v_members_paid + 1;
    v_total_paid := v_total_paid + v_amount;
  END LOOP;

  UPDATE public.dividend_runs
    SET status = 'executed', executed_by = _actor_id, executed_at = now(),
        units_paid = v_units_paid, members_paid = v_members_paid, total_paid = v_total_paid
    WHERE id = _run_id RETURNING * INTO v_run;

  INSERT INTO public.audit_log (actor_id, action, target, meta)
  VALUES (_actor_id, 'shares.dividend_run.execute', _run_id::text,
    jsonb_build_object('product_id', v_run.product_id, 'members_paid', v_members_paid,
                       'units_paid', v_units_paid, 'total_paid', v_total_paid));

  RETURN v_run;
END;
$fn$;
REVOKE ALL ON FUNCTION public.execute_dividend_run(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_dividend_run(uuid, uuid) TO authenticated;

INSERT INTO public.share_products (code, name, description, unit_price, currency, dividend_rate_annual, min_units)
VALUES ('SHARE-A', 'Cooperative Share A', 'Core membership share unit paying declared annual dividends.', 100.00, 'GHS', 0.0800, 1)
ON CONFLICT (code) DO NOTHING;