-- 1. Expenses: auditors read-only
DROP POLICY IF EXISTS "expenses_staff_all" ON public.expenses;

CREATE POLICY "expenses_staff_read" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE POLICY "expenses_finance_insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::app_role)
  );

CREATE POLICY "expenses_finance_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::app_role)
  );

CREATE POLICY "expenses_finance_delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::app_role)
  );

-- 2. Notifications: no blanket NULL user_id read
DROP POLICY IF EXISTS "notif_read_own" ON public.notifications;

CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 3. Branding bucket: public read limited to logo/ and favicon/ prefixes
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;

CREATE POLICY "branding_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'branding'
    AND (
      (storage.foldername(name))[1] IN ('logo', 'favicon')
    )
  );