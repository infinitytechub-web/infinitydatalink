-- 1) Shared settings for KYC resubmission windows and attempt limits
CREATE TABLE IF NOT EXISTS public.kyc_resubmission_settings (
  id boolean PRIMARY KEY DEFAULT true,
  deadline_days integer NOT NULL DEFAULT 14,
  max_attempts integer NOT NULL DEFAULT 3,
  enforce_deadline boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kyc_resubmission_settings_singleton CHECK (id),
  CONSTRAINT kyc_resubmission_deadline_days_range CHECK (deadline_days BETWEEN 1 AND 365),
  CONSTRAINT kyc_resubmission_max_attempts_range CHECK (max_attempts BETWEEN 1 AND 20)
);

GRANT SELECT ON public.kyc_resubmission_settings TO authenticated;
GRANT ALL ON public.kyc_resubmission_settings TO service_role;

ALTER TABLE public.kyc_resubmission_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_resub_settings_read" ON public.kyc_resubmission_settings;
CREATE POLICY "kyc_resub_settings_read"
  ON public.kyc_resubmission_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "kyc_resub_settings_write" ON public.kyc_resubmission_settings;
CREATE POLICY "kyc_resub_settings_write"
  ON public.kyc_resubmission_settings
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'compliance_officer'::public.app_role)
  );

DROP TRIGGER IF EXISTS kyc_resubmission_settings_touch ON public.kyc_resubmission_settings;
CREATE TRIGGER kyc_resubmission_settings_touch
  BEFORE UPDATE ON public.kyc_resubmission_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.kyc_resubmission_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- 2) Per-member deadline / attempt tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_resubmission_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kyc_max_attempts integer;

-- 3) Resubmission now enforces the window and the attempt allowance
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
  _deadline timestamptz;
  _attempts integer;
  _limit integer;
  _enforce boolean;
  _default_limit integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT kyc, kyc_resubmission_deadline, COALESCE(kyc_attempts, 0), kyc_max_attempts
    INTO _kyc, _deadline, _attempts, _limit
    FROM public.profiles
   WHERE id = _uid;

  IF _kyc IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF _kyc <> 'rejected'::public.kyc_status THEN
    RAISE EXCEPTION 'not_rejected: only a rejected verification can be resubmitted'
      USING ERRCODE = '42501';
  END IF;

  SELECT enforce_deadline, max_attempts INTO _enforce, _default_limit
    FROM public.kyc_resubmission_settings WHERE id;
  _enforce := COALESCE(_enforce, true);
  _limit := COALESCE(_limit, _default_limit, 3);

  IF _enforce AND _deadline IS NOT NULL AND _now > _deadline THEN
    RAISE EXCEPTION 'resubmission_window_closed: the resubmission deadline has passed; contact support'
      USING ERRCODE = '42501';
  END IF;

  IF _attempts >= _limit THEN
    RAISE EXCEPTION 'resubmission_limit_reached: you have used all % resubmission attempts; contact support', _limit
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
         kyc_submitted_at = _now,
         kyc_attempts = _attempts + 1,
         kyc_resubmission_deadline = NULL
   WHERE id = _uid;

  PERFORM set_config('app.kyc_self_service', 'off', true);

  RETURN _now;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_own_kyc(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_own_kyc(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_own_kyc(text) TO service_role;

-- 4) A fresh self-service reset starts a clean attempt history
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
         kyc_reviewed_at = NULL,
         kyc_reviewed_by = NULL,
         kyc_submitted_at = now(),
         kyc_remediation_items = '[]'::jsonb,
         kyc_attempts = 0,
         kyc_max_attempts = NULL,
         kyc_resubmission_deadline = NULL
   WHERE id = _uid;

  PERFORM set_config('app.kyc_self_service', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_own_kyc_pending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_own_kyc_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_own_kyc_pending() TO service_role;
