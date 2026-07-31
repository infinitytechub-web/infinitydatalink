-- ============================================================
-- Loan modules: products & eligibility, arrears, penalties,
-- guarantors & collateral, restructuring & write-off
-- ============================================================

DO $$ BEGIN CREATE TYPE public.guarantor_consent_status AS ENUM ('pending','accepted','declined','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.collateral_status AS ENUM ('pledged','released','seized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.loan_restructure_kind AS ENUM ('reschedule','grace_period','write_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.loan_restructure_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 1. Loan products
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  min_amount numeric(14,2) NOT NULL DEFAULT 100 CHECK (min_amount > 0),
  max_amount numeric(14,2) NOT NULL DEFAULT 100000 CHECK (max_amount > 0),
  min_term_months int NOT NULL DEFAULT 1 CHECK (min_term_months > 0),
  max_term_months int NOT NULL DEFAULT 60 CHECK (max_term_months > 0),
  interest_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  processing_fee_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (processing_fee_pct >= 0),
  late_fee_pct numeric(5,2) NOT NULL DEFAULT 2 CHECK (late_fee_pct >= 0),
  late_fee_grace_days int NOT NULL DEFAULT 5 CHECK (late_fee_grace_days >= 0),
  max_multiple_of_savings numeric(6,2) NOT NULL DEFAULT 3 CHECK (max_multiple_of_savings >= 0),
  min_savings_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (min_savings_balance >= 0),
  max_open_loans int NOT NULL DEFAULT 1 CHECK (max_open_loans >= 0),
  requires_guarantor boolean NOT NULL DEFAULT false,
  min_guarantors int NOT NULL DEFAULT 0 CHECK (min_guarantors >= 0),
  requires_collateral boolean NOT NULL DEFAULT false,
  requires_verified_kyc boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loan_products_amount_range CHECK (max_amount >= min_amount),
  CONSTRAINT loan_products_term_range CHECK (max_term_months >= min_term_months)
);

GRANT SELECT ON public.loan_products TO authenticated;
GRANT ALL ON public.loan_products TO service_role;
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_products_read_active" ON public.loan_products
  FOR SELECT TO authenticated
  USING (
    active
    OR private.has_role(auth.uid(),'super_admin'::public.app_role)
    OR private.has_role(auth.uid(),'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(),'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(),'auditor'::public.app_role)
  );

CREATE TRIGGER trg_loan_products_updated
  BEFORE UPDATE ON public.loan_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.loan_products
  (code, name, description, min_amount, max_amount, min_term_months, max_term_months,
   interest_rate, processing_fee_pct, late_fee_pct, late_fee_grace_days,
   max_multiple_of_savings, min_savings_balance, requires_guarantor, min_guarantors)
VALUES
  ('SALARY','Salary Advance','Short-term advance repaid from monthly salary.',
   200, 20000, 1, 12, 18.00, 1.00, 2.00, 5, 3, 200, false, 0),
  ('SME','SME Business Loan','Working-capital facility for registered member businesses.',
   1000, 150000, 6, 48, 24.00, 2.00, 2.50, 7, 4, 1000, true, 2),
  ('EMERGENCY','Emergency Loan','Fast-track facility for medical and family emergencies.',
   100, 5000, 1, 6, 12.00, 0.00, 1.50, 10, 2, 0, false, 0)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Loan columns: product link, arrears, penalties, workout state
-- ------------------------------------------------------------
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.loan_products(id),
  ADD COLUMN IF NOT EXISTS days_past_due int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrears_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrears_bucket text NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS arrears_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS penalty_accrued numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_paid numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restructure_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restructured_at timestamptz,
  ADD COLUMN IF NOT EXISTS written_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS written_off_amount numeric(14,2);

CREATE INDEX IF NOT EXISTS idx_loans_arrears ON public.loans(arrears_bucket, days_past_due DESC);

-- ------------------------------------------------------------
-- 3. Guarantors
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_guarantors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  relationship text,
  phone text,
  email text,
  guaranteed_amount numeric(14,2) NOT NULL CHECK (guaranteed_amount > 0),
  consent public.guarantor_consent_status NOT NULL DEFAULT 'pending',
  consent_at timestamptz,
  consent_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_guarantors_loan ON public.loan_guarantors(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_guarantors_member ON public.loan_guarantors(member_id);

GRANT SELECT, UPDATE ON public.loan_guarantors TO authenticated;
GRANT ALL ON public.loan_guarantors TO service_role;
ALTER TABLE public.loan_guarantors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_guarantors_read" ON public.loan_guarantors
  FOR SELECT TO authenticated
  USING (
    member_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.user_id = auth.uid())
    OR private.has_role(auth.uid(),'super_admin'::public.app_role)
    OR private.has_role(auth.uid(),'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(),'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(),'auditor'::public.app_role)
  );

-- Named guarantors may only answer their own request (consent columns are
-- further constrained by the guard trigger below).
CREATE POLICY "loan_guarantors_self_consent" ON public.loan_guarantors
  FOR UPDATE TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_guarantor_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR private.has_role(auth.uid(),'super_admin'::public.app_role)
     OR private.has_role(auth.uid(),'loan_officer'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
     OR NEW.guaranteed_amount IS DISTINCT FROM OLD.guaranteed_amount
     OR NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    RAISE EXCEPTION 'guarantor_fields_locked';
  END IF;

  IF NEW.consent NOT IN ('accepted','declined','revoked') THEN
    RAISE EXCEPTION 'invalid_consent_transition';
  END IF;

  NEW.consent_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_loan_guarantors_guard
  BEFORE UPDATE ON public.loan_guarantors
  FOR EACH ROW EXECUTE FUNCTION public.guard_guarantor_self_update();

CREATE TRIGGER trg_loan_guarantors_updated
  BEFORE UPDATE ON public.loan_guarantors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 4. Collateral
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_collateral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  kind text NOT NULL,
  description text NOT NULL,
  estimated_value numeric(14,2) NOT NULL CHECK (estimated_value >= 0),
  currency text NOT NULL DEFAULT 'GHS',
  reference_no text,
  savings_hold_id uuid REFERENCES public.savings_holds(id) ON DELETE SET NULL,
  status public.collateral_status NOT NULL DEFAULT 'pledged',
  released_at timestamptz,
  released_by uuid,
  release_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_collateral_loan ON public.loan_collateral(loan_id, status);

GRANT SELECT ON public.loan_collateral TO authenticated;
GRANT ALL ON public.loan_collateral TO service_role;
ALTER TABLE public.loan_collateral ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_collateral_read" ON public.loan_collateral
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.user_id = auth.uid())
    OR private.has_role(auth.uid(),'super_admin'::public.app_role)
    OR private.has_role(auth.uid(),'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(),'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(),'auditor'::public.app_role)
  );

