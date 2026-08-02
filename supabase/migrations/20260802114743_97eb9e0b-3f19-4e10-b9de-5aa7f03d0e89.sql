-- 1. Canonical comparison key: Ghana Card compares on digits only; every other
-- ID type compares on uppercase alphanumerics (spaces, dashes, dots, slashes
-- and underscores removed) so formatting can never hide a duplicate.
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
    ELSE COALESCE(_type, 'ghana_card') || ':' || regexp_replace(upper(_value), '[^0-9A-Z]', '', 'g')
  END
$$;

-- 2. Storage normalizer, mirroring src/lib/ghana-id-types.ts.
CREATE OR REPLACE FUNCTION public.normalize_national_id(_type text, _value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := upper(regexp_replace(COALESCE(_value, ''), '[[:space:]]', '', 'g'));
  compacted text;
  digits text;
BEGIN
  IF btrim(COALESCE(_value, '')) = '' THEN
    RETURN NULL;
  END IF;

  compacted := regexp_replace(v, '[-_./\\]', '', 'g');

  IF COALESCE(_type, 'ghana_card') = 'ghana_card' THEN
    -- Rebuild the canonical printed form when the input is digits (optionally
    -- GHA-prefixed); anything else stays as typed so validation can reject it.
    IF compacted ~ '^(GHA)?[0-9]+$' THEN
      digits := regexp_replace(compacted, '[^0-9]', '', 'g');
      IF length(digits) = 10 THEN
        RETURN 'GHA-' || substr(digits, 1, 9) || '-' || substr(digits, 10, 1);
      END IF;
    END IF;
    RETURN compacted;
  END IF;

  -- Digit-only documents.
  IF _type IN ('voter_id', 'nhis') THEN
    RETURN regexp_replace(v, '[^0-9]', '', 'g');
  END IF;

  -- Documents printed without separators.
  IF _type IN ('passport', 'ssnit', 'tin') THEN
    RETURN compacted;
  END IF;

  -- Remaining types legitimately contain dashes/slashes: trim + uppercase only.
  RETURN v;
END;
$$;

-- 3. Normalize on every write to profiles, regardless of the caller (app,
-- staff tools or direct SQL), so duplicate detection always compares canonical
-- values.
CREATE OR REPLACE FUNCTION public.profiles_normalize_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ghana_card := public.normalize_national_id('ghana_card', NEW.ghana_card);
  IF NEW.national_id IS NOT NULL THEN
    NEW.national_id := public.normalize_national_id(
      COALESCE(NEW.national_id_type, 'ghana_card'), NEW.national_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_normalize_ids_trg ON public.profiles;
CREATE TRIGGER profiles_normalize_ids_trg
BEFORE INSERT OR UPDATE OF ghana_card, national_id, national_id_type ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_normalize_ids();

CREATE OR REPLACE FUNCTION public.next_of_kin_normalize_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.national_id IS NOT NULL THEN
    NEW.national_id := public.normalize_national_id(
      COALESCE(NEW.national_id_type, 'ghana_card'), NEW.national_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS next_of_kin_normalize_ids_trg ON public.next_of_kin;
CREATE TRIGGER next_of_kin_normalize_ids_trg
BEFORE INSERT OR UPDATE OF national_id, national_id_type ON public.next_of_kin
FOR EACH ROW EXECUTE FUNCTION public.next_of_kin_normalize_ids();

-- 4. Backfill existing rows into canonical form (triggers do the work).
UPDATE public.profiles
   SET ghana_card = ghana_card
 WHERE ghana_card IS NOT NULL
   AND ghana_card <> public.normalize_national_id('ghana_card', ghana_card);

UPDATE public.profiles
   SET national_id = national_id
 WHERE national_id IS NOT NULL
   AND national_id <> public.normalize_national_id(COALESCE(national_id_type, 'ghana_card'), national_id);

UPDATE public.next_of_kin
   SET national_id = national_id
 WHERE national_id IS NOT NULL
   AND national_id <> public.normalize_national_id(COALESCE(national_id_type, 'ghana_card'), national_id);