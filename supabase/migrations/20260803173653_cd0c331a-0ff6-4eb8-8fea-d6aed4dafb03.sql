-- Organisation contact + legal footer become authenticated-only at the column level.
REVOKE SELECT (footer_html, support_email, support_phone) ON public.branding_settings FROM anon;

-- Keep them readable for signed-in users (RBAC beyond that is enforced in code).
GRANT SELECT (footer_html, support_email, support_phone) ON public.branding_settings TO authenticated;

-- Sensitive org / email branding columns stay staff-only via the privileged client.
REVOKE SELECT (org_legal_name, org_address, org_registration_no, email_from_name, email_reply_to, email_header_html, email_footer_html) ON public.branding_settings FROM anon, authenticated;

GRANT ALL ON public.branding_settings TO service_role;