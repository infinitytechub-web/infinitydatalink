-- 1. Branding: column-level restriction for anonymous readers ------------------
REVOKE SELECT ON public.branding_settings FROM anon;
GRANT SELECT (
  id,
  app_name,
  tagline,
  primary_color,
  accent_color,
  secondary_color,
  logo_path,
  favicon_path,
  login_hero_url,
  login_tagline,
  org_legal_name,
  footer_html,
  support_email,
  support_phone,
  updated_at
) ON public.branding_settings TO anon;

GRANT SELECT ON public.branding_settings TO authenticated;
GRANT ALL ON public.branding_settings TO service_role;

-- 2. FX rates: signed-in readers only -----------------------------------------
DROP POLICY IF EXISTS fx_read_all ON public.fx_rates;
CREATE POLICY fx_read_authenticated
  ON public.fx_rates
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.fx_rates FROM anon;
GRANT SELECT ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;