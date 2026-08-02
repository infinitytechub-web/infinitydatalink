ALTER TABLE public.kyc_resubmission_settings
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_lead_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS low_attempts_threshold integer NOT NULL DEFAULT 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_deadline_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_final_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_low_attempts_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_deadline_expired_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.run_kyc_resubmission_reminders()
RETURNS TABLE (deadline_soon integer, final_day integer, low_attempts integer, expired integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.kyc_resubmission_settings%ROWTYPE;
  r record;
  n_soon integer := 0;
  n_final integer := 0;
  n_low integer := 0;
  n_exp integer := 0;
  _left integer;
BEGIN
  SELECT * INTO s FROM public.kyc_resubmission_settings LIMIT 1;
  IF NOT FOUND THEN
    s.reminder_enabled := true; s.reminder_lead_days := 3;
    s.low_attempts_threshold := 1; s.max_attempts := 3;
  END IF;

  IF NOT COALESCE(s.reminder_enabled, true) THEN
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  FOR r IN
    SELECT p.id, p.kyc_resubmission_deadline AS deadline, p.kyc_attempts,
           p.kyc_deadline_reminded_at, p.kyc_final_reminded_at,
           p.kyc_low_attempts_reminded_at, p.kyc_deadline_expired_notified_at
      FROM public.profiles p
     WHERE p.kyc = 'rejected'::public.kyc_status
       AND p.kyc_resubmission_deadline IS NOT NULL
  LOOP
    _left := GREATEST(COALESCE(s.max_attempts, 3) - COALESCE(r.kyc_attempts, 0), 0);

    -- Deadline already passed: one closing notice.
    IF r.deadline < now() THEN
      IF r.kyc_deadline_expired_notified_at IS NULL
         OR r.kyc_deadline_expired_notified_at < r.deadline THEN
        PERFORM public.notify_user(r.id, 'kyc.resubmission.expired',
          'KYC resubmission window closed',
          'The deadline to resubmit your verification details passed on '
            || to_char(r.deadline, 'DD Mon YYYY') || '. Contact support to reopen your review.',
          '/app/kyc',
          jsonb_build_object('deadline', r.deadline, 'attempts_left', _left),
          'kyc-expired:' || r.id || ':' || to_char(r.deadline, 'YYYYMMDDHH24MI'));
        UPDATE public.profiles SET kyc_deadline_expired_notified_at = now() WHERE id = r.id;
        n_exp := n_exp + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Final day notice.
    IF r.deadline <= now() + interval '24 hours' THEN
      IF r.kyc_final_reminded_at IS NULL OR r.kyc_final_reminded_at < r.deadline - interval '24 hours' THEN
        PERFORM public.notify_user(r.id, 'kyc.resubmission.final_notice',
          'Last day to resubmit your KYC',
          'Your verification resubmission is due by '
            || to_char(r.deadline, 'DD Mon YYYY HH24:MI')
            || '. Submit the requested items today to keep your application open.',
          '/app/kyc',
          jsonb_build_object('deadline', r.deadline, 'attempts_left', _left),
          'kyc-final:' || r.id || ':' || to_char(r.deadline, 'YYYYMMDDHH24MI'));
        UPDATE public.profiles SET kyc_final_reminded_at = now() WHERE id = r.id;
        n_final := n_final + 1;
      END IF;

    -- Approaching deadline notice.
    ELSIF r.deadline <= now() + (GREATEST(COALESCE(s.reminder_lead_days, 3), 0) || ' days')::interval THEN
      IF r.kyc_deadline_reminded_at IS NULL
         OR r.kyc_deadline_reminded_at < r.deadline - (GREATEST(COALESCE(s.reminder_lead_days, 3), 0) || ' days')::interval THEN
        PERFORM public.notify_user(r.id, 'kyc.resubmission.deadline_soon',
          'KYC resubmission due ' || to_char(r.deadline, 'DD Mon YYYY'),
          'You have until ' || to_char(r.deadline, 'DD Mon YYYY')
            || ' to resubmit the items compliance asked for.',
          '/app/kyc',
          jsonb_build_object('deadline', r.deadline, 'attempts_left', _left),
          'kyc-deadline:' || r.id || ':' || to_char(r.deadline, 'YYYYMMDDHH24MI'));
        UPDATE public.profiles SET kyc_deadline_reminded_at = now() WHERE id = r.id;
        n_soon := n_soon + 1;
      END IF;
    END IF;

    -- Low remaining attempts warning (once per attempt count).
    IF _left > 0 AND _left <= GREATEST(COALESCE(s.low_attempts_threshold, 1), 0) THEN
      IF r.kyc_low_attempts_reminded_at IS NULL
         OR r.kyc_low_attempts_reminded_at < now() - interval '20 hours' THEN
        PERFORM public.notify_user(r.id, 'kyc.resubmission.low_attempts',
          CASE WHEN _left = 1 THEN 'One resubmission attempt left'
               ELSE _left || ' resubmission attempts left' END,
          'Please review the requested items carefully before resubmitting — you have '
            || _left || ' attempt(s) remaining out of ' || COALESCE(s.max_attempts, 3) || '.',
          '/app/kyc',
          jsonb_build_object('attempts_left', _left, 'max_attempts', COALESCE(s.max_attempts, 3)),
          'kyc-low-attempts:' || r.id || ':' || COALESCE(r.kyc_attempts, 0));
        UPDATE public.profiles SET kyc_low_attempts_reminded_at = now() WHERE id = r.id;
        n_low := n_low + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT n_soon, n_final, n_low, n_exp;
END;
$$;

REVOKE ALL ON FUNCTION public.run_kyc_resubmission_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_kyc_resubmission_reminders() FROM anon;
REVOKE ALL ON FUNCTION public.run_kyc_resubmission_reminders() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_kyc_resubmission_reminders() TO service_role;