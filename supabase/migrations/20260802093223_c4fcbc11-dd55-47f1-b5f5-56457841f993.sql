ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_rejection_snapshot jsonb;

COMMENT ON COLUMN public.profiles.kyc_rejection_snapshot IS
  'Profile fields and KYC document references captured when a reviewer rejected the submission, used to diff against the resubmitted values.';