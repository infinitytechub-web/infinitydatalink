-- 1. Public permission-check RPC used by server functions and the UI.
CREATE OR REPLACE FUNCTION public.has_permission_for(_module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT auth.uid() IS NOT NULL
     AND private.has_permission(auth.uid(), _module, _action);
$$;
REVOKE ALL ON FUNCTION public.has_permission_for(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission_for(text, text) TO authenticated, service_role;

-- 2. Change-approval kinds for the new governed areas.
ALTER TYPE public.settings_change_kind ADD VALUE IF NOT EXISTS 'permission_matrix';
ALTER TYPE public.settings_change_kind ADD VALUE IF NOT EXISTS 'payment_config';

-- 3. Applier for permission-matrix changes (replaces the whole matrix for a role).
CREATE OR REPLACE FUNCTION private.apply_permission_matrix(_payload jsonb, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _role text := _payload->>'role';
BEGIN
  IF _role IS NULL THEN RAISE EXCEPTION 'role_required'; END IF;
  IF _role = 'super_admin' THEN RAISE EXCEPTION 'super_admin_matrix_immutable'; END IF;

  DELETE FROM public.role_permissions WHERE role = _role;
  INSERT INTO public.role_permissions(role, module, action)
  SELECT _role, split_part(cap, '.', 1), split_part(cap, '.', 2)
  FROM jsonb_array_elements_text(coalesce(_payload->'capabilities', '[]'::jsonb)) AS cap
  ON CONFLICT DO NOTHING;
END; $$;

-- 4. Payment gateway architecture.
CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  mode text NOT NULL DEFAULT 'sandbox',
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  webhook_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_providers TO authenticated;
GRANT ALL ON public.payment_providers TO service_role;
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment providers viewable with payments view" ON public.payment_providers
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'payments', 'view'));
CREATE POLICY "payment providers managed with payments manage" ON public.payment_providers
  FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'payments', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'payments', 'manage'));

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  provider_code text NOT NULL,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  purpose text NOT NULL DEFAULT 'contribution',
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'pending',
  provider_reference text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_intents_member_idx ON public.payment_intents(member_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_intents TO authenticated;
GRANT ALL ON public.payment_intents TO service_role;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own payments" ON public.payment_intents
  FOR SELECT TO authenticated USING (member_id = auth.uid());
CREATE POLICY "staff read payments" ON public.payment_intents
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'payments', 'view'));
CREATE POLICY "staff manage payments" ON public.payment_intents
  FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'payments', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'payments', 'manage'));

CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  receipt_no text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own receipts" ON public.payment_receipts
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.payment_intents pi WHERE pi.id = intent_id AND pi.member_id = auth.uid()
  ));
CREATE POLICY "staff read receipts" ON public.payment_receipts
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'payments', 'view'));
CREATE POLICY "staff manage receipts" ON public.payment_receipts
  FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'payments', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'payments', 'manage'));

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  event_id text,
  event_type text,
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_dedupe
  ON public.payment_webhook_events(provider_code, event_id) WHERE event_id IS NOT NULL;
GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read webhook events" ON public.payment_webhook_events
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'payments', 'view'));

-- 5. Security centre.
CREATE TABLE IF NOT EXISTS public.security_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  firewall_enabled boolean NOT NULL DEFAULT false,
  ip_allowlist_only boolean NOT NULL DEFAULT false,
  rate_limiting_enabled boolean NOT NULL DEFAULT true,
  upload_scanning_enabled boolean NOT NULL DEFAULT true,
  max_upload_mb integer NOT NULL DEFAULT 10,
  allowed_upload_mime text[] NOT NULL DEFAULT ARRAY['image/png','image/jpeg','image/webp','application/pdf'],
  block_executables boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read security settings" ON public.security_settings
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'security', 'view'));
CREATE POLICY "staff manage security settings" ON public.security_settings
  FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'security', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'security', 'manage'));
INSERT INTO public.security_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.security_ip_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr text NOT NULL,
  mode text NOT NULL DEFAULT 'deny',
  note text,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_ip_rules TO authenticated;
GRANT ALL ON public.security_ip_rules TO service_role;
ALTER TABLE public.security_ip_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read ip rules" ON public.security_ip_rules
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'security', 'view'));
CREATE POLICY "staff manage ip rules" ON public.security_ip_rules
  FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'security', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'security', 'manage'));

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL UNIQUE,
  window_seconds integer NOT NULL DEFAULT 60 CHECK (window_seconds > 0),
  max_requests integer NOT NULL DEFAULT 60 CHECK (max_requests > 0),
  enabled boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_rate_limits TO authenticated;
GRANT ALL ON public.security_rate_limits TO service_role;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read rate limits" ON public.security_rate_limits
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'security', 'view'));
CREATE POLICY "staff manage rate limits" ON public.security_rate_limits
  FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'security', 'manage'))
  WITH CHECK (private.has_permission(auth.uid(), 'security', 'manage'));
INSERT INTO public.security_rate_limits(scope, window_seconds, max_requests, note) VALUES
  ('auth.login', 300, 10, 'Sign-in attempts per IP'),
  ('api.default', 60, 120, 'General API calls per session'),
  ('upload.documents', 3600, 40, 'Document uploads per member')
ON CONFLICT (scope) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.upload_scan_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  verdict text NOT NULL DEFAULT 'clean',
  reasons text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.upload_scan_log TO authenticated;
GRANT ALL ON public.upload_scan_log TO service_role;
ALTER TABLE public.upload_scan_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read upload scans" ON public.upload_scan_log
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'security', 'view'));
CREATE POLICY "own upload scans readable" ON public.upload_scan_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own upload scans insertable" ON public.upload_scan_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  device text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_sessions_live_idx ON public.admin_sessions(last_seen_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.admin_sessions TO authenticated;
GRANT ALL ON public.admin_sessions TO service_role;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions readable" ON public.admin_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own sessions writable" ON public.admin_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own sessions updatable" ON public.admin_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "security staff read sessions" ON public.admin_sessions
  FOR SELECT TO authenticated USING (private.has_permission(auth.uid(), 'security', 'view'));

-- 6. updated_at triggers.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_providers','payment_intents','payment_receipts',
                           'security_settings','security_ip_rules','security_rate_limits'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I; '
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;