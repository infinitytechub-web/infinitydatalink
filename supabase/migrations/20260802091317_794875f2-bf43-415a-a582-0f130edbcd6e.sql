-- 1. Remediation tracking columns -------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_remediation_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kyc_resubmitted_at timestamptz;

COMMENT ON COLUMN public.profiles.kyc_remediation_items IS
  'Reviewer-requested KYC fixes: array of keys like "profile:phone" or "document:selfie". Set by staff on rejection, cleared on resubmission.';

-- 2. Guards: pin the new columns for members, but allow the definer routines
--    to write them via a transaction-local flag.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

  -- Trusted SECURITY DEFINER routines (reset_own_kyc_pending, resubmit_own_kyc)
  -- set this transaction-local flag after validating the caller owns the row.
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
  NEW.membership_type   := OLD.membership_type;
  NEW.kyc_remediation_items := OLD.kyc_remediation_items;
  NEW.kyc_resubmitted_at    := OLD.kyc_resubmitted_at;
  -- Ghana Card is registration biodata: immutable once captured.
  IF OLD.ghana_card IS NOT NULL THEN
    NEW.ghana_card := OLD.ghana_card;
  END IF;

  RETURN NEW;
END;
$function$;

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
  THEN
    RAISE EXCEPTION 'forbidden: compliance-controlled fields cannot be modified by this user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_kyc_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF current_setting('app.kyc_self_service', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_staff := public.has_role(auth.uid(), 'super_admin'::public.app_role)
             OR public.has_role(auth.uid(), 'compliance_officer'::public.app_role);
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
$$;

REVOKE ALL ON FUNCTION public.guard_profile_kyc_self_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_guard_sensitive_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_guard_privileged_columns() FROM PUBLIC, anon, authenticated;

-- 3. Existing self-service reset: flag the write so all guards allow it.
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

  PERFORM set_config('app.kyc_self_service', 'on', true);

  UPDATE public.profiles
     SET kyc = 'pending'::public.kyc_status,
         kyc_notes = NULL,
         kyc_reviewed_at = NULL,
         kyc_reviewed_by = NULL
   WHERE id = _uid;

  PERFORM set_config('app.kyc_self_service', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_own_kyc_pending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_own_kyc_pending() TO authenticated;

-- 4. Resubmission routine: member sends a rejected KYC back for review.
CREATE OR REPLACE FUNCTION public.resubmit_own_kyc(_note text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _uid uuid := auth.uid();
  _kyc public.kyc_status;
  _now timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT kyc INTO _kyc FROM public.profiles WHERE id = _uid;
  IF _kyc IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF _kyc <> 'rejected'::public.kyc_status THEN
    RAISE EXCEPTION 'not_rejected: only a rejected verification can be resubmitted'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.kyc_self_service', 'on', true);

  UPDATE public.profiles
     SET kyc = 'pending'::public.kyc_status,
         kyc_notes = NULLIF(btrim(COALESCE(_note, '')), ''),
         kyc_reviewed_at = NULL,
         kyc_reviewed_by = NULL,
         kyc_remediation_items = '[]'::jsonb,
         kyc_resubmitted_at = _now,
         kyc_submitted_at = _now
   WHERE id = _uid;

  PERFORM set_config('app.kyc_self_service', 'off', true);

  RETURN _now;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_own_kyc(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_own_kyc(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_own_kyc(text) TO service_role;