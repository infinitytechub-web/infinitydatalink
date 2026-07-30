-- 1. Dividend runs: restrict read access
DROP POLICY IF EXISTS "dividend_runs_read_all_auth" ON public.dividend_runs;

CREATE POLICY "dividend_runs_read_staff_or_own_payout"
ON public.dividend_runs
FOR SELECT
TO authenticated
USING (
  private.can_read_all(auth.uid())
  OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
  OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.share_transactions st
    WHERE st.dividend_run_id = public.dividend_runs.id
      AND st.user_id = auth.uid()
  )
);

-- 2. Profiles: block members from changing privileged columns on their own row
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_staff boolean := false;
BEGIN
  -- Server-side / service-role and trigger-less contexts are unrestricted.
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  IF (auth.jwt() ->> 'role') = 'service_role' THEN
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

  -- Member editing their own row: privileged columns are frozen.
  NEW.status            := OLD.status;
  NEW.tier              := OLD.tier;
  NEW.kyc               := OLD.kyc;
  NEW.member_no         := OLD.member_no;
  NEW.approved_by       := OLD.approved_by;
  NEW.approved_at       := OLD.approved_at;
  NEW.rejection_reason  := OLD.rejection_reason;
  NEW.kyc_notes         := OLD.kyc_notes;
  NEW.kyc_reviewed_by   := OLD.kyc_reviewed_by;
  NEW.kyc_reviewed_at   := OLD.kyc_reviewed_at;
  NEW.kyc_assigned_to   := OLD.kyc_assigned_to;
  NEW.kyc_assigned_at   := OLD.kyc_assigned_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_guard_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns_trg ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_columns_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_guard_privileged_columns();