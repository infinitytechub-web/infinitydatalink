-- 1. Preferences
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT true,
  sms boolean NOT NULL DEFAULT false,
  muted_categories text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs read" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Outbox for email / SMS hooks
CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  category text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_outbox_pending_idx ON public.notification_outbox (status, created_at);
CREATE INDEX notification_outbox_user_idx ON public.notification_outbox (user_id, created_at DESC);
GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own outbox read" ON public.notification_outbox FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
  );
CREATE TRIGGER notification_outbox_updated_at BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Shared dispatcher
CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid,
  _category text,
  _title text,
  _body text DEFAULT NULL,
  _link text DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb,
  _dedupe_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pref public.notification_preferences%ROWTYPE;
  note_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO pref FROM public.notification_preferences WHERE user_id = _user_id;
  IF NOT FOUND THEN
    pref.in_app := true; pref.email := true; pref.sms := false; pref.muted_categories := '{}';
  END IF;

  IF _category = ANY (pref.muted_categories) THEN
    RETURN NULL;
  END IF;

  IF pref.in_app THEN
    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (_user_id, _category, _title, _body, _link)
    RETURNING id INTO note_id;
  END IF;

  IF pref.email THEN
    INSERT INTO public.notification_outbox (user_id, channel, category, title, body, link, meta, dedupe_key)
    VALUES (_user_id, 'email', _category, _title, _body, _link, COALESCE(_meta, '{}'::jsonb),
            CASE WHEN _dedupe_key IS NULL THEN NULL ELSE 'email:' || _dedupe_key END)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  IF pref.sms THEN
    INSERT INTO public.notification_outbox (user_id, channel, category, title, body, link, meta, dedupe_key)
    VALUES (_user_id, 'sms', _category, _title, _body, _link, COALESCE(_meta, '{}'::jsonb),
            CASE WHEN _dedupe_key IS NULL THEN NULL ELSE 'sms:' || _dedupe_key END)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN note_id;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, jsonb, text) TO service_role;

