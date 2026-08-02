-- Ledger of every automatic is_minor change
CREATE TABLE IF NOT EXISTS public.minor_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  was_minor boolean,
  is_minor boolean NOT NULL,
  previous_date_of_birth date,
  source_date_of_birth date,
  change_kind text NOT NULL CHECK (change_kind IN ('insert', 'update')),
  changed_by uuid,
  db_role text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS minor_status_changes_member_idx
  ON public.minor_status_changes (member_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS minor_status_changes_changed_at_idx
  ON public.minor_status_changes (changed_at DESC);

GRANT SELECT ON public.minor_status_changes TO authenticated;
GRANT ALL ON public.minor_status_changes TO service_role;

ALTER TABLE public.minor_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Compliance staff can read minor status changes"
  ON public.minor_status_changes FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'compliance_officer')
    OR private.has_role(auth.uid(), 'auditor')
  );

CREATE POLICY "Members can read their own minor status changes"
  ON public.minor_status_changes FOR SELECT TO authenticated
  USING (member_id = auth.uid());

-- Record the change inside the existing flag trigger
CREATE OR REPLACE FUNCTION public.profiles_set_minor_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_was boolean;
BEGIN
  IF NEW.date_of_birth IS NULL THEN
    NEW.is_minor := false;
  ELSE
    NEW.is_minor := NEW.date_of_birth > (current_date - INTERVAL '18 years');
  END IF;

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_minor_flag ON public.profiles;
CREATE TRIGGER trg_profiles_set_minor_flag
BEFORE INSERT OR UPDATE OF date_of_birth, is_minor ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_set_minor_flag();