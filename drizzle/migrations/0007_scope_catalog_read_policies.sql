DROP POLICY IF EXISTS "plans readable" ON public.savings_plans;
CREATE POLICY "plans readable" ON public.savings_plans FOR SELECT TO authenticated
  USING (is_active OR private.can_read_all(auth.uid()));

DROP POLICY IF EXISTS "fd_products_read" ON public.fixed_deposit_products;
CREATE POLICY "fd_products_read" ON public.fixed_deposit_products FOR SELECT TO authenticated
  USING (is_active OR private.can_read_all(auth.uid()) OR private.has_role(auth.uid(),'finance_officer'));

DROP POLICY IF EXISTS "cat_read_authenticated" ON public.expense_categories;
CREATE POLICY "cat_read_authenticated" ON public.expense_categories FOR SELECT TO authenticated
  USING (active OR private.can_read_all(auth.uid()) OR private.has_role(auth.uid(),'finance_officer'));

DROP POLICY IF EXISTS "relationship_types_read_authenticated" ON public.relationship_types;
CREATE POLICY "relationship_types_read_authenticated" ON public.relationship_types FOR SELECT TO authenticated
  USING (is_active OR private.can_read_all(auth.uid()));

DROP POLICY IF EXISTS "branding_read_public" ON public.branding_settings;
CREATE POLICY "branding_read_public" ON public.branding_settings FOR SELECT TO anon, authenticated
  USING (id = 1);