CREATE OR REPLACE FUNCTION public.decide_savings_deposit(_id uuid, _approve boolean, _note text, _actor_id uuid)
RETURNS public.savings_deposit_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.savings_deposit_requests; v_txn uuid; v_acc public.savings_accounts;
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
    SELECT * INTO v_acc FROM public.savings_accounts WHERE id = v_row.account_id FOR UPDATE;
    IF NOT FOUND OR v_acc.status <> 'active' THEN RAISE EXCEPTION 'account_not_active'; END IF;
    INSERT INTO public.transactions (ref, user_id, kind, amount, status, channel, savings_account_id, note)
    VALUES (public.gen_txn_ref('DEP'), v_row.user_id, 'deposit', v_row.amount, 'cleared', v_row.channel, v_row.account_id,
            'Deposit request ' || v_row.ref || COALESCE(' · ' || v_row.payment_reference,''))
    RETURNING id INTO v_txn;
    UPDATE public.savings_accounts SET balance = balance + v_row.amount, updated_at = now() WHERE id = v_row.account_id;
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
REVOKE ALL ON FUNCTION public.decide_savings_deposit(uuid,boolean,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_savings_deposit(uuid,boolean,text,uuid) TO service_role;