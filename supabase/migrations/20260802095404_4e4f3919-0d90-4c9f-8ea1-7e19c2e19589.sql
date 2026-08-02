CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_staff boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.kyc_self_service', true) = 'on' THEN
    RETURN NEW;
  END IF;

  _is_staff := public.has_role(_uid, 'super_admin'::public.app_role)
            OR public.has_role(_uid, 'compliance_officer'::public.app_role);

  IF _is_staff THEN
    RETURN NEW;
  END IF;

  IF NEW.kyc IS DISTINCT FROM OLD.kyc
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.member_no IS DISTINCT FROM OLD.member_no
     OR NEW.kyc_notes IS DISTINCT FROM OLD.kyc_notes
     OR NEW.kyc_reviewed_at IS DISTINCT FROM OLD.kyc_reviewed_at
     OR NEW.kyc_reviewed_by IS DISTINCT FROM OLD.kyc_reviewed_by
     OR NEW.kyc_assigned_to IS DISTINCT FROM OLD.kyc_assigned_to
     OR NEW.kyc_assigned_at IS DISTINCT FROM OLD.kyc_assigned_at
     OR NEW.kyc_remediation_items IS DISTINCT FROM OLD.kyc_remediation_items
     OR NEW.kyc_resubmitted_at IS DISTINCT FROM OLD.kyc_resubmitted_at
     OR NEW.kyc_risk_flags IS DISTINCT FROM OLD.kyc_risk_flags
     OR NEW.kyc_risk_level IS DISTINCT FROM OLD.kyc_risk_level
     OR NEW.kyc_flagged_at IS DISTINCT FROM OLD.kyc_flagged_at
     OR NEW.kyc_flag_reason IS DISTINCT FROM OLD.kyc_flag_reason
  THEN
    RAISE EXCEPTION 'forbidden: compliance-controlled fields cannot be modified by this user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_guard_sensitive_columns() FROM PUBLIC, anon, authenticated;