CREATE TRIGGER trg_loan_collateral_updated
  BEFORE UPDATE ON public.loan_collateral
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 5. Penalties
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  repayment_id uuid REFERENCES public.loan_repayments(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  days_late int NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'late_payment',
  waived_at timestamptz,
  waived_by uuid,
  waive_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repayment_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_loan_penalties_loan ON public.loan_penalties(loan_id, waived_at);

GRANT SELECT ON public.loan_penalties TO authenticated;
GRANT ALL ON public.loan_penalties TO service_role;
ALTER TABLE public.loan_penalties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_penalties_read" ON public.loan_penalties
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.user_id = auth.uid())
    OR private.has_role(auth.uid(),'super_admin'::public.app_role)
    OR private.has_role(auth.uid(),'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(),'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(),'auditor'::public.app_role)
  );

CREATE TRIGGER trg_loan_penalties_updated
  BEFORE UPDATE ON public.loan_penalties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 6. Restructure / write-off requests (two-person rule)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_restructures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  kind public.loan_restructure_kind NOT NULL,
  status public.loan_restructure_status NOT NULL DEFAULT 'pending',
  new_term_months int CHECK (new_term_months IS NULL OR new_term_months > 0),
  new_interest_rate numeric(5,2) CHECK (new_interest_rate IS NULL OR new_interest_rate >= 0),
  grace_months int CHECK (grace_months IS NULL OR grace_months > 0),
  write_off_amount numeric(14,2) CHECK (write_off_amount IS NULL OR write_off_amount > 0),
  request_note text NOT NULL,
  requested_by uuid NOT NULL,
  requested_by_email text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_restructures_status ON public.loan_restructures(status, requested_at DESC);

