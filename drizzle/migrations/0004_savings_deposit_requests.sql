CREATE TABLE public.savings_deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL DEFAULT ('DEP-' || upper(substr(md5(random()::text),1,10))),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  channel text NOT NULL DEFAULT 'mobile_money',
  payment_reference text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  txn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sdr_user ON public.savings_deposit_requests(user_id, created_at DESC);
CREATE INDEX idx_sdr_status ON public.savings_deposit_requests(status, created_at DESC);
GRANT SELECT ON public.savings_deposit_requests TO authenticated;
GRANT ALL ON public.savings_deposit_requests TO service_role;
ALTER TABLE public.savings_deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deposit requests readable" ON public.savings_deposit_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "finance reads deposit requests" ON public.savings_deposit_requests
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'finance_officer') OR private.can_read_all(auth.uid()));

CREATE OR REPLACE FUNCTION public.request_savings_deposit(_account_id uuid, _amount numeric, _channel text, _payment_reference text, _note text)
RETURNS public.savings_deposit_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_acc public.savings_accounts; v_row public.savings_deposit_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _amount > 1000000 THEN RAISE EXCEPTION 'above_max_amount'; END IF;
  SELECT * INTO v_acc FROM public.savings_accounts WHERE id = _account_id;
  IF NOT FOUND OR v_acc.user_id <> v_uid THEN RAISE EXCEPTION 'account_not_owned'; END IF;
  IF v_acc.status <> 'active' THEN RAISE EXCEPTION 'account_not_active'; END IF;
  IF _channel NOT IN ('mobile_money','bank_transfer','card','cash') THEN RAISE EXCEPTION 'invalid_channel'; END IF;
  INSERT INTO public.savings_deposit_requests(user_id, account_id, amount, channel, payment_reference, note)
  VALUES (v_uid, _account_id, round(_amount,2), _channel, NULLIF(btrim(_payment_reference),''), NULLIF(btrim(_note),''))
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_savings_deposit(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.savings_deposit_requests SET status='cancelled', decided_at=now()
   WHERE id=_id AND user_id=auth.uid() AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_cancellable'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.decide_savings_deposit(_id uuid, _approve boolean, _note text, _actor_id uuid)
RETURNS public.savings_deposit_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.savings_deposit_requests; v_txn uuid;
BEGIN
  IF _actor_id IS NULL OR NOT (private.has_role(_actor_id,'super_admin') OR private.has_role(_actor_id,'admin') OR private.has_role(_actor_id,'finance_officer')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_row FROM public.savings_deposit_requests WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF v_row.user_id = _actor_id THEN RAISE EXCEPTION 'cannot_approve_own_deposit'; END IF;
  IF NOT _approve AND (_note IS NULL OR length(btrim(_note)) < 5) THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF _approve THEN
    v_txn := public.post_savings_contribution(v_row.account_id, v_row.amount, v_row.channel,
      'Deposit request ' || v_row.ref || COALESCE(' · ' || v_row.payment_reference,''), _actor_id);
  END IF;
  UPDATE public.savings_deposit_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         decided_by=_actor_id, decided_at=now(), decision_note=NULLIF(btrim(_note),''), txn_id=v_txn
   WHERE id=_id RETURNING * INTO v_row;
  PERFORM public.notify_user(v_row.user_id, 'savings',
    CASE WHEN _approve THEN 'Deposit received' ELSE 'Deposit not approved' END,
    CASE WHEN _approve THEN 'GH₵' || v_row.amount || ' has been added to your savings (' || v_row.ref || ').'
         ELSE 'Your deposit ' || v_row.ref || ' was not approved: ' || COALESCE(v_row.decision_note,'') END,
    '/app/deposits', jsonb_build_object('deposit_id', v_row.id), 'deposit:' || v_row.id || ':' || v_row.status);
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.request_savings_deposit(uuid,numeric,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_savings_deposit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_savings_deposit(uuid,boolean,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_savings_deposit(uuid,numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_savings_deposit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_savings_deposit(uuid,boolean,text,uuid) TO service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_deposit_requests;