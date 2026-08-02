-- 1. New roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- 2. Permission matrix (role stored as text so it can be edited without enum churn)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role text NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module, action)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read permission matrix"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE TRIGGER role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON public.role_permissions (role);

-- 3. Permission check helper (security definer, private schema)
CREATE OR REPLACE FUNCTION private.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role::text
    WHERE ur.user_id = _user_id
      AND rp.module = _module
      AND rp.action = _action
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'super_admin'::public.app_role
  );
$$;

REVOKE ALL ON FUNCTION private.has_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text, text) TO authenticated, service_role;

-- 4. Effective permissions for the signed-in user
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE (module text, action text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT DISTINCT rp.module, rp.action
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role = ur.role::text
  WHERE ur.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;

-- 5. Seed the default matrix
INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, m.module, a.action
FROM (VALUES ('super_admin')) r(role)
CROSS JOIN (VALUES ('kyc'),('members'),('entities'),('savings'),('loans'),('payments'),('approvals'),('reports'),('security'),('settings'),('documents'),('users'),('notifications')) m(module)
CROSS JOIN (VALUES ('view'),('create'),('edit'),('delete'),('approve'),('reject'),('export'),('print'),('download'),('manage')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, m.module, a.action
FROM (VALUES ('admin')) r(role)
CROSS JOIN (VALUES ('kyc'),('members'),('entities'),('savings'),('loans'),('payments'),('approvals'),('reports'),('documents'),('users'),('notifications'),('security')) m(module)
CROSS JOIN (VALUES ('view'),('create'),('edit'),('approve'),('reject'),('export'),('print'),('download')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, m.module, a.action
FROM (VALUES ('manager')) r(role)
CROSS JOIN (VALUES ('kyc'),('members'),('entities'),('savings'),('loans'),('payments'),('approvals'),('reports'),('documents'),('notifications')) m(module)
CROSS JOIN (VALUES ('view'),('edit'),('approve'),('reject'),('export'),('print'),('download')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, m.module, a.action
FROM (VALUES ('compliance_officer')) r(role)
CROSS JOIN (VALUES ('kyc'),('members'),('entities'),('documents'),('notifications'),('reports')) m(module)
CROSS JOIN (VALUES ('view'),('edit'),('approve'),('reject'),('export'),('print'),('download')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, m.module, a.action
FROM (VALUES ('loan_officer')) r(role)
CROSS JOIN (VALUES ('loans'),('members'),('reports')) m(module)
CROSS JOIN (VALUES ('view'),('create'),('edit'),('approve'),('reject'),('export'),('print'),('download')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, m.module, a.action
FROM (VALUES ('finance_officer')) r(role)
CROSS JOIN (VALUES ('savings'),('payments'),('loans'),('reports')) m(module)
CROSS JOIN (VALUES ('view'),('create'),('edit'),('approve'),('reject'),('export'),('print'),('download')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, m.module, a.action
FROM (VALUES ('auditor')) r(role)
CROSS JOIN (VALUES ('kyc'),('members'),('entities'),('savings'),('loans'),('payments'),('approvals'),('reports'),('security'),('documents')) m(module)
CROSS JOIN (VALUES ('view'),('export'),('print'),('download')) a(action)
ON CONFLICT DO NOTHING;
