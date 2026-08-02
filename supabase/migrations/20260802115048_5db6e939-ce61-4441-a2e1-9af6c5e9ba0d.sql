-- Registry of canonical national-ID keys. One key can belong to exactly one
-- member, which makes duplicate detection atomic (index-enforced) instead of
-- read-then-write and therefore safe under concurrent registrations.
CREATE TABLE IF NOT EXISTS public.national_id_claims (
  id_key text PRIMARY KEY,
  member_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('ghana_card', 'national_id')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Internal integrity table: no client access at all; the maintaining trigger is
-- SECURITY DEFINER and admin tooling uses service_role.
GRANT ALL ON public.national_id_claims TO service_role;
ALTER TABLE public.national_id_claims ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS national_id_claims_member_idx
  ON public.national_id_claims (member_id);

-- Per-column expression unique indexes on the normalized form.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_ghana_card_key_uidx
  ON public.profiles (public.national_id_key('ghana_card', ghana_card))
  WHERE ghana_card IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_national_id_key_uidx
  ON public.profiles (public.national_id_key(COALESCE(national_id_type, 'ghana_card'), national_id))
  WHERE national_id IS NOT NULL;

-- Backfill the registry from existing rows (skip pre-existing duplicates so the
-- migration cannot fail on legacy data; the unique indexes above would have
-- already surfaced them).
INSERT INTO public.national_id_claims (id_key, member_id, source)
SELECT DISTINCT ON (k) k, id, src
  FROM (
    SELECT id, public.national_id_key('ghana_card', ghana_card) AS k, 'ghana_card' AS src
      FROM public.profiles WHERE ghana_card IS NOT NULL
    UNION ALL
    SELECT id, public.national_id_key(COALESCE(national_id_type, 'ghana_card'), national_id) AS k,
           'national_id' AS src
      FROM public.profiles WHERE national_id IS NOT NULL
  ) s
 WHERE k IS NOT NULL
 ORDER BY k, id
ON CONFLICT (id_key) DO NOTHING;

-- Keep the registry in step with every profile write. Runs AFTER the
-- normalization trigger, so only canonical keys are ever claimed.
CREATE OR REPLACE FUNCTION public.profiles_sync_national_id_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _keys text[];
  _srcs text[];
  _key text;
  _src text;
  _owner uuid;
  i int;
BEGIN
  _keys := ARRAY[
    public.national_id_key('ghana_card', NEW.ghana_card),
    public.national_id_key(COALESCE(NEW.national_id_type, 'ghana_card'), NEW.national_id)
  ];
  _srcs := ARRAY['ghana_card', 'national_id'];

  -- Drop claims this member no longer holds.
  DELETE FROM public.national_id_claims c
   WHERE c.member_id = NEW.id
     AND NOT (c.id_key = ANY (ARRAY(SELECT x FROM unnest(_keys) x WHERE x IS NOT NULL)));

  FOR i IN 1..array_length(_keys, 1) LOOP
    _key := _keys[i];
    _src := _srcs[i];
    CONTINUE WHEN _key IS NULL;

    SELECT member_id INTO _owner FROM public.national_id_claims WHERE id_key = _key;
    IF _owner IS NOT NULL THEN
      IF _owner <> NEW.id THEN
        RAISE EXCEPTION 'This national ID number is already registered to another member.'
          USING ERRCODE = '23505';
      END IF;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.national_id_claims (id_key, member_id, source)
      VALUES (_key, NEW.id, _src);
    EXCEPTION WHEN unique_violation THEN
      -- Lost a concurrent race: the winning transaction claimed this key first.
      SELECT member_id INTO _owner FROM public.national_id_claims WHERE id_key = _key;
      IF _owner IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION 'This national ID number is already registered to another member.'
          USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_national_id_claims_trg ON public.profiles;
CREATE TRIGGER profiles_sync_national_id_claims_trg
AFTER INSERT OR UPDATE OF ghana_card, national_id, national_id_type ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_national_id_claims();

-- Release claims when a member row is removed.
CREATE OR REPLACE FUNCTION public.profiles_release_national_id_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.national_id_claims WHERE member_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profiles_release_national_id_claims_trg ON public.profiles;
CREATE TRIGGER profiles_release_national_id_claims_trg
AFTER DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_release_national_id_claims();

REVOKE ALL ON FUNCTION public.profiles_sync_national_id_claims() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_release_national_id_claims() FROM PUBLIC, anon, authenticated;