
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.user_roles SET granted_at = created_at WHERE granted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.super_admin_seed_emails (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.super_admin_seed_emails TO authenticated;
GRANT ALL ON public.super_admin_seed_emails TO service_role;

ALTER TABLE public.super_admin_seed_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin manages seed emails" ON public.super_admin_seed_emails;
CREATE POLICY "super_admin manages seed emails"
  ON public.super_admin_seed_emails FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.super_admin_seed_emails (email, note)
VALUES ('eagleeye.techub@gmail.com', 'Initial super admin seed')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _target_id UUID := COALESCE(NEW.user_id, OLD.user_id);
  _caller UUID := auth.uid();
  _target_email TEXT;
  _is_seeded BOOLEAN := FALSE;
  _target_role public.app_role := COALESCE(NEW.role, OLD.role);
BEGIN
  IF _target_role IS DISTINCT FROM 'super_admin'::public.app_role THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND _caller = _target_id THEN
    SELECT lower(u.email) INTO _target_email FROM auth.users u
      WHERE u.id = _target_id AND u.email_confirmed_at IS NOT NULL;
    IF _target_email IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.super_admin_seed_emails s WHERE s.email = _target_email
      ) INTO _is_seeded;
      IF _is_seeded THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'forbidden: super_admin role changes require an existing super_admin'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_super_admin_role_ins ON public.user_roles;
CREATE TRIGGER guard_super_admin_role_ins
  BEFORE INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_super_admin_role();

CREATE OR REPLACE FUNCTION public.grant_super_admin_by_email(_email TEXT, _note TEXT DEFAULT NULL)
RETURNS TABLE(user_id UUID, email TEXT, granted_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _caller UUID := auth.uid();
  _actor_email TEXT;
  _target public.user_roles%ROWTYPE;
  _target_id UUID;
  _target_email TEXT;
  _seeded BOOLEAN;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT id, lower(email) INTO _target_id, _target_email
    FROM auth.users WHERE lower(email) = lower(_email) AND email_confirmed_at IS NOT NULL;
  IF _target_id IS NULL THEN RAISE EXCEPTION 'user_not_found_or_unconfirmed'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.super_admin_seed_emails s WHERE s.email = _target_email
  ) INTO _seeded;
  IF NOT _seeded THEN
    INSERT INTO public.super_admin_seed_emails (email, note, created_by)
    VALUES (_target_email, COALESCE(_note, 'Granted via admin console'), _caller);
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (_target_id, 'super_admin'::public.app_role, _caller)
  ON CONFLICT (user_id, role) DO UPDATE SET granted_at = now(), granted_by = _caller
  RETURNING * INTO _target;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'role.super_admin.grant', _target_id::text,
          jsonb_build_object('email', _target_email, 'note', _note));

  RETURN QUERY SELECT _target.user_id, _target_email, _target.granted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_super_admin_by_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_super_admin_by_email(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_super_admin(_user_id UUID, _reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _caller UUID := auth.uid();
  _remaining INT;
  _actor_email TEXT;
  _target_email TEXT;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required' USING ERRCODE = '42501';
  END IF;
  IF _user_id = _caller THEN
    RAISE EXCEPTION 'cannot_revoke_self' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO _remaining FROM public.user_roles
    WHERE role = 'super_admin'::public.app_role AND user_id <> _user_id;
  IF _remaining < 1 THEN
    RAISE EXCEPTION 'last_super_admin' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::public.app_role;

  SELECT lower(email) INTO _target_email FROM auth.users WHERE id = _user_id;
  DELETE FROM public.super_admin_seed_emails WHERE email = _target_email;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'role.super_admin.revoke', _user_id::text,
          jsonb_build_object('email', _target_email, 'reason', _reason));
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_super_admin(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_super_admin(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_super_admins()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  full_name TEXT,
  member_no TEXT,
  granted_at TIMESTAMPTZ,
  granted_by UUID,
  granted_by_email TEXT,
  seeded BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _caller UUID := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ur.user_id,
         u.email::text,
         p.full_name,
         p.member_no,
         ur.granted_at,
         ur.granted_by,
         gu.email::text,
         EXISTS (SELECT 1 FROM public.super_admin_seed_emails s WHERE s.email = lower(u.email))
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    LEFT JOIN auth.users gu ON gu.id = ur.granted_by
   WHERE ur.role = 'super_admin'::public.app_role
   ORDER BY ur.granted_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_super_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_super_admins() TO authenticated;
