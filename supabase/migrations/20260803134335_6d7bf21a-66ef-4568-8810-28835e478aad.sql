-- Tighten branding_settings: organisational PII + outbound email branding are
-- readable only by privileged server code, never through the Data API.
REVOKE SELECT (org_legal_name, org_address, org_registration_no,
               email_from_name, email_reply_to, email_header_html, email_footer_html,
               updated_by)
  ON public.branding_settings FROM authenticated;

-- Ensure the public presentation projection remains available.
GRANT SELECT (id, app_name, tagline, primary_color, accent_color, secondary_color,
              logo_path, favicon_path, login_hero_url, login_tagline, footer_html,
              support_email, support_phone, updated_at)
  ON public.branding_settings TO anon, authenticated;

-- Replace the unrestricted read policy with explicit, documented ones so the
-- intent is clear alongside the column grants above.
DROP POLICY IF EXISTS branding_read_all ON public.branding_settings;
CREATE POLICY branding_read_public ON public.branding_settings
  FOR SELECT TO anon, authenticated USING (true);

GRANT ALL ON public.branding_settings TO service_role;