GRANT SELECT ON public.loan_restructures TO authenticated;
GRANT ALL ON public.loan_restructures TO service_role;
ALTER TABLE public.loan_restructures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_restructures_read_staff" ON public.loan_restructures
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(),'super_admin'::public.app_role)
    OR private.has_role(auth.uid(),'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(),'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(),'auditor'::public.app_role)
  );

CREATE TRIGGER trg_loan_restructures_updated
  BEFORE UPDATE ON public.loan_restructures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Functions
-- ============================================================

-- Eligibility check ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_loan_eligibility(
  _user_id uuid, _product_id uuid, _amount numeric, _term_months int
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _p public.loan_products%ROWTYPE;
  _savings numeric := 0;
  _open int := 0;
  _arrears int := 0;
  _kyc text;
  _reasons jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO _p FROM public.loan_products WHERE id = _product_id AND active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'reasons', jsonb_build_array('Product unavailable'));
  END IF;

  SELECT COALESCE(SUM(balance),0) INTO _savings FROM public.savings_accounts WHERE user_id = _user_id;
  SELECT COUNT(*) INTO _open FROM public.loans WHERE user_id = _user_id AND status IN ('pending','approved','active');
  SELECT COUNT(*) INTO _arrears FROM public.loans WHERE user_id = _user_id AND days_past_due > 0 AND status = 'active';
  SELECT kyc::text INTO _kyc FROM public.profiles WHERE id = _user_id;

  IF _amount < _p.min_amount OR _amount > _p.max_amount THEN
    _reasons := _reasons || to_jsonb(format('Amount must be between %s and %s', _p.min_amount, _p.max_amount));
  END IF;
  IF _term_months < _p.min_term_months OR _term_months > _p.max_term_months THEN
    _reasons := _reasons || to_jsonb(format('Term must be between %s and %s months', _p.min_term_months, _p.max_term_months));
  END IF;
  IF _p.requires_verified_kyc AND COALESCE(_kyc,'pending') <> 'active' THEN
    _reasons := _reasons || to_jsonb('KYC verification required'::text);
  END IF;
  IF _savings < _p.min_savings_balance THEN
    _reasons := _reasons || to_jsonb(format('Minimum savings balance of %s required', _p.min_savings_balance));
  END IF;
  IF _p.max_multiple_of_savings > 0 AND _amount > _savings * _p.max_multiple_of_savings THEN
    _reasons := _reasons || to_jsonb(format('Amount exceeds %sx your savings balance', _p.max_multiple_of_savings));
  END IF;
  IF _open >= _p.max_open_loans THEN
    _reasons := _reasons || to_jsonb(format('You already have %s open loan(s)', _open));
  END IF;
  IF _arrears > 0 THEN
    _reasons := _reasons || to_jsonb('Existing loan is in arrears'::text);
  END IF;

  RETURN jsonb_build_object(
    'eligible', jsonb_array_length(_reasons) = 0,
    'reasons', _reasons,
    'savings_balance', _savings,
    'max_eligible_amount', LEAST(_p.max_amount, CASE WHEN _p.max_multiple_of_savings > 0
      THEN round(_savings * _p.max_multiple_of_savings, 2) ELSE _p.max_amount END),
    'requires_guarantor', _p.requires_guarantor,
    'min_guarantors', _p.min_guarantors,
    'requires_collateral', _p.requires_collateral,
    'interest_rate', _p.interest_rate,
    'processing_fee', round(_amount * _p.processing_fee_pct / 100.0, 2)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.check_loan_eligibility(uuid, uuid, numeric, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_loan_eligibility(uuid, uuid, numeric, int) TO authenticated, service_role;

-- Arrears refresh --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_loan_arrears()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE _updated int := 0;
BEGIN
  UPDATE public.loan_repayments
     SET status = 'overdue'
   WHERE status = 'pending' AND due_date < current_date;

  WITH agg AS (
    SELECT l.id,
           COALESCE(MAX(current_date - r.due_date), 0) AS dpd,
           COALESCE(SUM(GREATEST(r.total_due - COALESCE(r.paid_amount,0), 0)), 0) AS arrears
      FROM public.loans l
      LEFT JOIN public.loan_repayments r
        ON r.loan_id = l.id AND r.status <> 'paid' AND r.due_date < current_date
     WHERE l.status = 'active'
     GROUP BY l.id
  )
  UPDATE public.loans l
     SET days_past_due = GREATEST(agg.dpd, 0),
         arrears_amount = round(agg.arrears, 2),
         arrears_bucket = CASE
           WHEN agg.dpd <= 0 THEN 'current'
           WHEN agg.dpd <= 30 THEN '1-30'
           WHEN agg.dpd <= 60 THEN '31-60'
           WHEN agg.dpd <= 90 THEN '61-90'
           ELSE '90+' END,
         arrears_refreshed_at = now()
    FROM agg
   WHERE l.id = agg.id;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN jsonb_build_object('loans_updated', _updated, 'as_of', current_date);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_loan_arrears() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_loan_arrears() TO service_role;

-- Penalty accrual --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assess_loan_penalties()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _row record;
  _fee numeric;
  _grace int;
  _pct numeric;
  _period date := date_trunc('month', current_date)::date;
  _count int := 0;
  _total numeric := 0;
BEGIN
  FOR _row IN
    SELECT r.id AS repayment_id, r.loan_id, r.due_date, r.total_due, COALESCE(r.paid_amount,0) AS paid,
           l.product_id
      FROM public.loan_repayments r
      JOIN public.loans l ON l.id = r.loan_id
     WHERE l.status = 'active' AND r.status <> 'paid' AND r.due_date < current_date
  LOOP
    SELECT COALESCE(p.late_fee_grace_days, 5), COALESCE(p.late_fee_pct, 2)
      INTO _grace, _pct
      FROM public.loan_products p WHERE p.id = _row.product_id;
    _grace := COALESCE(_grace, 5);
    _pct := COALESCE(_pct, 2);

    CONTINUE WHEN (current_date - _row.due_date) <= _grace;

    _fee := round(GREATEST(_row.total_due - _row.paid, 0) * _pct / 100.0, 2);
    CONTINUE WHEN _fee <= 0;

    INSERT INTO public.loan_penalties (loan_id, repayment_id, period_month, amount, days_late)
    VALUES (_row.loan_id, _row.repayment_id, _period, _fee, current_date - _row.due_date)
    ON CONFLICT (repayment_id, period_month) DO NOTHING;

    IF FOUND THEN
      UPDATE public.loans
         SET penalty_accrued = round(penalty_accrued + _fee, 2)
       WHERE id = _row.loan_id;
      _count := _count + 1;
      _total := _total + _fee;
    END IF;
  END LOOP;

  IF _count > 0 THEN
    INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
    VALUES (NULL, 'system@cron', 'system', 'loan.penalties_assessed', _period::text,
            jsonb_build_object('count', _count, 'total', _total));
  END IF;

  RETURN jsonb_build_object('penalties_created', _count, 'total_amount', _total, 'period', _period);
END;
$$;
REVOKE ALL ON FUNCTION public.assess_loan_penalties() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assess_loan_penalties() TO service_role;

-- Waive a penalty --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waive_loan_penalty(_penalty_id uuid, _note text, _actor_id uuid)
RETURNS public.loan_penalties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _p public.loan_penalties%ROWTYPE;
  _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role)
          OR private.has_role(_uid,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _note IS NULL OR length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'note_required'; END IF;

  SELECT * INTO _p FROM public.loan_penalties WHERE id = _penalty_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'penalty_not_found'; END IF;
  IF _p.waived_at IS NOT NULL THEN RAISE EXCEPTION 'already_waived'; END IF;

  UPDATE public.loan_penalties
     SET waived_at = now(), waived_by = _uid, waive_note = btrim(_note)
   WHERE id = _penalty_id
   RETURNING * INTO _p;

  UPDATE public.loans
     SET penalty_accrued = GREATEST(round(penalty_accrued - _p.amount, 2), 0)
   WHERE id = _p.loan_id;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'finance', 'loan.penalty_waived', _p.id::text,
          jsonb_build_object('loan_id', _p.loan_id, 'amount', _p.amount, 'note', btrim(_note)));

  RETURN _p;
END;
$$;
REVOKE ALL ON FUNCTION public.waive_loan_penalty(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waive_loan_penalty(uuid, text, uuid) TO service_role;

-- Guarantors / collateral write helpers ---------------------------------
CREATE OR REPLACE FUNCTION public.add_loan_guarantor(
  _loan_id uuid, _member_id uuid, _full_name text, _relationship text,
  _phone text, _email text, _amount numeric, _actor_id uuid
) RETURNS public.loan_guarantors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.loan_guarantors%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role)
          OR private.has_role(_uid,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  INSERT INTO public.loan_guarantors
    (loan_id, member_id, full_name, relationship, phone, email, guaranteed_amount, created_by)
  VALUES (_loan_id, _member_id, btrim(_full_name), _relationship, _phone, _email, _amount, _uid)
  RETURNING * INTO _row;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target, meta)
  VALUES (_uid, 'loan_officer', 'loan.guarantor_added', _loan_id::text,
          jsonb_build_object('guarantor_id', _row.id, 'amount', _amount, 'member_id', _member_id));
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.add_loan_guarantor(uuid, uuid, text, text, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_loan_guarantor(uuid, uuid, text, text, text, text, numeric, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.remove_loan_guarantor(_guarantor_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _loan uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role)
          OR private.has_role(_uid,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.loan_guarantors WHERE id = _guarantor_id RETURNING loan_id INTO _loan;
  IF _loan IS NULL THEN RAISE EXCEPTION 'guarantor_not_found'; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, target, meta)
  VALUES (_uid, 'loan_officer', 'loan.guarantor_removed', _loan::text,
          jsonb_build_object('guarantor_id', _guarantor_id));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_loan_guarantor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_loan_guarantor(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_guarantor_consent(_guarantor_id uuid, _decision text, _note text, _actor_id uuid)
RETURNS public.loan_guarantors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.loan_guarantors%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _decision NOT IN ('accepted','declined','revoked') THEN RAISE EXCEPTION 'invalid_decision'; END IF;

  SELECT * INTO _row FROM public.loan_guarantors WHERE id = _guarantor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guarantor_not_found'; END IF;
  IF _row.member_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.loan_guarantors
     SET consent = _decision::public.guarantor_consent_status,
         consent_at = now(),
         consent_note = NULLIF(btrim(COALESCE(_note,'')), '')
   WHERE id = _guarantor_id
   RETURNING * INTO _row;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target, meta)
  VALUES (_uid, 'member', 'loan.guarantor_consent', _row.loan_id::text,
          jsonb_build_object('guarantor_id', _row.id, 'decision', _decision));
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.set_guarantor_consent(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_guarantor_consent(uuid, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.add_loan_collateral(
  _loan_id uuid, _kind text, _description text, _value numeric,
  _reference_no text, _savings_hold_id uuid, _actor_id uuid
) RETURNS public.loan_collateral
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.loan_collateral%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role)
          OR private.has_role(_uid,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.loan_collateral
    (loan_id, kind, description, estimated_value, reference_no, savings_hold_id, created_by)
  VALUES (_loan_id, btrim(_kind), btrim(_description), COALESCE(_value,0), _reference_no, _savings_hold_id, _uid)
  RETURNING * INTO _row;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target, meta)
  VALUES (_uid, 'loan_officer', 'loan.collateral_pledged', _loan_id::text,
          jsonb_build_object('collateral_id', _row.id, 'kind', _kind, 'value', _value));
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.add_loan_collateral(uuid, text, text, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_loan_collateral(uuid, text, text, numeric, text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_loan_collateral(_collateral_id uuid, _note text, _actor_id uuid)
RETURNS public.loan_collateral
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.loan_collateral%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role)
          OR private.has_role(_uid,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _note IS NULL OR length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'note_required'; END IF;

  UPDATE public.loan_collateral
     SET status = 'released', released_at = now(), released_by = _uid, release_note = btrim(_note)
   WHERE id = _collateral_id AND status = 'pledged'
   RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'collateral_not_pledged'; END IF;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target, meta)
  VALUES (_uid, 'loan_officer', 'loan.collateral_released', _row.loan_id::text,
          jsonb_build_object('collateral_id', _row.id, 'note', btrim(_note)));
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.release_loan_collateral(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_loan_collateral(uuid, text, uuid) TO service_role;

-- Restructure request / decision (two-person rule) -----------------------
CREATE OR REPLACE FUNCTION public.request_loan_restructure(
  _loan_id uuid, _kind text, _new_term_months int, _new_interest_rate numeric,
  _grace_months int, _write_off_amount numeric, _note text, _actor_id uuid
) RETURNS public.loan_restructures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _loan public.loans%ROWTYPE;
  _row public.loan_restructures%ROWTYPE;
  _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role)
          OR private.has_role(_uid,'loan_officer'::public.app_role)
          OR private.has_role(_uid,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _kind NOT IN ('reschedule','grace_period','write_off') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF _note IS NULL OR length(btrim(_note)) < 10 THEN RAISE EXCEPTION 'note_required'; END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;
  IF _loan.status <> 'active' THEN RAISE EXCEPTION 'loan_not_active'; END IF;

  IF _kind = 'reschedule' AND COALESCE(_new_term_months,0) <= 0 THEN RAISE EXCEPTION 'new_term_required'; END IF;
  IF _kind = 'grace_period' AND COALESCE(_grace_months,0) <= 0 THEN RAISE EXCEPTION 'grace_months_required'; END IF;
  IF _kind = 'write_off' THEN
    IF COALESCE(_write_off_amount,0) <= 0 THEN RAISE EXCEPTION 'write_off_amount_required'; END IF;
    IF _write_off_amount > _loan.outstanding_principal THEN RAISE EXCEPTION 'write_off_exceeds_outstanding'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.loan_restructures WHERE loan_id = _loan_id AND status = 'pending') THEN
    RAISE EXCEPTION 'pending_request_exists';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  INSERT INTO public.loan_restructures
    (loan_id, kind, new_term_months, new_interest_rate, grace_months, write_off_amount,
     request_note, requested_by, requested_by_email)
  VALUES (_loan_id, _kind::public.loan_restructure_kind, _new_term_months, _new_interest_rate,
          _grace_months, _write_off_amount, btrim(_note), _uid, _email)
  RETURNING * INTO _row;

  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'loan_officer', 'loan.restructure_requested', _loan_id::text,
          jsonb_build_object('request_id', _row.id, 'kind', _kind, 'note', btrim(_note)));
  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.request_loan_restructure(uuid, text, int, numeric, int, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_loan_restructure(uuid, text, int, numeric, int, numeric, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.decide_loan_restructure(
  _request_id uuid, _approve boolean, _note text, _actor_id uuid
) RETURNS public.loan_restructures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _req public.loan_restructures%ROWTYPE;
  _loan public.loans%ROWTYPE;
  _email text;
  _r numeric; _pmt numeric; _outstanding numeric; _interest numeric; _principal numeric;
  _first_due date; _due date; i int; _term int; _rate numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_uid,'super_admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _note IS NULL OR length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'note_required'; END IF;

  SELECT * INTO _req FROM public.loan_restructures WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'already_decided'; END IF;
  -- Two-person rule: the requester may not approve their own request.
  IF _req.requested_by = _uid THEN RAISE EXCEPTION 'two_person_rule'; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  IF NOT _approve THEN
    UPDATE public.loan_restructures
       SET status = 'rejected', decided_by = _uid, decided_by_email = _email,
           decided_at = now(), decision_note = btrim(_note)
     WHERE id = _request_id RETURNING * INTO _req;

    INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
    VALUES (_uid, _email, 'super_admin', 'loan.restructure_rejected', _req.loan_id::text,
            jsonb_build_object('request_id', _req.id, 'kind', _req.kind, 'note', btrim(_note)));
    RETURN _req;
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _req.loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;

  IF _req.kind = 'write_off' THEN
    UPDATE public.loans
       SET outstanding_principal = GREATEST(round(outstanding_principal - _req.write_off_amount, 2), 0),
           written_off_at = now(),
           written_off_amount = COALESCE(written_off_amount, 0) + _req.write_off_amount,
           status = CASE WHEN round(outstanding_principal - _req.write_off_amount, 2) <= 0
                         THEN 'closed'::public.loan_status ELSE status END
     WHERE id = _loan.id RETURNING * INTO _loan;

    UPDATE public.loan_repayments
       SET status = 'written_off'
     WHERE loan_id = _loan.id AND status <> 'paid' AND _loan.status = 'closed';
  ELSE
    -- Reschedule / grace period: rebuild the unpaid schedule.
    _term := COALESCE(_req.new_term_months, _loan.term_months);
    _rate := COALESCE(_req.new_interest_rate, _loan.interest_rate);
    _outstanding := _loan.outstanding_principal;
    _first_due := (current_date + ((COALESCE(_req.grace_months,0) + 1) || ' months')::interval)::date;

    DELETE FROM public.loan_repayments WHERE loan_id = _loan.id AND status <> 'paid';

    _r := _rate / 100.0 / 12.0;
    IF _r = 0 THEN
      _pmt := round(_outstanding / _term, 2);
    ELSE
      _pmt := round(_outstanding * _r / (1 - power(1 + _r, -_term)), 2);
    END IF;

    FOR i IN 1.._term LOOP
      _due := (_first_due + ((i - 1) || ' months')::interval)::date;
      IF _r = 0 THEN _interest := 0; ELSE _interest := round(_outstanding * _r, 2); END IF;
      IF i = _term THEN
        _principal := _outstanding;
        _pmt := round(_principal + _interest, 2);
      ELSE
        _principal := round(_pmt - _interest, 2);
      END IF;
      _outstanding := round(_outstanding - _principal, 2);

      INSERT INTO public.loan_repayments (loan_id, installment_no, due_date, principal_due, interest_due, total_due)
      VALUES (_loan.id, i, _due, _principal, _interest, round(_principal + _interest, 2));
    END LOOP;

    UPDATE public.loans
       SET term_months = _term,
           interest_rate = _rate,
           monthly_payment = _pmt,
           first_payment_at = _first_due,
           maturity_at = (_first_due + ((_term - 1) || ' months')::interval)::date,
           restructure_count = restructure_count + 1,
           restructured_at = now(),
           days_past_due = 0,
           arrears_amount = 0,
           arrears_bucket = 'current'
     WHERE id = _loan.id RETURNING * INTO _loan;
  END IF;

  UPDATE public.loan_restructures
     SET status = 'approved', decided_by = _uid, decided_by_email = _email,
         decided_at = now(), decision_note = btrim(_note)
   WHERE id = _request_id RETURNING * INTO _req;

  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'super_admin', 'loan.restructure_approved', _req.loan_id::text,
          jsonb_build_object('request_id', _req.id, 'kind', _req.kind,
                             'requested_by', _req.requested_by, 'note', btrim(_note)));
  RETURN _req;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_loan_restructure(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_loan_restructure(uuid, boolean, text, uuid) TO service_role;