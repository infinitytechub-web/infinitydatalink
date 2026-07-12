CREATE OR REPLACE FUNCTION public.guard_profile_kyc_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_staff boolean := false;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_staff := public.has_role(auth.uid(), 'admin'::public.app_role)
             OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
             OR public.has_role(auth.uid(), 'kyc_officer'::public.app_role);
  EXCEPTION WHEN others THEN
    is_staff := false;
  END;

  IF is_staff THEN
    RETURN NEW;
  END IF;

  NEW.kyc             := OLD.kyc;
  NEW.tier            := OLD.tier;
  NEW.kyc_reviewed_by := OLD.kyc_reviewed_by;
  NEW.kyc_reviewed_at := OLD.kyc_reviewed_at;
  NEW.kyc_assigned_to := OLD.kyc_assigned_to;
  NEW.kyc_assigned_at := OLD.kyc_assigned_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_kyc_self_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_profiles_guard_kyc_self_update ON public.profiles;
CREATE TRIGGER trg_profiles_guard_kyc_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_kyc_self_update();

COMMENT ON FUNCTION public.guard_profile_kyc_self_update() IS
  'Blocks members from setting kyc, tier, and kyc_reviewed/assigned columns on their own profile row. Staff roles and service_role are exempt.';