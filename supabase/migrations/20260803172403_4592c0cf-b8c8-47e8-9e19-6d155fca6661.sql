ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS touch_icon_path text,
  ADD COLUMN IF NOT EXISTS touch_icon_version integer NOT NULL DEFAULT 1;

GRANT SELECT (touch_icon_path, touch_icon_version) ON public.branding_settings TO anon, authenticated;