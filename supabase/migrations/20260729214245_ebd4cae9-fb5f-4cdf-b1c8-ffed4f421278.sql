ALTER TABLE public.savings_withdrawal_requests
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_role text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Member self-service cancellation (pending only) with a reason
CREATE OR REPLACE FUNCTION public.cancel_savings_withdrawal(_id uuid, _reason text DEFAULT NULL)
RETURNS public.savings_withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.savings_withdrawal_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.savings_withdrawal_requests
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancelled_by_role = 'member',
         cancellation_reason = NULLIF(btrim(coalesce(_reason, '')), '')
   WHERE id = _id AND user_id = v_uid AND status = 'pending'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_cancellable'; END IF;
  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.cancel_savings_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_savings_withdrawal(uuid, text) TO authenticated, service_role;

-- Staff cancellation on behalf of a member (pending or approved, never paid)
CREATE OR REPLACE FUNCTION public.admin_cancel_savings_withdrawal(
  _id uuid,
  _reason text,
  _actor_id uuid,
  _actor_role text DEFAULT 'finance_officer'
)
RETURNS public.savings_withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.savings_withdrawal_requests;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'actor_required'; END IF;
  IF btrim(coalesce(_reason, '')) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE public.savings_withdrawal_requests
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = _actor_id,
         cancelled_by_role = coalesce(_actor_role, 'finance_officer'),
         cancellation_reason = btrim(_reason)
   WHERE id = _id AND status IN ('pending', 'approved')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_cancellable'; END IF;
  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_savings_withdrawal(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_savings_withdrawal(uuid, text, uuid, text) TO service_role;