-- Payment rails, payer details, idempotency and settlement tracking
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS rail text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payer_phone text,
  ADD COLUMN IF NOT EXISTS payer_network text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_status_check;
ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_status_check CHECK (status IN (
    'requires_configuration','pending','processing','succeeded','failed','cancelled','reversed'
  ));

ALTER TABLE public.payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_phone_check;
ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_phone_check CHECK (
    payer_phone IS NULL OR payer_phone ~ '^0[0-9]{9}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_idempotency_key_uq
  ON public.payment_intents(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_intents_status_idx
  ON public.payment_intents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_intents_rail_idx
  ON public.payment_intents(rail, created_at DESC);

-- Receipt numbering
CREATE SEQUENCE IF NOT EXISTS public.payment_receipt_no_seq;
GRANT USAGE ON SEQUENCE public.payment_receipt_no_seq TO service_role;

CREATE OR REPLACE FUNCTION public.next_payment_receipt_no()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'RCPT-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.payment_receipt_no_seq')::text, 6, '0');
$$;
REVOKE ALL ON FUNCTION public.next_payment_receipt_no() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_payment_receipt_no() TO service_role;

-- Refund / reversal requests
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'GHS',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','processed','failed')),
  provider_reference text,
  requested_by uuid,
  approved_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_refunds_intent_idx ON public.payment_refunds(intent_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_refunds TO authenticated;
GRANT ALL ON public.payment_refunds TO service_role;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own refunds" ON public.payment_refunds
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.payment_intents pi
    WHERE pi.id = intent_id AND pi.member_id = auth.uid()
  ));
CREATE POLICY "staff read refunds" ON public.payment_refunds
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'payments', 'view'));
CREATE POLICY "staff manage refunds" ON public.payment_refunds
  FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'payments', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'payments', 'manage'));

CREATE TRIGGER payment_refunds_touch
  BEFORE UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();