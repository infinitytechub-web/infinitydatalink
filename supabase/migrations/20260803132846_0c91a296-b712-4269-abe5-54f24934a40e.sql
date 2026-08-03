CREATE TABLE public.kyc_restore_acknowledgments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL,
  vault_id uuid,
  restored_kyc text,
  restored_by_email text,
  restored_by_role text,
  documents_restored integer NOT NULL DEFAULT 0,
  document_types text[] NOT NULL DEFAULT '{}',
  reason text,
  restored_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kyc_restore_ack_member ON public.kyc_restore_acknowledgments (member_id, acknowledged_at);

GRANT SELECT, UPDATE ON public.kyc_restore_acknowledgments TO authenticated;
GRANT ALL ON public.kyc_restore_acknowledgments TO service_role;

ALTER TABLE public.kyc_restore_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own restore acknowledgments"
ON public.kyc_restore_acknowledgments FOR SELECT TO authenticated
USING (member_id = auth.uid());

CREATE POLICY "Staff read restore acknowledgments"
ON public.kyc_restore_acknowledgments FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'compliance_officer'::app_role)
  OR private.has_role(auth.uid(), 'auditor'::app_role)
);

CREATE OR REPLACE FUNCTION public.kyc_restore_ack_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.member_id THEN
    RETURN NEW;
  END IF;
  IF OLD.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Acknowledgment already recorded';
  END IF;
  NEW.id := OLD.id;
  NEW.member_id := OLD.member_id;
  NEW.vault_id := OLD.vault_id;
  NEW.restored_kyc := OLD.restored_kyc;
  NEW.restored_by_email := OLD.restored_by_email;
  NEW.restored_by_role := OLD.restored_by_role;
  NEW.documents_restored := OLD.documents_restored;
  NEW.document_types := OLD.document_types;
  NEW.reason := OLD.reason;
  NEW.restored_at := OLD.restored_at;
  NEW.created_at := OLD.created_at;
  NEW.acknowledged_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kyc_restore_ack_guard_trg
BEFORE UPDATE ON public.kyc_restore_acknowledgments
FOR EACH ROW EXECUTE FUNCTION public.kyc_restore_ack_guard();

CREATE POLICY "Members acknowledge own restore"
ON public.kyc_restore_acknowledgments FOR UPDATE TO authenticated
USING (member_id = auth.uid())
WITH CHECK (member_id = auth.uid());