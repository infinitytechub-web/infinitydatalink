
ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS email_from_name TEXT,
  ADD COLUMN IF NOT EXISTS email_reply_to  TEXT,
  ADD COLUMN IF NOT EXISTS email_header_html TEXT,
  ADD COLUMN IF NOT EXISTS email_footer_html TEXT;
