-- 1. Profile location / ID / age columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS national_id_type text,
  ADD COLUMN IF NOT EXISTS is_minor boolean NOT NULL DEFAULT false;

ALTER TABLE public.next_of_kin
  ADD COLUMN IF NOT EXISTS relationship_code text,
  ADD COLUMN IF NOT EXISTS national_id_type text;

-- 2. Under-18 flag maintained from date_of_birth (never client controlled)
CREATE OR REPLACE FUNCTION public.profiles_set_minor_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.date_of_birth IS NULL THEN
    NEW.is_minor := false;
  ELSE
    NEW.is_minor := NEW.date_of_birth > (current_date - INTERVAL '18 years');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_minor_flag ON public.profiles;
CREATE TRIGGER trg_profiles_set_minor_flag
BEFORE INSERT OR UPDATE OF date_of_birth, is_minor ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_set_minor_flag();

UPDATE public.profiles
SET is_minor = (date_of_birth IS NOT NULL AND date_of_birth > (current_date - INTERVAL '18 years'));

-- 3. Duplicate national ID prevention (per ID type)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_national_id_type_unique
  ON public.profiles (coalesce(national_id_type, 'ghana_card'), upper(regexp_replace(national_id, '\s', '', 'g')))
  WHERE national_id IS NOT NULL AND btrim(national_id) <> '';

-- 4. Admin-managed relationship types
CREATE TABLE IF NOT EXISTS public.relationship_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.relationship_types TO authenticated;
GRANT ALL ON public.relationship_types TO service_role;

ALTER TABLE public.relationship_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "relationship_types_read_authenticated" ON public.relationship_types;
CREATE POLICY "relationship_types_read_authenticated"
ON public.relationship_types FOR SELECT TO authenticated
USING (true);

DROP TRIGGER IF EXISTS trg_relationship_types_updated_at ON public.relationship_types;
CREATE TRIGGER trg_relationship_types_updated_at
BEFORE UPDATE ON public.relationship_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.relationship_types (code, label, sort_order) VALUES
  ('father', 'Father', 10),
  ('mother', 'Mother', 20),
  ('brother', 'Brother', 30),
  ('sister', 'Sister', 40),
  ('husband', 'Husband', 50),
  ('wife', 'Wife', 60),
  ('spouse', 'Spouse', 70),
  ('son', 'Son', 80),
  ('daughter', 'Daughter', 90),
  ('guardian', 'Guardian', 100),
  ('other', 'Other', 999)
ON CONFLICT (code) DO NOTHING;