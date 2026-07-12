
-- Member-initiated transfer request (queued as pending; staff clears/rejects later).
CREATE OR REPLACE FUNCTION public.request_transfer(
  _from_account_id uuid,
  _to_account_id uuid,
  _amount numeric,
  _note text
) RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _from public.savings_accounts%ROWTYPE;
  _to public.savings_accounts%ROWTYPE;
  _kyc public.kyc_status;
  _row public.transfers%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _from_account_id = _to_account_id THEN RAISE EXCEPTION 'same_account'; END IF;

  SELECT * INTO _from FROM public.savings_accounts WHERE id = _from_account_id;
  IF NOT FOUND OR _from.user_id <> _uid THEN RAISE EXCEPTION 'source_not_owned'; END IF;
  IF _from.status <> 'active' THEN RAISE EXCEPTION 'source_inactive'; END IF;
  IF _from.balance < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  SELECT * INTO _to FROM public.savings_accounts WHERE id = _to_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'destination_not_found'; END IF;
  IF _to.status <> 'active' THEN RAISE EXCEPTION 'destination_inactive'; END IF;

  SELECT kyc INTO _kyc FROM public.profiles WHERE id = _uid;
  IF _kyc <> 'active' THEN RAISE EXCEPTION 'kyc_not_approved'; END IF;

  INSERT INTO public.transfers (from_account_id, to_account_id, amount, channel, note, created_by, status)
  VALUES (_from_account_id, _to_account_id, _amount, 'member_request', _note, _uid, 'pending')
  RETURNING * INTO _row;

  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  SELECT _uid, u.email, 'member', 'transfer.requested', _row.id::text,
    jsonb_build_object('ref', _row.ref, 'from', _from_account_id, 'to', _to_account_id, 'amount', _amount)
  FROM auth.users u WHERE u.id = _uid;

  RETURN _row;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_transfer(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_transfer(uuid, uuid, numeric, text) TO authenticated;

-- Staff-side reject with reason.
CREATE OR REPLACE FUNCTION public.reject_transfer(_transfer_id uuid, _reason text, _actor_id uuid)
RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.transfers%ROWTYPE;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  UPDATE public.transfers
     SET status = 'failed',
         note = COALESCE(note, '') || CASE WHEN _reason IS NOT NULL THEN E'\nRejected: ' || _reason ELSE '' END,
         cleared_by = _uid,
         cleared_at = now()
   WHERE id = _transfer_id AND status = 'pending'
   RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_pending'; END IF;
  PERFORM private.write_audit(_uid, 'transfer.rejected', _row.id::text,
    jsonb_build_object('ref', _row.ref, 'reason', _reason, 'amount', _row.amount));
  RETURN _row;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_transfer(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_transfer(uuid, text, uuid) TO authenticated, service_role;
