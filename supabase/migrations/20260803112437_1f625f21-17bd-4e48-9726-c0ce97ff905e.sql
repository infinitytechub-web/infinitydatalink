CREATE TABLE IF NOT EXISTS public.change_sla_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  warn_after_hours integer NOT NULL DEFAULT 12 CHECK (warn_after_hours BETWEEN 1 AND 2000),
  breach_after_hours integer NOT NULL DEFAULT 24 CHECK (breach_after_hours BETWEEN 1 AND 2000),
  repeat_hours integer NOT NULL DEFAULT 24 CHECK (repeat_hours BETWEEN 1 AND 720),
  channels text[] NOT NULL DEFAULT ARRAY['in_app','email']::text[],
  notify_roles text[] NOT NULL DEFAULT ARRAY['super_admin','compliance_officer']::text[],
  escalate_roles text[] NOT NULL DEFAULT ARRAY['super_admin']::text[],
  notify_requester boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_sla_breach_after_warn CHECK (breach_after_hours >= warn_after_hours)
);

GRANT SELECT, INSERT, UPDATE ON public.change_sla_settings TO authenticated;
GRANT ALL ON public.change_sla_settings TO service_role;

ALTER TABLE public.change_sla_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read change sla settings"
  ON public.change_sla_settings FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), 'approvals', 'view'));

CREATE POLICY "staff manage change sla settings"
  ON public.change_sla_settings FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'approvals', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'approvals', 'manage'));

CREATE TRIGGER change_sla_settings_touch
  BEFORE UPDATE ON public.change_sla_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.change_sla_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;