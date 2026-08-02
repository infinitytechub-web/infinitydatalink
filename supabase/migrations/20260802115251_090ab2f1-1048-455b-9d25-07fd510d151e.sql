-- Split the minor-flag trigger: computing the flag must stay BEFORE (it edits
-- NEW), but the audit ledger insert must run AFTER the profile row exists,
-- otherwise minor_status_changes.member_id fails its FK on INSERT and every new
-- registration with a date of birth is rejected.
CREATE OR REPLACE FUNCTION public.profiles_set_minor_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.date_of_birth IS NULL THEN
    NEW.is_minor := false;
  ELSE
    NEW.is_minor := NEW.date_of_birth > (current_date - INTERVAL '18 years');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profiles_log_minor_flag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_was boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_was := NULL;
  ELSE
    v_was := OLD.is_minor;
  END IF;

  IF v_was IS DISTINCT FROM NEW.is_minor THEN
    INSERT INTO public.minor_status_changes (
      member_id, was_minor, is_minor,
      previous_date_of_birth, source_date_of_birth,
      change_kind, changed_by, db_role
    ) VALUES (
      NEW.id, v_was, NEW.is_minor,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.date_of_birth ELSE NULL END,
      NEW.date_of_birth,
      lower(TG_OP), auth.uid(), current_user
    );
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_profiles_log_minor_flag_change ON public.profiles;
CREATE TRIGGER trg_profiles_log_minor_flag_change
AFTER INSERT OR UPDATE OF date_of_birth, is_minor ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_log_minor_flag_change();

REVOKE ALL ON FUNCTION public.profiles_log_minor_flag_change() FROM PUBLIC, anon, authenticated;