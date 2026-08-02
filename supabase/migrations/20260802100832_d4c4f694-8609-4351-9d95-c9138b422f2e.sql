-- 1. Canonical key helper (digits only for Ghana Card, upper/stripped otherwise)
CREATE OR REPLACE FUNCTION public.national_id_key(_type text, _value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN COALESCE(_type, 'ghana_card') = 'ghana_card'
      THEN 'ghana_card:' || regexp_replace(upper(_value), '[^0-9]', '', 'g')
    ELSE COALESCE(_type, 'ghana_card') || ':' || regexp_replace(upper(_value), '\s', '', 'g')
  END
$$;

CREATE OR REPLACE FUNCTION public.canonical_ghana_card(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN length(regexp_replace(upper(_value), '[^0-9]', '', 'g')) = 10
      THEN 'GHA-' || substr(regexp_replace(upper(_value), '[^0-9]', '', 'g'), 1, 9)
           || '-' || substr(regexp_replace(upper(_value), '[^0-9]', '', 'g'), 10, 1)
    ELSE upper(btrim(_value))
  END
$$;

-- 2. Backfill existing rows to the canonical shape and mirror into national_id
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ghana_card_format_check;

UPDATE public.profiles
   SET ghana_card = public.canonical_ghana_card(ghana_card)
 WHERE ghana_card IS NOT NULL
   AND ghana_card <> public.canonical_ghana_card(ghana_card);

UPDATE public.profiles
   SET national_id = public.canonical_ghana_card(ghana_card),
       national_id_type = 'ghana_card'
 WHERE ghana_card IS NOT NULL
   AND (national_id IS NULL OR btrim(national_id) = '');

UPDATE public.profiles
   SET national_id = public.canonical_ghana_card(national_id)
 WHERE national_id IS NOT NULL
   AND COALESCE(national_id_type, 'ghana_card') = 'ghana_card'
   AND national_id <> public.canonical_ghana_card(national_id);

UPDATE public.next_of_kin
   SET national_id = public.canonical_ghana_card(national_id)
 WHERE national_id IS NOT NULL
   AND COALESCE(national_id_type, 'ghana_card') = 'ghana_card'
   AND national_id <> public.canonical_ghana_card(national_id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ghana_card_format_check
  CHECK (ghana_card IS NULL OR ghana_card ~ '^GHA-[0-9]{9}-[0-9]$');

-- 3. Rebuild uniqueness on the canonical key
DROP INDEX IF EXISTS public.profiles_national_id_type_unique;
DROP INDEX IF EXISTS public.profiles_ghana_card_uidx;

CREATE UNIQUE INDEX profiles_national_id_key_unique
  ON public.profiles (public.national_id_key(national_id_type, national_id))
  WHERE national_id IS NOT NULL AND btrim(national_id) <> '';

CREATE UNIQUE INDEX profiles_ghana_card_key_unique
  ON public.profiles (public.national_id_key('ghana_card', ghana_card))
  WHERE ghana_card IS NOT NULL AND btrim(ghana_card) <> '';

-- 4. Cross-column guard: one Ghana Card can only belong to one member,
--    whether captured at registration (ghana_card) or during KYC (national_id).
CREATE OR REPLACE FUNCTION public.profiles_guard_national_id_dup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _card_key text := public.national_id_key('ghana_card', NEW.ghana_card);
  _id_key text := public.national_id_key(NEW.national_id_type, NEW.national_id);
  _clash uuid;
BEGIN
  IF NEW.ghana_card IS NOT NULL AND NEW.national_id IS NOT NULL
     AND COALESCE(NEW.national_id_type, 'ghana_card') = 'ghana_card'
     AND _card_key <> _id_key THEN
    RAISE EXCEPTION 'Ghana Card on file (%) does not match the national ID number provided (%)',
      NEW.ghana_card, NEW.national_id
      USING ERRCODE = '23514';
  END IF;

  FOREACH _id_key IN ARRAY ARRAY[_card_key, public.national_id_key(NEW.national_id_type, NEW.national_id)] LOOP
    IF _id_key IS NULL THEN CONTINUE; END IF;
    SELECT p.id INTO _clash
      FROM public.profiles p
     WHERE p.id <> NEW.id
       AND (
         public.national_id_key('ghana_card', p.ghana_card) = _id_key
         OR public.national_id_key(p.national_id_type, p.national_id) = _id_key
       )
     LIMIT 1;
    IF _clash IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate key value: this national ID is already registered to another member'
        USING ERRCODE = '23505';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_national_id_dup_trg ON public.profiles;
CREATE TRIGGER profiles_guard_national_id_dup_trg
  BEFORE INSERT OR UPDATE OF ghana_card, national_id, national_id_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_national_id_dup();

-- 5. Registration availability: accept both formats, compare on digits,
--    and consider KYC national_id as well as the registration column.
CREATE OR REPLACE FUNCTION public.check_registration_availability(_ghana_card text, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _card text := NULLIF(btrim(_ghana_card), '');
  _tel text := NULLIF(btrim(_phone), '');
  _key text;
  _card_taken boolean := false;
  _phone_taken boolean := false;
BEGIN
  IF _card IS NOT NULL
     AND upper(_card) !~ '^GHA-[0-9]{10}$'
     AND upper(_card) !~ '^GHA-[0-9]{9}-[0-9]$' THEN
    RETURN jsonb_build_object('ghana_card_valid', false, 'ghana_card_taken', false, 'phone_taken', false);
  END IF;

  IF _card IS NOT NULL THEN
    _key := public.national_id_key('ghana_card', _card);
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE public.national_id_key('ghana_card', p.ghana_card) = _key
          OR public.national_id_key(p.national_id_type, p.national_id) = _key
    ) INTO _card_taken;
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
$$;

REVOKE ALL ON FUNCTION public.check_registration_availability(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_registration_availability(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.national_id_key(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_ghana_card(text) TO authenticated, service_role;