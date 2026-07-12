
-- Guard sensitive compliance-controlled columns on public.profiles.
-- Only super_admin / compliance_officer may change kyc*, tier, member_no.
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
  -- Service role / no-jwt paths (definer functions, admin scripts) bypass.
  IF _uid IS NULL THEN
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
  THEN
    RAISE EXCEPTION 'forbidden: compliance-controlled fields cannot be modified by this user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_sensitive_columns ON public.profiles;
CREATE TRIGGER profiles_guard_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_sensitive_columns();

-- SECURITY DEFINER helper: the caller (a member) resets their own KYC to
-- 'pending' after uploading a fresh document. Bypasses the guard trigger by
-- writing as owner; still scoped to auth.uid() so members can only touch
-- their own row.
CREATE OR REPLACE FUNCTION public.reset_own_kyc_pending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
     SET kyc = 'pending'::public.kyc_status,
         kyc_notes = NULL,
         kyc_reviewed_at = NULL,
         kyc_reviewed_by = NULL
   WHERE id = _uid;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_own_kyc_pending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_own_kyc_pending() TO authenticated;
