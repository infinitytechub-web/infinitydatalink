ALTER TABLE public.kyc_resubmission_settings
  ADD COLUMN IF NOT EXISTS auto_flag_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_flag_min_severity text NOT NULL DEFAULT 'medium';

ALTER TABLE public.kyc_resubmission_settings
  DROP CONSTRAINT IF EXISTS kyc_resubmission_settings_auto_flag_min_severity_check;
ALTER TABLE public.kyc_resubmission_settings
  ADD CONSTRAINT kyc_resubmission_settings_auto_flag_min_severity_check
  CHECK (auto_flag_min_severity IN ('low', 'medium', 'high'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_risk_flags jsonb,
  ADD COLUMN IF NOT EXISTS kyc_risk_level text,
  ADD COLUMN IF NOT EXISTS kyc_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_flag_reason text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_kyc_risk_level_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_kyc_risk_level_check
  CHECK (kyc_risk_level IS NULL OR kyc_risk_level IN ('none', 'low', 'medium', 'high'));

COMMENT ON COLUMN public.profiles.kyc_risk_flags IS
  'Risk patterns detected on the members latest KYC resubmission diff (compliance evidence, not member-editable).';