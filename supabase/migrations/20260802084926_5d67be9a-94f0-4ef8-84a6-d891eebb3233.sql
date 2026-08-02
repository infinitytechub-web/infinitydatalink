-- 1. New profile columns -------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS ghana_card text,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_membership_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_membership_type_check
  CHECK (membership_type IN ('individual','group','department','institution'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ghana_card_format_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ghana_card_format_check
  CHECK (ghana_card IS NULL OR ghana_card ~ '^GHA-[0-9]{10}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_ghana_card_uidx
  ON public.profiles (ghana_card) WHERE ghana_card IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_uidx
  ON public.profiles (phone) WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS profiles_membership_type_idx
  ON public.profiles (membership_type);

-- 2. Capture registration biodata on signup -----------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_no INT;
  _card text := NULLIF(trim(NEW.raw_user_meta_data->>'ghana_card'), '');
  _phone text := NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '');
  _mtype text := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'membership_type'), ''), 'individual');
BEGIN
  IF _card IS NOT NULL AND _card !~ '^GHA-[0-9]{10}$' THEN
    _card := NULL;
  END IF;
  IF _mtype NOT IN ('individual','group','department','institution') THEN
    _mtype := 'individual';
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(member_no, '\D', '', 'g'), '')::INT), 0) + 1
    INTO next_no FROM public.profiles;

  INSERT INTO public.profiles (id, full_name, member_no, ghana_card, national_id, phone, membership_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    'MB-' || lpad(next_no::text, 5, '0'),
    _card,
    _card,
    _phone,
    _mtype
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3. Freeze identity columns for self-service edits ----------------------
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
  -- Ghana Card is registration biodata: immutable once captured.
  IF OLD.ghana_card IS NOT NULL THEN
    NEW.ghana_card := OLD.ghana_card;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Pre-signup duplicate check (no PII returned) ------------------------
CREATE OR REPLACE FUNCTION public.check_registration_availability(_ghana_card text, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _card text := NULLIF(trim(_ghana_card), '');
  _tel text := NULLIF(trim(_phone), '');
  _card_taken boolean := false;
  _phone_taken boolean := false;
BEGIN
  IF _card IS NOT NULL AND _card !~ '^GHA-[0-9]{10}$' THEN
    RETURN jsonb_build_object('ghana_card_valid', false, 'ghana_card_taken', false, 'phone_taken', false);
  END IF;

  IF _card IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE ghana_card = _card) INTO _card_taken;
  END IF;
  IF _tel IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE phone = _tel) INTO _phone_taken;
  END IF;

  RETURN jsonb_build_object(
    'ghana_card_valid', true,
    'ghana_card_taken', _card_taken,
    'phone_taken', _phone_taken
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.check_registration_availability(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_registration_availability(text, text) TO anon, authenticated, service_role;