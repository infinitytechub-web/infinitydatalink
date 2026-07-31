CREATE TABLE public.fx_rate_history (
  base text NOT NULL,
  quote text NOT NULL,
  rate_date date NOT NULL,
  rate numeric NOT NULL,
  source text NOT NULL DEFAULT 'provider',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base, quote, rate_date)
);

CREATE INDEX fx_rate_history_pair_date_idx
  ON public.fx_rate_history (base, quote, rate_date DESC);

GRANT SELECT ON public.fx_rate_history TO authenticated;
GRANT ALL ON public.fx_rate_history TO service_role;

ALTER TABLE public.fx_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY fx_rate_history_staff_read
  ON public.fx_rate_history
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::app_role)
  );