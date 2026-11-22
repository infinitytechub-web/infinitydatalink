CREATE OR REPLACE FUNCTION public.loans_require_verified_kyc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_kyc public.kyc_status;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('rejected','closed') THEN RETURN NEW; END IF;
  SELECT kyc INTO v_kyc FROM public.profiles WHERE id = NEW.user_id;
  IF v_kyc IS DISTINCT FROM 'active'::public.kyc_status THEN
    RAISE EXCEPTION 'Identity check not approved: the member must complete KYC and be approved by an officer before this loan can proceed'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.loans_require_verified_kyc() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS loans_require_verified_kyc_trg ON public.loans;
CREATE TRIGGER loans_require_verified_kyc_trg
BEFORE INSERT OR UPDATE OF status ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.loans_require_verified_kyc();