CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
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

  _is_staff := private.has_role(_uid, 'super_admin'::public.app_role)
            OR private.has_role(_uid, 'compliance_officer'::public.app_role);

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
$function$;

CREATE OR REPLACE FUNCTION public.guard_profile_kyc_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  is_staff boolean := false;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.kyc_self_service', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_staff := private.has_role(auth.uid(), 'super_admin'::public.app_role)
             OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role);
  EXCEPTION WHEN others THEN
    is_staff := false;
  END;

  IF is_staff THEN
    RETURN NEW;
  END IF;

  NEW.kyc             := OLD.kyc;
  NEW.tier            := OLD.tier;
  NEW.kyc_notes       := OLD.kyc_notes;
  NEW.kyc_reviewed_by := OLD.kyc_reviewed_by;
  NEW.kyc_reviewed_at := OLD.kyc_reviewed_at;
  NEW.kyc_assigned_to := OLD.kyc_assigned_to;
  NEW.kyc_assigned_at := OLD.kyc_assigned_at;
  NEW.kyc_remediation_items := OLD.kyc_remediation_items;
  NEW.kyc_resubmitted_at    := OLD.kyc_resubmitted_at;

  RETURN NEW;
END;
$function$;