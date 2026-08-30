DROP POLICY IF EXISTS branding_public_read ON storage.objects;

CREATE POLICY branding_public_read ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = ANY (ARRAY['logo', 'favicon'])
  AND array_length(storage.foldername(name), 1) = 1
);

DROP POLICY IF EXISTS "Members delete own pending files" ON public.member_files;
DROP POLICY IF EXISTS "Staff delete member files" ON public.member_files;

CREATE POLICY "Members delete own pending files" ON public.member_files
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  AND review_status = 'pending'
  AND reviewed_by IS NULL
);

CREATE POLICY "Staff delete member files" ON public.member_files
FOR DELETE
TO authenticated
USING (public.has_permission_for('files', 'delete'));