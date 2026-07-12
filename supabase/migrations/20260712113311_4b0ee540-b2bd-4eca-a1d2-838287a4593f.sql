
-- Member-initiated transfer requests: create pending transfers from an account
-- the caller owns to any active savings account (their own or another member's).
-- Finance still clears via public.clear_transfer.

CREATE OR REPLACE FUNCTION public.request_transfer(
  _from_account_id uuid,
  _to_account_id uuid,
  _amount numeric,
  _note text
) RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _from public.savings_accounts%ROWTYPE;
  _to   public.savings_accounts%ROWTYPE;
  _kyc  public.kyc_status;
  _row  public.transfers%ROWTYPE;
  _actor_email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _from_account_id = _to_account_id THEN RAISE EXCEPTION 'same_account'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO _from FROM public.savings_accounts WHERE id = _from_account_id;
  IF NOT FOUND OR _from.user_id <> _uid THEN RAISE EXCEPTION 'source_not_owned'; END IF;
  IF _from.status <> 'active' THEN RAISE EXCEPTION 'source_inactive'; END IF;

  SELECT * INTO _to FROM public.savings_accounts WHERE id = _to_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'destination_not_found'; END IF;
  IF _to.status <> 'active' THEN RAISE EXCEPTION 'destination_inactive'; END IF;

  SELECT kyc INTO _kyc FROM public.profiles WHERE id = _uid;
  IF _kyc IS DISTINCT FROM 'active'::public.kyc_status THEN
    RAISE EXCEPTION 'kyc_not_approved';
  END IF;

  IF _from.balance < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  INSERT INTO public.transfers (from_account_id, to_account_id, amount, channel, note, created_by, status)
  VALUES (_from_account_id, _to_account_id, _amount, 'member_request', _note, _uid, 'pending')
  RETURNING * INTO _row;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _actor_email, 'member', 'transfer.requested', _row.id::text,
          jsonb_build_object('ref', _row.ref, 'from', _from_account_id, 'to', _to_account_id,
                             'amount', _amount, 'same_owner', (_from.user_id = _to.user_id)));
  RETURN _row;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.request_transfer(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_transfer(uuid, uuid, numeric, text) TO authenticated;

-- Allow members to INSERT into transfers via the SECURITY DEFINER helper only
-- (RLS still blocks any direct client insert). Add reject-transfer helper for
-- finance staff to cancel pending requests with a reason.
CREATE OR REPLACE FUNCTION public.reject_transfer(
  _transfer_id uuid,
  _reason text,
  _actor_id uuid
) RETURNS public.transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.transfers%ROWTYPE;
BEGIN
  PERFORM private.assert_finance_staff(_uid);
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE public.transfers
     SET status = 'failed',
         cleared_at = now(),
         cleared_by = _uid,
         note = COALESCE(note,'') || E'\nRejected: ' || _reason
   WHERE id = _transfer_id AND status = 'pending'
   RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_pending'; END IF;
  PERFORM private.write_audit(_uid,'transfer.rejected',_row.id::text,
    jsonb_build_object('ref',_row.ref,'reason',_reason,'amount',_row.amount));
  RETURN _row;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.reject_transfer(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_transfer(uuid, text, uuid) TO authenticated, service_role;
