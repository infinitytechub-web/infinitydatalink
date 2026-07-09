-- Profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS digital_address text,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS employer text,
  ADD COLUMN IF NOT EXISTS kyc_notes text,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamptz;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.kyc_doc_type AS ENUM ('national_id_front','national_id_back','selfie','proof_of_address','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kyc_doc_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- next_of_kin
CREATE TABLE IF NOT EXISTS public.next_of_kin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL,
  phone text,
  email text,
  national_id text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS next_of_kin_member_idx ON public.next_of_kin(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.next_of_kin TO authenticated;
GRANT ALL ON public.next_of_kin TO service_role;
ALTER TABLE public.next_of_kin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage own next_of_kin" ON public.next_of_kin
  FOR ALL TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "admins read all next_of_kin" ON public.next_of_kin
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer'));

CREATE TRIGGER trg_next_of_kin_updated
  BEFORE UPDATE ON public.next_of_kin
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- kyc_documents
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type public.kyc_doc_type NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20 * 1024 * 1024),
  status public.kyc_doc_status NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_documents_member_idx ON public.kyc_documents(member_id);
CREATE INDEX IF NOT EXISTS kyc_documents_status_idx ON public.kyc_documents(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_documents TO authenticated;
GRANT ALL ON public.kyc_documents TO service_role;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- Members can see own docs (any status), insert own docs, delete only while pending
CREATE POLICY "members read own kyc docs" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (member_id = auth.uid());

CREATE POLICY "members insert own kyc docs" ON public.kyc_documents
  FOR INSERT TO authenticated
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "members delete own pending kyc docs" ON public.kyc_documents
  FOR DELETE TO authenticated
  USING (member_id = auth.uid() AND status = 'pending');

-- Admins (compliance / super_admin) read everything and update review fields
CREATE POLICY "admins read all kyc docs" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer'));

CREATE POLICY "admins review kyc docs" ON public.kyc_documents
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer'));

CREATE TRIGGER trg_kyc_documents_updated
  BEFORE UPDATE ON public.kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS for the private `kyc-documents` bucket.
-- Objects are stored under a first-segment prefix equal to the owning user's UUID.
CREATE POLICY "members upload own kyc objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "members read own kyc objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "members delete own kyc objects" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "admins read all kyc objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer'))
  );
