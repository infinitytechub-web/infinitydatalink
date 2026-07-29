
ALTER TABLE public.dividend_runs
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- Submit draft for approval (creator or any finance staff)
CREATE OR REPLACE FUNCTION public.submit_dividend_run_for_approval(_run_id uuid, _actor_id uuid)
RETURNS public.dividend_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_run public.dividend_runs;
BEGIN
  IF NOT (private.has_role(_actor_id, 'super_admin'::public.app_role)
       OR private.has_role(_actor_id, 'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.dividend_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'run_not_draft' USING ERRCODE = '22023'; END IF;
  UPDATE public.dividend_runs
    SET status = 'pending_approval', submitted_by = _actor_id, submitted_at = now()
    WHERE id = _run_id RETURNING * INTO v_run;
  INSERT INTO public.audit_log (actor_id, action, target, meta)
  VALUES (_actor_id, 'shares.dividend_run.submit', _run_id::text,
    jsonb_build_object('ref', v_run.ref, 'product_id', v_run.product_id));
  RETURN v_run;
END; $$;

-- Approve (super_admin or compliance_officer, cannot equal creator/submitter)
CREATE OR REPLACE FUNCTION public.approve_dividend_run(_run_id uuid, _actor_id uuid, _note text DEFAULT NULL)
RETURNS public.dividend_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_run public.dividend_runs;
BEGIN
  IF NOT (private.has_role(_actor_id, 'super_admin'::public.app_role)
       OR private.has_role(_actor_id, 'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.dividend_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status <> 'pending_approval' THEN RAISE EXCEPTION 'run_not_pending' USING ERRCODE = '22023'; END IF;
  IF v_run.created_by = _actor_id OR v_run.submitted_by = _actor_id THEN
    RAISE EXCEPTION 'self_approval_forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.dividend_runs
    SET status = 'approved', approved_by = _actor_id, approved_at = now(),
        approval_note = NULLIF(BTRIM(COALESCE(_note, '')), '')
    WHERE id = _run_id RETURNING * INTO v_run;
  INSERT INTO public.audit_log (actor_id, action, target, meta)
  VALUES (_actor_id, 'shares.dividend_run.approve', _run_id::text,
    jsonb_build_object('ref', v_run.ref, 'product_id', v_run.product_id, 'note', v_run.approval_note));
  RETURN v_run;
END; $$;

-- Reject (same reviewer role, reason required)
CREATE OR REPLACE FUNCTION public.reject_dividend_run(_run_id uuid, _actor_id uuid, _reason text)
RETURNS public.dividend_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_run public.dividend_runs;
BEGIN
  IF _reason IS NULL OR BTRIM(_reason) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF NOT (private.has_role(_actor_id, 'super_admin'::public.app_role)
       OR private.has_role(_actor_id, 'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.dividend_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status <> 'pending_approval' THEN RAISE EXCEPTION 'run_not_pending' USING ERRCODE = '22023'; END IF;
  IF v_run.created_by = _actor_id OR v_run.submitted_by = _actor_id THEN
    RAISE EXCEPTION 'self_review_forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.dividend_runs
    SET status = 'rejected', rejected_by = _actor_id, rejected_at = now(),
        rejection_reason = BTRIM(_reason)
    WHERE id = _run_id RETURNING * INTO v_run;
  INSERT INTO public.audit_log (actor_id, action, target, meta)
  VALUES (_actor_id, 'shares.dividend_run.reject', _run_id::text,
    jsonb_build_object('ref', v_run.ref, 'reason', v_run.rejection_reason));
  RETURN v_run;
END; $$;

-- Execute: now requires status='approved' and executor != approver
CREATE OR REPLACE FUNCTION public.execute_dividend_run(_run_id uuid, _actor_id uuid)
RETURNS public.dividend_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  IF NOT (private.has_role(_actor_id, 'super_admin'::public.app_role)
       OR private.has_role(_actor_id, 'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.dividend_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_run.status <> 'approved' THEN
    RAISE EXCEPTION 'run_not_approved' USING ERRCODE = '22023';
  END IF;
  IF v_run.approved_by IS NULL OR v_run.approved_by = _actor_id THEN
    RAISE EXCEPTION 'dual_control_required' USING ERRCODE = '42501';
  END IF;

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
                       'units_paid', v_units_paid, 'total_paid', v_total_paid,
                       'approved_by', v_run.approved_by));
  RETURN v_run;
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_dividend_run_for_approval(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_dividend_run(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_dividend_run(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_dividend_run_for_approval(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_dividend_run(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_dividend_run(uuid, uuid, text) TO service_role;