-- 4. Loan lifecycle trigger
CREATE OR REPLACE FUNCTION public.notify_loan_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.notify_user(NEW.user_id, 'loan.approved',
        'Loan approved',
        'Your ' || NEW.product || ' loan application ' || NEW.ref || ' for ' || to_char(NEW.amount, 'FM999999990.00') || ' was approved.',
        '/app/loans/' || NEW.id,
        jsonb_build_object('loan_id', NEW.id, 'ref', NEW.ref, 'amount', NEW.amount),
        'loan-approved:' || NEW.id);
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(NEW.user_id, 'loan.rejected',
        'Loan application declined',
        'Your loan application ' || NEW.ref || ' was declined.' || COALESCE(' Reason: ' || NEW.decision_note, ''),
        '/app/loans/' || NEW.id,
        jsonb_build_object('loan_id', NEW.id, 'ref', NEW.ref),
        'loan-rejected:' || NEW.id);
    END IF;
  END IF;

  IF NEW.disbursed_at IS NOT NULL AND OLD.disbursed_at IS NULL THEN
    PERFORM public.notify_user(NEW.user_id, 'loan.disbursed',
      'Loan disbursed',
      'Loan ' || NEW.ref || ' of ' || to_char(NEW.amount, 'FM999999990.00') || ' has been disbursed to your savings account.',
      '/app/loans/' || NEW.id,
      jsonb_build_object('loan_id', NEW.id, 'ref', NEW.ref, 'amount', NEW.amount),
      'loan-disbursed:' || NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_loan_event_trg ON public.loans;
CREATE TRIGGER notify_loan_event_trg AFTER UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.notify_loan_event();

-- 5. Savings withdrawal lifecycle trigger
CREATE OR REPLACE FUNCTION public.notify_withdrawal_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.notify_user(NEW.user_id, 'savings.withdrawal.approved',
        'Withdrawal approved',
        'Your withdrawal request ' || NEW.ref || ' for ' || to_char(NEW.amount, 'FM999999990.00') || ' was approved and is awaiting payout.',
        '/app/savings/' || NEW.account_id,
        jsonb_build_object('request_id', NEW.id, 'ref', NEW.ref, 'amount', NEW.amount),
        'wd-approved:' || NEW.id);
    ELSIF NEW.status = 'paid' THEN
      PERFORM public.notify_user(NEW.user_id, 'savings.withdrawal.paid',
        'Withdrawal paid',
        'Your withdrawal ' || NEW.ref || ' of ' || to_char(NEW.amount, 'FM999999990.00') || ' has been paid via ' || COALESCE(NEW.channel, 'your selected channel') || '.',
        '/app/savings/' || NEW.account_id,
        jsonb_build_object('request_id', NEW.id, 'ref', NEW.ref, 'amount', NEW.amount),
        'wd-paid:' || NEW.id);
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_user(NEW.user_id, 'savings.withdrawal.rejected',
        'Withdrawal declined',
        'Your withdrawal request ' || NEW.ref || ' was declined.' || COALESCE(' Reason: ' || NEW.rejection_reason, ''),
        '/app/savings/' || NEW.account_id,
        jsonb_build_object('request_id', NEW.id, 'ref', NEW.ref),
        'wd-rejected:' || NEW.id);
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notify_user(NEW.user_id, 'savings.withdrawal.cancelled',
        'Withdrawal cancelled',
        'Your withdrawal request ' || NEW.ref || ' was cancelled.' || COALESCE(' Reason: ' || NEW.cancellation_reason, ''),
        '/app/savings/' || NEW.account_id,
        jsonb_build_object('request_id', NEW.id, 'ref', NEW.ref),
        'wd-cancelled:' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_withdrawal_event_trg ON public.savings_withdrawal_requests;
CREATE TRIGGER notify_withdrawal_event_trg AFTER UPDATE ON public.savings_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_withdrawal_event();

-- 6. Installment due / overdue reminders
ALTER TABLE public.loan_repayments
  ADD COLUMN IF NOT EXISTS due_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.run_loan_repayment_reminders(_days_ahead integer DEFAULT 3)
RETURNS TABLE (due_soon integer, overdue integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n_due integer := 0;
  n_over integer := 0;
BEGIN
  FOR r IN
    SELECT lr.id, lr.installment_no, lr.due_date, lr.total_due, lr.paid_amount, l.id AS loan_id, l.ref, l.user_id
    FROM public.loan_repayments lr
    JOIN public.loans l ON l.id = lr.loan_id
    WHERE lr.status <> 'paid'
      AND lr.due_notified_at IS NULL
      AND lr.due_date >= CURRENT_DATE
      AND lr.due_date <= CURRENT_DATE + (GREATEST(_days_ahead, 0) || ' days')::interval
  LOOP
    PERFORM public.notify_user(r.user_id, 'loan.installment.due',
      'Installment due ' || to_char(r.due_date, 'DD Mon YYYY'),
      'Installment #' || r.installment_no || ' of ' || to_char(r.total_due - r.paid_amount, 'FM999999990.00') || ' on loan ' || r.ref || ' is due on ' || to_char(r.due_date, 'DD Mon YYYY') || '.',
      '/app/repayments',
      jsonb_build_object('loan_id', r.loan_id, 'repayment_id', r.id, 'due_date', r.due_date),
      'inst-due:' || r.id);
    UPDATE public.loan_repayments SET due_notified_at = now() WHERE id = r.id;
    n_due := n_due + 1;
  END LOOP;

  FOR r IN
    SELECT lr.id, lr.installment_no, lr.due_date, lr.total_due, lr.paid_amount, l.id AS loan_id, l.ref, l.user_id
    FROM public.loan_repayments lr
    JOIN public.loans l ON l.id = lr.loan_id
    WHERE lr.status <> 'paid'
      AND lr.overdue_notified_at IS NULL
      AND lr.due_date < CURRENT_DATE
  LOOP
    PERFORM public.notify_user(r.user_id, 'loan.installment.overdue',
      'Installment overdue',
      'Installment #' || r.installment_no || ' of ' || to_char(r.total_due - r.paid_amount, 'FM999999990.00') || ' on loan ' || r.ref || ' was due on ' || to_char(r.due_date, 'DD Mon YYYY') || ' and is now overdue.',
      '/app/repayments',
      jsonb_build_object('loan_id', r.loan_id, 'repayment_id', r.id, 'due_date', r.due_date),
      'inst-overdue:' || r.id);
    UPDATE public.loan_repayments SET overdue_notified_at = now() WHERE id = r.id;
    n_over := n_over + 1;
  END LOOP;

  RETURN QUERY SELECT n_due, n_over;
END;
$$;
REVOKE ALL ON FUNCTION public.run_loan_repayment_reminders(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_loan_repayment_reminders(integer) FROM anon;
REVOKE ALL ON FUNCTION public.run_loan_repayment_reminders(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_loan_repayment_reminders(integer) TO service_role;