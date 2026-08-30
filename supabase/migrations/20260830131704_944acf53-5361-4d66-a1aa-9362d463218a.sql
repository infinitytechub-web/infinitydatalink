CREATE TABLE public.member_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  category text NOT NULL DEFAULT 'general',
  filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum text,
  shared_with_staff boolean NOT NULL DEFAULT true,
  review_status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.member_files TO authenticated;
GRANT ALL ON public.member_files TO service_role;
ALTER TABLE public.member_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own files" ON public.member_files
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Staff read shared files" ON public.member_files
  FOR SELECT TO authenticated
  USING (public.has_permission_for('files', 'view') AND shared_with_staff);

CREATE POLICY "Members upload own files" ON public.member_files
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND uploaded_by = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "Members update own files" ON public.member_files
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND review_status = 'pending' AND reviewed_by IS NULL);

CREATE INDEX member_files_owner_idx ON public.member_files (owner_id, created_at DESC);
CREATE INDEX member_files_review_idx ON public.member_files (review_status, created_at DESC);
CREATE INDEX member_files_category_idx ON public.member_files (category);

CREATE TRIGGER member_files_updated_at BEFORE UPDATE ON public.member_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage: members own the first path segment of their objects.
CREATE POLICY "Members read own file objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'member-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Members write own file objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Members delete own file objects" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'member-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff read member file objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'member-files' AND public.has_permission_for('files', 'view'));