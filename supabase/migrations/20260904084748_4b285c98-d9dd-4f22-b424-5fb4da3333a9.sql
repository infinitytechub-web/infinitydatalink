-- 1) fx_rates: staff-only direct read (app reads via trusted server client)
DROP POLICY IF EXISTS fx_read_authenticated ON public.fx_rates;
CREATE POLICY fx_rates_staff_read ON public.fx_rates
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );

-- 2) Harden the shared permission trust boundary: no mutable search_path,
--    fully-qualified object references, and no anon execution.
CREATE OR REPLACE FUNCTION private.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role::text
      WHERE ur.user_id = _user_id
        AND rp.module = _module
        AND rp.action = _action
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = 'super_admin'::public.app_role
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission_for(_module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND private.has_permission(auth.uid(), _module, _action);
$$;

REVOKE ALL ON FUNCTION private.has_permission(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission_for(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission_for(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text, text) TO service_role;

-- 3) member-files bucket: explicit UPDATE governance
DROP POLICY IF EXISTS "Members update own file objects" ON storage.objects;
CREATE POLICY "Members update own file objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'member-files'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'member-files'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Staff update member file objects" ON storage.objects;
CREATE POLICY "Staff update member file objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'member-files' AND public.has_permission_for('files', 'review'))
  WITH CHECK (bucket_id = 'member-files' AND public.has_permission_for('files', 'review'));