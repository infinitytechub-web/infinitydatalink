CREATE TABLE IF NOT EXISTS public.security_alert_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  channels text[] NOT NULL DEFAULT ARRAY['in_app','email']::text[],
  notify_roles text[] NOT NULL DEFAULT ARRAY['super_admin','compliance_officer']::text[],
  audit_alerts_enabled boolean NOT NULL DEFAULT true,
  audit_min_severity text NOT NULL DEFAULT 'critical'
    CHECK (audit_min_severity IN ('info','warning','critical')),
  audit_action_prefixes text[] NOT NULL DEFAULT ARRAY[]::text[],
  upload_alerts_enabled boolean NOT NULL DEFAULT true,
  rate_limit_alerts_enabled boolean NOT NULL DEFAULT true,
  throttle_minutes integer NOT NULL DEFAULT 15 CHECK (throttle_minutes BETWEEN 0 AND 1440),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.security_alert_settings TO authenticated;
GRANT ALL ON public.security_alert_settings TO service_role;

ALTER TABLE public.security_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read security alert settings"
  ON public.security_alert_settings FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), 'security', 'view'));

CREATE POLICY "staff manage security alert settings"
  ON public.security_alert_settings FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'security', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'security', 'manage'));

CREATE TRIGGER security_alert_settings_touch
  BEFORE UPDATE ON public.security_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.security_alert_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;