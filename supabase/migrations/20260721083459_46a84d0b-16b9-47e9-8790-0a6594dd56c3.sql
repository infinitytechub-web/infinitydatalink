
CREATE TABLE IF NOT EXISTS public.branding_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  app_name text NOT NULL DEFAULT 'IT-360 CashApp',
  tagline text,
  logo_path text,
  favicon_path text,
  primary_color text NOT NULL DEFAULT '#0d9488',
  accent_color text NOT NULL DEFAULT '#f5c451',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT branding_singleton CHECK (id = 1)
);

GRANT SELECT ON public.branding_settings TO anon, authenticated;
GRANT ALL ON public.branding_settings TO service_role;

ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branding_read_all" ON public.branding_settings;
CREATE POLICY "branding_read_all" ON public.branding_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "branding_super_admin_update" ON public.branding_settings;
CREATE POLICY "branding_super_admin_update" ON public.branding_settings
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.branding_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding_super_admin_write" ON storage.objects;
CREATE POLICY "branding_super_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "branding_super_admin_update_obj" ON storage.objects;
CREATE POLICY "branding_super_admin_update_obj" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (bucket_id = 'branding' AND private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "branding_super_admin_delete" ON storage.objects;
CREATE POLICY "branding_super_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND private.has_role(auth.uid(), 'super_admin'::public.app_role));
