DROP POLICY IF EXISTS kyc_resub_settings_read ON public.kyc_resubmission_settings;
CREATE POLICY kyc_resub_settings_read ON public.kyc_resubmission_settings FOR SELECT TO authenticated
  USING (private.can_read_all(auth.uid()) OR private.has_role(auth.uid(), 'compliance_officer'::app_role));
DROP POLICY IF EXISTS interest_settings_read ON public.savings_interest_settings;
CREATE POLICY interest_settings_read ON public.savings_interest_settings FOR SELECT TO authenticated
  USING (private.can_read_all(auth.uid()) OR private.has_role(auth.uid(), 'finance_officer'::app_role));
DROP POLICY IF EXISTS wsettings_read ON public.savings_withdrawal_settings;
CREATE POLICY wsettings_read ON public.savings_withdrawal_settings FOR SELECT TO authenticated
  USING (private.can_read_all(auth.uid()) OR private.has_role(auth.uid(), 'finance_officer'::app_role));