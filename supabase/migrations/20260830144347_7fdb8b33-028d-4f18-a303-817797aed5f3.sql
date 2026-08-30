-- 1) branding_settings: authenticated may read only presentation + support contact columns
REVOKE SELECT ON public.branding_settings FROM authenticated;
GRANT SELECT (
  id, app_name, tagline, logo_path, favicon_path, primary_color, accent_color,
  secondary_color, login_hero_url, login_tagline, logo_version, favicon_version,
  touch_icon_path, touch_icon_version, updated_at,
  footer_html, support_email, support_phone
) ON public.branding_settings TO authenticated;
GRANT ALL ON public.branding_settings TO service_role;

-- 2) entities: no anon access at all; authenticated cannot read contact/tax/kyc columns
REVOKE ALL ON public.entities FROM anon;
REVOKE SELECT ON public.entities FROM authenticated;
GRANT SELECT (
  id, type, name, registration_no, parent_entity_id, region, address_line,
  digital_address, status, created_by, reviewed_by, reviewed_at, created_at, updated_at
) ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;

-- 3) loan_guarantors: no anon access; authenticated cannot read guarantor phone/email
REVOKE ALL ON public.loan_guarantors FROM anon;
REVOKE SELECT ON public.loan_guarantors FROM authenticated;
GRANT SELECT (
  id, loan_id, member_id, full_name, relationship, guaranteed_amount,
  consent, consent_at, consent_note, created_by, created_at, updated_at
) ON public.loan_guarantors TO authenticated;
GRANT ALL ON public.loan_guarantors TO service_role;