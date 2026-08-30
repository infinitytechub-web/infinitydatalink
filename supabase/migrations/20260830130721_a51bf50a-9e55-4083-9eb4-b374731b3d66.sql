CREATE TABLE public.teller_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teller_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opening_float numeric(14,2) NOT NULL DEFAULT 0,
  expected_close numeric(14,2),
  counted_close numeric(14,2),
  variance numeric(14,2),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  open_note text,
  close_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.teller_sessions TO authenticated;
GRANT ALL ON public.teller_sessions TO service_role;
ALTER TABLE public.teller_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tellers read own sessions" ON public.teller_sessions
  FOR SELECT TO authenticated
  USING (teller_id = auth.uid() OR public.has_permission_for('teller', 'manage') OR public.has_permission_for('teller', 'approve'));

CREATE TABLE public.teller_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.teller_sessions(id) ON DELETE RESTRICT,
  teller_id uuid NOT NULL,
  member_id uuid NOT NULL,
  kind text NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference text NOT NULL UNIQUE,
  account_id uuid,
  loan_id uuid,
  transaction_id uuid,
  note text,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.teller_transactions TO authenticated;
GRANT ALL ON public.teller_transactions TO service_role;
ALTER TABLE public.teller_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tellers read own postings" ON public.teller_transactions
  FOR SELECT TO authenticated
  USING (
    teller_id = auth.uid()
    OR member_id = auth.uid()
    OR public.has_permission_for('teller', 'manage')
    OR public.has_permission_for('teller', 'approve')
    OR public.has_permission_for('teller', 'export')
  );

CREATE INDEX teller_sessions_teller_idx ON public.teller_sessions (teller_id, opened_at DESC);
CREATE INDEX teller_sessions_status_idx ON public.teller_sessions (status);
CREATE INDEX teller_transactions_session_idx ON public.teller_transactions (session_id, created_at DESC);
CREATE INDEX teller_transactions_teller_idx ON public.teller_transactions (teller_id, created_at DESC);
CREATE INDEX teller_transactions_member_idx ON public.teller_transactions (member_id, created_at DESC);

CREATE TRIGGER teller_sessions_updated_at BEFORE UPDATE ON public.teller_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER teller_transactions_updated_at BEFORE UPDATE ON public.teller_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();