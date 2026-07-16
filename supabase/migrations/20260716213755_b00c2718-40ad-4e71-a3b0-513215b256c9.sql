-- Storage policies for entity-documents bucket. Staff full access; entity managers manage their own path.
CREATE POLICY "entity_docs_staff_all"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'entity-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','compliance_officer','auditor')
  )
)
WITH CHECK (
  bucket_id = 'entity-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','compliance_officer','auditor')
  )
);

CREATE POLICY "entity_docs_owner_manage"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'entity-documents'
  AND EXISTS (
    SELECT 1 FROM public.entity_memberships em
    WHERE em.profile_id = auth.uid()
      AND em.role IN ('owner','admin')
      AND em.entity_id::text = split_part(storage.objects.name, '/', 1)
  )
)
WITH CHECK (
  bucket_id = 'entity-documents'
  AND EXISTS (
    SELECT 1 FROM public.entity_memberships em
    WHERE em.profile_id = auth.uid()
      AND em.role IN ('owner','admin')
      AND em.entity_id::text = split_part(storage.objects.name, '/', 1)
  )
);