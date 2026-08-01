-- Early settlement (payoff) request workflow -------------------------------
DO $$ BEGIN
  CREATE TYPE public.settlement_request_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.loan_settlement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  settle_on date NOT NULL,
  quoted_total numeric(14,2) NOT NULL CHECK (quoted_total >= 0),
  quote jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_note text,
  status public.settlement_request_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX loan_settlement_requests_status_idx ON public.loan_settlement_requests (status, requested_at DESC);
CREATE INDEX loan_settlement_requests_loan_idx ON public.loan_settlement_requests (loan_id);
CREATE INDEX loan_settlement_requests_user_idx ON public.loan_settlement_requests (user_id);
CREATE UNIQUE INDEX loan_settlement_requests_one_open_idx
  ON public.loan_settlement_requests (loan_id) WHERE status = 'pending';

-- Reads only; all writes flow through the SECURITY DEFINER routines below.
GRANT SELECT ON public.loan_settlement_requests TO authenticated;
GRANT ALL ON public.loan_settlement_requests TO service_role;

ALTER TABLE public.loan_settlement_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own settlement requests"
  ON public.loan_settlement_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Staff read all settlement requests"
  ON public.loan_settlement_requests FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'loan_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );

CREATE TRIGGER update_loan_settlement_requests_updated_at
  BEFORE UPDATE ON public.loan_settlement_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Member submits a settlement request for their own loan ---------------------
CREATE OR REPLACE FUNCTION public.request_loan_settlement(
  _loan_id uuid,
  _settle_on date,
  _quoted_total numeric,
  _quote jsonb,
  _note text,
  _actor_id uuid DEFAULT NULL
) RETURNS public.loan_settlement_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _loan public.loans%ROWTYPE;
  _row public.loan_settlement_requests%ROWTYPE;
  _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_not_found'; END IF;

  -- Members may only request for their own loan; staff may request on behalf.
  IF _loan.user_id <> _uid
     AND NOT (private.has_role(_uid,'super_admin'::public.app_role)
              OR private.has_role(_uid,'finance_officer'::public.app_role)
              OR private.has_role(_uid,'loan_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _loan.status NOT IN ('active','approved') THEN RAISE EXCEPTION 'loan_not_settleable'; END IF;
  IF _settle_on IS NULL OR _settle_on < current_date THEN RAISE EXCEPTION 'invalid_settle_date'; END IF;
  IF _quoted_total IS NULL OR _quoted_total < 0 THEN RAISE EXCEPTION 'invalid_quote'; END IF;
  IF EXISTS (SELECT 1 FROM public.loan_settlement_requests WHERE loan_id = _loan_id AND status = 'pending') THEN
    RAISE EXCEPTION 'pending_exists';
  END IF;

  INSERT INTO public.loan_settlement_requests
    (loan_id, user_id, settle_on, quoted_total, quote, member_note)
  VALUES (_loan_id, _loan.user_id, _settle_on, round(_quoted_total,2), COALESCE(_quote,'{}'::jsonb), NULLIF(btrim(_note),''))
  RETURNING * INTO _row;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'member', 'loan.settlement_requested', _loan_id::text,
          jsonb_build_object('request_id', _row.id, 'ref', _loan.ref,
                             'settle_on', _settle_on, 'quoted_total', _row.quoted_total));

  RETURN _row;
END;
$function$;

-- Member (or staff) cancels a pending request --------------------------------
CREATE OR REPLACE FUNCTION public.cancel_loan_settlement(
  _request_id uuid,
  _note text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL
) RETURNS public.loan_settlement_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.loan_settlement_requests%ROWTYPE;
  _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _row FROM public.loan_settlement_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'already_decided'; END IF;
  IF _row.user_id <> _uid
     AND NOT (private.has_role(_uid,'super_admin'::public.app_role)
              OR private.has_role(_uid,'finance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  UPDATE public.loan_settlement_requests
     SET status = 'cancelled', decided_by = _uid, decided_by_email = _email,
         decided_at = now(), decision_note = NULLIF(btrim(_note),'')
   WHERE id = _request_id RETURNING * INTO _row;

  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, CASE WHEN _row.user_id = _uid THEN 'member' ELSE 'staff' END,
          'loan.settlement_cancelled', _row.loan_id::text,
          jsonb_build_object('request_id', _row.id, 'note', _row.decision_note));

  RETURN _row;
END;
$function$;

-- Staff approve / reject -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_loan_settlement(
  _request_id uuid,
  _approve boolean,
  _note text,
  _actor_id uuid DEFAULT NULL
) RETURNS public.loan_settlement_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _actor_id);
  _row public.loan_settlement_requests%ROWTYPE;
  _loan public.loans%ROWTYPE;
  _email text;
  _role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF private.has_role(_uid,'super_admin'::public.app_role) THEN _role := 'super_admin';
  ELSIF private.has_role(_uid,'finance_officer'::public.app_role) THEN _role := 'finance_officer';
  ELSE RAISE EXCEPTION 'forbidden'; END IF;

  IF _note IS NULL OR length(btrim(_note)) < 10 THEN RAISE EXCEPTION 'note_required'; END IF;

  SELECT * INTO _row FROM public.loan_settlement_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'already_decided'; END IF;
  -- Two-person rule: an officer cannot decide a request they raised themselves.
  IF _row.user_id = _uid THEN RAISE EXCEPTION 'two_person_rule'; END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _row.loan_id;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  UPDATE public.loan_settlement_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END::public.settlement_request_status,
         decided_by = _uid, decided_by_email = _email,
         decided_at = now(), decision_note = btrim(_note)
   WHERE id = _request_id RETURNING * INTO _row;

  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, _role,
          CASE WHEN _approve THEN 'loan.settlement_approved' ELSE 'loan.settlement_rejected' END,
          _row.loan_id::text,
          jsonb_build_object('request_id', _row.id, 'ref', _loan.ref,
                             'settle_on', _row.settle_on, 'quoted_total', _row.quoted_total,
                             'note', btrim(_note)));

  IF _approve THEN
    PERFORM public.notify_user(_row.user_id, 'loan.settlement_approved',
      'Early settlement approved',
      'Your early settlement request for loan ' || COALESCE(_loan.ref,'') || ' was approved. Settlement amount '
        || to_char(_row.quoted_total,'FM999999990.00') || ' is payable on or before '
        || to_char(_row.settle_on,'DD Mon YYYY') || '.',
      '/app/loans/' || _row.loan_id,
      jsonb_build_object('request_id', _row.id, 'loan_id', _row.loan_id, 'amount', _row.quoted_total),
      'settlement-approved:' || _row.id);
  ELSE
    PERFORM public.notify_user(_row.user_id, 'loan.settlement_rejected',
      'Early settlement request declined',
      'Your early settlement request for loan ' || COALESCE(_loan.ref,'') || ' was declined. Reason: ' || btrim(_note),
      '/app/loans/' || _row.loan_id,
      jsonb_build_object('request_id', _row.id, 'loan_id', _row.loan_id),
      'settlement-rejected:' || _row.id);
  END IF;

  RETURN _row;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_loan_settlement(uuid, date, numeric, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_loan_settlement(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_loan_settlement(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_loan_settlement(uuid, date, numeric, jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_loan_settlement(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_loan_settlement(uuid, boolean, text, uuid) TO service_role;
