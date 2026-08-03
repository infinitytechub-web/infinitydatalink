ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS logo_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS favicon_version integer NOT NULL DEFAULT 1;

GRANT SELECT (logo_version, favicon_version) ON public.branding_settings TO anon, authenticated;