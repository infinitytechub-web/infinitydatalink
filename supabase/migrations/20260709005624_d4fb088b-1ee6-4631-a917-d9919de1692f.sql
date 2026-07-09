ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kyc_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_kyc_assigned_to_idx ON public.profiles(kyc_assigned_to);

DO $$ BEGIN
  CREATE TYPE public.kyc_notification_channel AS ENUM ('email', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.kyc_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel public.kyc_notification_channel NOT NULL DEFAULT 'email',
  decision text NOT NULL,
  recipient text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'queued',
  message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kyc_notifications_member_idx
  ON public.kyc_notifications(member_id, created_at DESC);

GRANT SELECT ON public.kyc_notifications TO authenticated;
GRANT ALL ON public.kyc_notifications TO service_role;

ALTER TABLE public.kyc_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own KYC notifications"
  ON public.kyc_notifications FOR SELECT TO authenticated
  USING (member_id = auth.uid());

CREATE POLICY "Admins read all KYC notifications"
  ON public.kyc_notifications FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );

CREATE POLICY "Admins insert KYC notifications"
  ON public.kyc_notifications FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );

CREATE POLICY "Admins update KYC notifications"
  ON public.kyc_notifications FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );

CREATE TRIGGER kyc_notifications_updated_at
  BEFORE UPDATE ON public.kyc_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
