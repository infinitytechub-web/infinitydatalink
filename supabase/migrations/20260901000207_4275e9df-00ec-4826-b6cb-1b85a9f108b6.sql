-- Guard: staff review updates may only touch review columns.
CREATE OR REPLACE FUNCTION public.member_files_guard_review_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.filename IS DISTINCT FROM OLD.filename
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.checksum IS DISTINCT FROM OLD.checksum
  THEN
    IF OLD.owner_id <> auth.uid() THEN
      RAISE EXCEPTION 'Reviewers may only update review fields on member documents';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_files_guard_review_update ON public.member_files;
CREATE TRIGGER member_files_guard_review_update
  BEFORE UPDATE ON public.member_files
  FOR EACH ROW EXECUTE FUNCTION public.member_files_guard_review_update();

DROP POLICY IF EXISTS "Staff review shared files" ON public.member_files;
CREATE POLICY "Staff review shared files" ON public.member_files
  FOR UPDATE TO authenticated
  USING (
    public.has_permission_for('files', 'review')
    AND shared_with_staff
    AND deleted_at IS NULL
  )
  WITH CHECK (
    public.has_permission_for('files', 'review')
    AND shared_with_staff
  );